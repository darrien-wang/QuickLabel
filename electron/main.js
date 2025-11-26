const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ptp = require('pdf-to-printer');

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
        if (fs.existsSync(pdfPath)) {
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