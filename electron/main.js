const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ptp = require('pdf-to-printer');
const { google } = require('googleapis');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Check if we are in development (look for env var or fallback)
  const isDev = !app.isPackaged;

  if (isDev) {
    // If you run 'npm run electron:dev'
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools
    // mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  // Handle window close event - prompt to save if there are pending changes
  mainWindow.on('close', async (event) => {
    // Prevent default close behavior
    event.preventDefault();

    // Ask renderer process if there are pending changes
    const response = await mainWindow.webContents.executeJavaScript(`
      (function() {
        // Check if there are any Google Sheets batches with scanned records
        const batches = JSON.parse(localStorage.getItem('ql_batches') || '[]');
        const googleSheetsBatches = batches.filter(b => b.source === 'google-sheets');
        const hasScannedRecords = googleSheetsBatches.some(b => 
          b.records && b.records.some(r => r.scanned)
        );
        return hasScannedRecords;
      })()
    `);

    // Helper function to clear all scan statuses
    const clearScanCache = async () => {
      await mainWindow.webContents.executeJavaScript(`
        (function() {
          // Clear all scan statuses from batches
          const batches = JSON.parse(localStorage.getItem('ql_batches') || '[]');
          const clearedBatches = batches.map(b => ({
            ...b,
            records: b.records.map(r => ({ ...r, scanned: false, scannedAt: undefined }))
          }));
          localStorage.setItem('ql_batches', JSON.stringify(clearedBatches));
          console.log('Scan cache cleared');
        })()
      `);
    };

    if (response) {
      // Show dialog asking if user wants to save
      const { dialog } = require('electron');
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['保存并退出', '不保存退出', '取消'],
        defaultId: 0,
        title: '保存扫描结果',
        message: '您有未同步到 Google Sheets 的扫描记录',
        detail: '是否要在退出前同步到 Google Sheets？\n\n注意：关闭应用后，扫描缓存将被清空。'
      });

      if (choice.response === 0) {
        // User chose to save - trigger sync, then clear cache and close
        mainWindow.webContents.send('sync-before-close');

        // Wait for sync completion event
        const syncCompleteHandler = async () => {
          await clearScanCache();
          mainWindow.destroy();
        };

        // Listen for sync completion (with timeout fallback)
        ipcMain.once('sync-complete', syncCompleteHandler);

        // Fallback: close after 30 seconds if sync doesn't complete
        setTimeout(async () => {
          ipcMain.removeListener('sync-complete', syncCompleteHandler);
          await clearScanCache();
          mainWindow.destroy();
        }, 30000);
      } else if (choice.response === 1) {
        // User chose not to save - clear cache and close immediately
        await mainWindow.webContents.executeJavaScript(`
          (function() {
            // Clear all scan statuses from batches
            const batches = JSON.parse(localStorage.getItem('ql_batches') || '[]');
            const clearedBatches = batches.map(b => ({
              ...b,
              records: b.records.map(r => ({ ...r, scanned: false, scannedAt: undefined }))
            }));
            localStorage.setItem('ql_batches', JSON.stringify(clearedBatches));
          })()
        `);
        mainWindow.destroy();
      }
      // If choice.response === 2 (Cancel), do nothing (window stays open)
    } else {
      // No pending changes, close immediately
      mainWindow.destroy();
    }
  });
}

// IPC Listener for Printing
ipcMain.on('print-label', (event, imgData) => {
  // Create a hidden window for printing
  let printWindow = new BrowserWindow({ show: false });

  printWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
      <head>
        <style>
          @page {
            size: 100mm 150mm;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100mm;
            height: 150mm;
          }
          img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            max-width: 100mm;
            max-height: 150mm;
          }
        </style>
      </head>
      <body>
        <img src="${imgData}">
      </body>
    </html>`
  );

  printWindow.webContents.on('did-finish-load', () => {
    // Silent Print with custom page settings
    printWindow.webContents.print({
      silent: true,
      printBackground: true,
      deviceName: '', // Empty string = Default printer
      pageSize: {
        width: 100000, // 100mm in microns (100mm * 1000)
        height: 150000 // 150mm in microns (150mm * 1000)
      },
      margins: {
        marginType: 'none' // No margins
      }
    }, (success, errorType) => {
      if (!success) {
        console.log("Print failed:", errorType);
      }
      // Close the print window after printing
      printWindow.close();
    });
  });
});

// IPC Listener for HTML to PDF Printing (Silent)
ipcMain.on('print-html', async (event, htmlContent) => {
  let printWindow = null;
  let pdfPath = null;

  try {
    // 1. Create a hidden window to render the HTML
    printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 1200,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // 2. Load the HTML content
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    // 3. Wait for all resources (Tailwind CSS, fonts, images) to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Generate PDF from the rendered HTML
    const pdfData = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: {
        width: 100000, // 100mm in microns
        height: 150000 // 150mm in microns
      },
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      },
      landscape: false,
      preferCSSPageSize: true
    });

    // 5. Save PDF to temporary file
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    pdfPath = path.join(tempDir, `label_${timestamp}.pdf`);
    fs.writeFileSync(pdfPath, pdfData);

    console.log(`PDF saved to: ${pdfPath}`);

    // 6. Close the render window
    printWindow.close();
    printWindow = null;

    // 7. Print the PDF using default printer (silent)
    await ptp.print(pdfPath, {
      silent: true,
      // You can specify printer name if needed: printer: 'Printer Name'
    });

    console.log('PDF printed successfully');

    // 8. Wait a bit then delete the temporary PDF
    setTimeout(() => {
      try {
        if (pdfPath && fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
          console.log(`Temporary PDF deleted: ${pdfPath}`);
        }
      } catch (deleteErr) {
        console.error('Failed to delete temporary PDF:', deleteErr);
      }
    }, 3000); // Wait 3 seconds before deleting

  } catch (error) {
    console.error('PDF Print failed:', error);
    // Cleanup on error
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.close();
    }

    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch (deleteErr) {
        console.error('Failed to delete PDF after error:', deleteErr);
      }
    }
  }
});

//  === Google Sheets IPC Handlers ===

// IPC Handler: Fetch Google Sheets Data
ipcMain.handle('fetch-google-sheets', async (event, { spreadsheetId, sheetName, credentials }) => {
  try {
    // 使用 GoogleAuth 创建认证实例
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    // Wrap sheet name in single quotes to handle spaces and special characters
    const range = `'${sheetName}'!A1:ZZ`;
    console.log('Fetching Google Sheets:', { spreadsheetId, sheetName, range });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const values = response.data.values || [];

    console.log('Raw Google Sheets Values:', {
      length: values.length,
      firstRow: values[0],
      secondRow: values[1]
    });

    if (values.length === 0) {
      throw new Error('Google Sheets 中没有数据');
    }

    // Find header row
    let headerRowIndex = 0;
    let headers = [];

    // Scan first 20 rows for a valid header
    const headerKeywords = ['order id', 'tracking', 'stop number', '订单', 'id', 'customer'];

    const foundHeaderIndex = values.findIndex((row, index) => {
      if (index > 20) return false; // Limit scan depth
      const rowString = row.join(' ').toLowerCase();
      return headerKeywords.some(keyword => rowString.includes(keyword));
    });

    if (foundHeaderIndex !== -1) {
      headerRowIndex = foundHeaderIndex;
      headers = values[headerRowIndex];
      console.log(`Found headers at row ${headerRowIndex + 1}:`, headers);
    } else {
      // Fallback to first row
      headers = values[0];
      console.log('Could not detect header row, using first row');
    }

    const dataRows = values.slice(headerRowIndex + 1);

    // Convert to structured data
    const structuredData = dataRows.map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });

    return {
      headers,
      data: structuredData,
      spreadsheetId,
      sheetName,
    };
  } catch (err) {
    console.error('Fetch Google Sheets error:', err);
    throw new Error(`连接 Google Sheets 失败: ${err.message}`);
  }
});

// IPC Handler: Fetch All Google Sheets Data
ipcMain.handle('fetch-all-google-sheets', async (event, { spreadsheetId, credentials }) => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Get spreadsheet metadata to find all sheets
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetList = meta.data.sheets || [];
    if (sheetList.length === 0) {
      throw new Error('Spreadsheet contains no sheets');
    }

    let allData = [];
    let combinedHeaders = null;

    console.log(`Found ${sheetList.length} sheets. Fetching data...`);

    // 2. Iterate and fetch data for each sheet
    for (const sheet of sheetList) {
      const sheetName = sheet.properties.title;
      console.log(`Fetching sheet: ${sheetName}`);

      try {
        const range = `'${sheetName}'!A1:ZZ`;
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
        });

        const values = response.data.values || [];
        if (values.length === 0) continue;

        // Header detection (reuse logic)
        let headerRowIndex = 0;
        let headers = [];
        const headerKeywords = ['order id', 'tracking', 'stop number', '订单', 'id', 'customer'];

        const foundHeaderIndex = values.findIndex((row, index) => {
          if (index > 20) return false;
          const rowString = row.join(' ').toLowerCase();
          return headerKeywords.some(keyword => rowString.includes(keyword));
        });

        if (foundHeaderIndex !== -1) {
          headerRowIndex = foundHeaderIndex;
          headers = values[headerRowIndex];
        } else {
          headers = values[0];
        }

        // Use the first valid headers found as the "master" headers for the batch
        if (!combinedHeaders && headers.length > 0) {
          combinedHeaders = headers;
        }

        const dataRows = values.slice(headerRowIndex + 1);

        // Map to objects
        const sheetData = dataRows.map(row => {
          const obj = { _sheetName: sheetName }; // Tag with sheet name
          headers.forEach((header, index) => {
            obj[header] = row[index] || '';
          });
          return obj;
        });

        allData = [...allData, ...sheetData];

      } catch (sheetErr) {
        console.error(`Failed to fetch sheet ${sheetName}:`, sheetErr);
        // Continue to next sheet
      }
    }

    if (allData.length === 0) {
      throw new Error('No data found in any sheets');
    }

    return {
      headers: combinedHeaders || [],
      data: allData,
      spreadsheetId,
      isMultiSheet: true
    };

  } catch (err) {
    console.error('Fetch All Google Sheets error:', err);
    throw new Error(`连接 Google Sheets 失败: ${err.message}`);
  }
});

// IPC Handler: Update Scan Status in Google Sheets
ipcMain.handle('update-scan-status', async (event, { spreadsheetId, sheetName, rowIndex, scanned, credentials, scannedColumnName = 'ScannedAt', orderId, primaryKeyColumn }) => {
  try {
    // 使用 GoogleAuth 创建认证实例
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Get all data from the sheet to find the correct row
    const range = `'${sheetName}'!A1:ZZ`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const values = response.data.values || [];
    if (values.length === 0) {
      throw new Error('Sheet is empty');
    }

    // Find header row
    const headerKeywords = ['order id', 'tracking', 'stop number', '订单', 'id', 'customer'];
    const foundHeaderIndex = values.findIndex((row, index) => {
      if (index > 20) return false;
      const rowString = row.join(' ').toLowerCase();
      return headerKeywords.some(keyword => rowString.includes(keyword));
    });

    const headerRowIndex = foundHeaderIndex !== -1 ? foundHeaderIndex : 0;
    const headers = values[headerRowIndex];

    // Find the primary key column index
    const pkColIndex = headers.findIndex(h => h === primaryKeyColumn);
    if (pkColIndex === -1) {
      throw new Error(`Primary key column "${primaryKeyColumn}" not found`);
    }

    // Find the row with matching Order ID
    let targetRowIndex = -1;
    for (let i = headerRowIndex + 1; i < values.length; i++) {
      if (values[i][pkColIndex] === orderId) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      throw new Error(`Order ID "${orderId}" not found in sheet`);
    }

    // Find or create ScannedAt column
    let scannedAtColIndex = headers.findIndex((h) => h === scannedColumnName);

    if (scannedAtColIndex === -1) {
      scannedAtColIndex = headers.length;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!${getColumnLetter(scannedAtColIndex)}${headerRowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[scannedColumnName]],
        },
      });
    }

    // Update the ScannedAt cell with timestamp
    const cellRow = targetRowIndex + 1; // Convert to 1-based index
    const cellRange = `'${sheetName}'!${getColumnLetter(scannedAtColIndex)}${cellRow}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: cellRange,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[scanned ? new Date().toISOString() : '']],
      },
    });

    console.log(`✅ 已同步扫描时间到 Google Sheets: 行 ${cellRow}, Order ID: ${orderId}, 时间: ${scanned ? new Date().toISOString() : '清空'}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ 更新扫描状态失败:`, err);
    throw new Error(`更新 Google Sheets 失败: ${err.message}`);
  }
});

/**
 * Convert column index to letter (0 -> A, 1 -> B, 26 -> AA, etc.)
 */
function getColumnLetter(index) {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});