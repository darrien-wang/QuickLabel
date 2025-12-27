import React, { useState, useEffect } from 'react';
import { Layout, FileSpreadsheet, Settings, Printer, List, Upload, Trash2, Plus, ArrowRight, Download, Link as LinkIcon } from 'lucide-react';
import { parseExcelFile, exportUnscannedRecords } from './services/excelService';
import { fetchGoogleSheetsData, fetchAllGoogleSheetsData, parseGoogleSheetsUrl, ServiceAccountCredentials, updateScanStatus, batchUpdateScanStatus } from './services/googleSheetsService';
import { Batch, BatchRecord, Rule, ConditionOperator, LabelFieldMapping } from './types';
import { Scanner } from './components/Scanner';
import { GoogleSheetsImportForm } from './components/GoogleSheetsImportForm';
import { FieldMappingModal } from './components/FieldMappingModal';

import { SyncPanel } from './components/SyncPanel';

// Default Rules for Demo
const DEFAULT_RULES: Rule[] = [
  {
    id: '1',
    name: 'Fragile Check',
    column: 'Description',
    operator: ConditionOperator.CONTAINS,
    value: 'Glass',
    action: { type: 'show_badge', payload: 'FRAGILE' }
  },
  {
    id: '2',
    name: 'Priority',
    column: 'Service',
    operator: ConditionOperator.CONTAINS,
    value: 'Express',
    action: { type: 'show_badge', payload: 'PRIORITY' }
  }
];

const App: React.FC = () => {
  // --- State ---
  const [view, setView] = useState<'scan' | 'batches' | 'rules'>('scan');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [rules, setRules] = useState<Rule[]>(DEFAULT_RULES);
  const [autoPrint, setAutoPrint] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [labelScale, setLabelScale] = useState<number>(1.0);
  const [showGoogleSheetsModal, setShowGoogleSheetsModal] = useState(false);
  const [serviceAccountCredentials, setServiceAccountCredentials] = useState<ServiceAccountCredentials | null>(null);
  const [showFieldMappingModal, setShowFieldMappingModal] = useState(false);
  const [fieldMappingBatchId, setFieldMappingBatchId] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<'standalone' | 'host' | 'client'>('standalone');

  // --- Effects ---
  useEffect(() => {
    // Load state from localstorage
    const savedBatches = localStorage.getItem('ql_batches');
    const savedRules = localStorage.getItem('ql_rules');
    const savedServiceAccount = localStorage.getItem('ql_service_account');
    const savedActiveBatchId = localStorage.getItem('ql_active_batch_id');

    if (savedBatches) setBatches(JSON.parse(savedBatches));
    if (savedRules) setRules(JSON.parse(savedRules));
    if (savedServiceAccount) setServiceAccountCredentials(JSON.parse(savedServiceAccount));
    if (savedActiveBatchId) setActiveBatchId(savedActiveBatchId);

    // Listen for sync-before-close event from Electron
    if (window.electronAPI?.onSyncBeforeClose) {
      const handleSyncBeforeClose = async () => {
        console.log('Received sync-before-close event, syncing all Google Sheets batches...');
        await syncAllGoogleSheetsBatches();
        // Notify Electron that sync is complete
        if (window.electronAPI?.sendSyncComplete) {
          window.electronAPI.sendSyncComplete();
          console.log('Sync complete event sent');
        }
      };

      window.electronAPI.onSyncBeforeClose(handleSyncBeforeClose);
    }

  }, []);

  // --- LAN Sync Effects ---
  const batchesRef = React.useRef(batches);
  const activeBatchIdRef = React.useRef(activeBatchId);

  useEffect(() => {
    batchesRef.current = batches;
  }, [batches]);

  useEffect(() => {
    activeBatchIdRef.current = activeBatchId;

    // Auto-select helper: if there's exactly one batch and none is active, select it
    if (!activeBatchId && batches.length === 1 && syncMode === 'standalone') {
      setActiveBatchId(batches[0].id);
    }
  }, [activeBatchId, batches, syncMode]);

  useEffect(() => {
    if (!window.electronAPI) return;

    // Host: Client requests data
    window.electronAPI.onSyncDataRequest((socketId) => {
      console.log('Sending sync data (batches and activeBatchId) to client...');
      window.electronAPI!.sendSyncData(socketId, batchesRef.current, activeBatchIdRef.current);
    });

    // Host: Received scan from client
    window.electronAPI.onRemoteScan((data) => {
      console.log('Received remote scan:', data);
      const { batchId, trackingNumber, scannerName } = data;

      // Update local state (Host is the source of truth)
      setBatches(prev => prev.map(b => {
        if (b.id === batchId) {
          const recordIndex = b.records.findIndex(r => r.id === trackingNumber);
          if (recordIndex >= 0 && !b.records[recordIndex].scanned) {
            const newRecords = [...b.records];
            const scannedAt = data.scannedAt || new Date().toISOString();
            newRecords[recordIndex] = { ...newRecords[recordIndex], scanned: true, scannedAt };

            // Broadcast the update to all clients
            window.electronAPI!.broadcastScan({
              batchId,
              trackingNumber,
              scannedAt,
              scannerName
            });

            return { ...b, records: newRecords };
          }
        }
        return b;
      }));
    });

    // Client: Received full sync data
    window.electronAPI.onSyncDataReceived((data) => {
      console.log('Received sync data from host, updating local state:', data);
      const { batches: newBatches, activeBatchId: hostActiveBatchId } = data;
      setBatches(newBatches);

      if (hostActiveBatchId) {
        setActiveBatchId(hostActiveBatchId);
        setView('scan'); // Automatically switch to scan view when host has an active batch
      } else {
        // If host has no active batch, but we have some, check if current selection is still in the new list
        if (activeBatchIdRef.current && !newBatches.find((b: any) => b.id === activeBatchIdRef.current)) {
          setActiveBatchId(null);
        }
      }
    });

    // Client: Received scan update broadcast
    window.electronAPI.onRemoteScanUpdate((data) => {
      console.log('Received scan update broadcast:', data);
      const { batchId, trackingNumber, scannedAt } = data;

      setBatches(prev => prev.map(b => {
        if (b.id === batchId) {
          const recordIndex = b.records.findIndex(r => r.id === trackingNumber);
          if (recordIndex >= 0) {
            const newRecords = [...b.records];
            newRecords[recordIndex] = { ...newRecords[recordIndex], scanned: true, scannedAt };
            return { ...b, records: newRecords };
          }
        }
        return b;
      }));
    });

  }, []); // Run once on mount


  useEffect(() => {
    // Save state
    localStorage.setItem('ql_batches', JSON.stringify(batches));
  }, [batches]);

  useEffect(() => {
    localStorage.setItem('ql_rules', JSON.stringify(rules));
  }, [rules]);

  useEffect(() => {
    if (serviceAccountCredentials) {
      localStorage.setItem('ql_service_account', JSON.stringify(serviceAccountCredentials));
    }
  }, [serviceAccountCredentials]);

  useEffect(() => {
    if (activeBatchId) {
      localStorage.setItem('ql_active_batch_id', activeBatchId);
    } else {
      localStorage.removeItem('ql_active_batch_id');
    }
  }, [activeBatchId]);

  // --- Auto-Refresh Google Sheets (DISABLED to avoid rate limits) ---
  // Users can manually refresh using the Refresh button
  /*
  useEffect(() => {
    if (!activeBatchId || !serviceAccountCredentials) return;
  
    const batch = batches.find(b => b.id === activeBatchId);
    if (!batch || batch.source !== 'google-sheets' || !batch.googleSheetsConfig) return;
  
    const intervalId = setInterval(async () => {
      console.log('Auto-refreshing Google Sheets...');
      try {
        let sheetsData;
        if (batch.googleSheetsConfig.importAllSheets) {
          sheetsData = await fetchAllGoogleSheetsData(
            batch.googleSheetsConfig.spreadsheetId,
            serviceAccountCredentials
          );
        } else {
          sheetsData = await fetchGoogleSheetsData(
            batch.googleSheetsConfig.spreadsheetId,
            batch.googleSheetsConfig.sheetName!,
            serviceAccountCredentials
          );
        }
  
        const { headers, data } = sheetsData;
        const pk = batch.primaryKeyColumn;
  
        // Validate records
        const validRecords = data.filter(row => {
          const pkValue = row[pk];
          return pkValue !== undefined && pkValue !== null && String(pkValue).trim() !== '';
        });
  
        if (validRecords.length > 0) {
          setBatches(prev => prev.map(b => {
            if (b.id === activeBatchId) {
              // Merge new data with existing scan status
              // Note: Since we sync scan status to the sheet, the sheet is the source of truth.
              // However, for immediate UI updates, we might want to preserve local state if sync is pending.
              // For simplicity and correctness with "sheet as source of truth", we rebuild records.
              // But we need to check if the sheet has "Scanned" column.
  
              const newRecords = validRecords.map(row => {
                // Check if row has "Scanned" column from sheet
                const isScanned = row['Scanned'] === 'YES';
                return {
                  id: String(row[pk]),
                  data: row,
                  scanned: !!row['ScannedAt'], // Check if ScannedAt has a value
                  sheetName: row._sheetName || sheetsData.sheetName
                };
              });
  
              return { ...b, records: newRecords };
            }
            return b;
          }));
          console.log('Auto-refresh successful');
        }
      } catch (err) {
        console.error('Auto-refresh failed:', err);
      }
    }, 60000); // 60 seconds
  
    return () => clearInterval(intervalId);
  }, [activeBatchId, batches, serviceAccountCredentials]);
  */

  // --- Handlers ---
  const processFile = async (file: File) => {
    // Validate file type
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      throw new Error(`Unsupported file format. Please upload an Excel file (${validExtensions.join(', ')})`);
    }

    const { headers, data } = await parseExcelFile(file);

    // Validate headers exist
    if (!headers || headers.length === 0) {
      throw new Error('File format error: Unable to read headers. Please ensure the first row of the Excel file contains column names.');
    }

    // Validate data exists
    if (!data || data.length === 0) {
      throw new Error('File content is empty. Please ensure the Excel file contains data rows.');
    }

    // Auto-detect PK (look for 'tracking', 'id', 'no', 'order')
    const pk = headers.find(h => {
      const lower = h.toLowerCase();
      return lower.includes('tracking') ||
        lower.includes('order') ||
        lower.includes('id');
    }) || headers[0];

    // Validate that the primary key column has valid values
    const validRecords = data.filter(row => {
      const pkValue = row[pk];
      return pkValue !== undefined && pkValue !== null && String(pkValue).trim() !== '';
    });

    if (validRecords.length === 0) {
      throw new Error(`No valid data in primary key column "${pk}". Please ensure the first column contains order numbers or tracking numbers.`);
    }

    if (validRecords.length < data.length) {
      const skipped = data.length - validRecords.length;
      console.warn(`Skipped ${skipped} empty rows`);
    }

    const newBatch: Batch = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^/.]+$/, ""),
      createdAt: new Date().toISOString(),
      primaryKeyColumn: pk,
      source: 'local',
      records: validRecords.map(row => ({
        id: String(row[pk]),
        data: row,
        scanned: false
      })),
      rawData: data // Store original data for fixed cell references
    };

    return newBatch;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setIsLoading(true);
    try {
      const file = e.target.files[0];
      const newBatch = await processFile(file);
      setBatches(prev => [newBatch, ...prev]);
      setActiveBatchId(newBatch.id);
      setView('scan');
    } catch (err: any) {
      alert(err.message || 'File parsing failed. Please check the file format.');
      console.error(err);
    } finally {
      setIsLoading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleDeleteBatch = (id: string) => {
    setBatches(prev => prev.filter(b => b.id !== id));
    if (activeBatchId === id) setActiveBatchId(null);
  };

  const handleExportUnscanned = (batchId: string) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;

    const unscannedRecords = batch.records.filter(record => !record.scanned);
    exportUnscannedRecords(unscannedRecords, batch.name);
  };

  const syncAllGoogleSheetsBatches = async () => {
    if (!serviceAccountCredentials) return;

    const googleSheetsBatches = batches.filter(b =>
      b.source === 'google-sheets' && b.googleSheetsConfig
    );

    for (const batch of googleSheetsBatches) {
      const scannedRecords = batch.records.filter(r => r.scanned);

      if (scannedRecords.length > 0) {
        console.log(`Syncing ${scannedRecords.length} records from batch ${batch.name}...`);

        // Group records by sheet name for batch update
        const recordsBySheet = scannedRecords.reduce((acc, record) => {
          const sheet = record.sheetName || batch.googleSheetsConfig!.sheetName || '';
          if (!acc[sheet]) acc[sheet] = [];
          acc[sheet].push({
            orderId: record.id,
            primaryKeyColumn: batch.primaryKeyColumn
          });
          return acc;
        }, {} as Record<string, Array<{ orderId: string; primaryKeyColumn: string }>>);

        // Batch update for each sheet
        for (const [sheetName, updates] of Object.entries(recordsBySheet)) {
          try {
            const result = await batchUpdateScanStatus(
              batch.googleSheetsConfig!.spreadsheetId,
              sheetName,
              updates,
              serviceAccountCredentials
            );
            console.log(`✅ Sheet "${sheetName}": ${result.updated} records synced`);
          } catch (err: any) {
            console.error(`❌ Failed to sync sheet "${sheetName}":`, err.message);
          }
        }
      }
    }

    console.log('All batches synced');
  };

  const handleRefreshGoogleSheets = async (batchId: string) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch || batch.source !== 'google-sheets' || !batch.googleSheetsConfig || !serviceAccountCredentials) {
      alert('只能刷新 Google Sheets 批次');
      return;
    }

    setIsLoading(true);
    try {
      // Step 1: Sync all pending scan statuses to Google Sheets
      console.log('Syncing pending scan statuses to Google Sheets...');
      const scannedRecords = batch.records.filter(r => r.scanned);

      if (scannedRecords.length > 0) {
        console.log(`Found ${scannedRecords.length} scanned records to sync`);

        for (const record of scannedRecords) {
          try {
            const recordIndex = batch.records.findIndex(r => r.id === record.id);
            await updateScanStatus(
              batch.googleSheetsConfig.spreadsheetId,
              record.sheetName || batch.googleSheetsConfig.sheetName || '',
              recordIndex,
              true,
              serviceAccountCredentials,
              'ScannedAt',
              record.id, // orderId
              batch.primaryKeyColumn // primaryKeyColumn
            );
            console.log(`Synced: ${record.id}`);
          } catch (err: any) {
            console.error(`Failed to sync ${record.id}:`, err.message);
            // Continue with other records even if one fails
          }
        }

        console.log('Batch sync complete');
      }

      // Step 2: Fetch fresh data from Google Sheets
      let sheetsData;
      if (batch.googleSheetsConfig.importAllSheets) {
        sheetsData = await fetchAllGoogleSheetsData(
          batch.googleSheetsConfig.spreadsheetId,
          serviceAccountCredentials
        );
      } else {
        sheetsData = await fetchGoogleSheetsData(
          batch.googleSheetsConfig.spreadsheetId,
          batch.googleSheetsConfig.sheetName!,
          serviceAccountCredentials
        );
      }

      const { headers, data } = sheetsData;
      const pk = batch.primaryKeyColumn;

      const validRecords = data.filter(row => {
        const pkValue = row[pk];
        return pkValue !== undefined && pkValue !== null && String(pkValue).trim() !== '';
      });

      if (validRecords.length > 0) {
        setBatches(prev => prev.map(b => {
          if (b.id === batchId) {
            const newRecords = validRecords.map(row => ({
              id: String(row[pk]),
              data: row,
              scanned: !!row['ScannedAt'],
              sheetName: row._sheetName || sheetsData.sheetName
            }));
            return { ...b, records: newRecords, rawData: data };
          }
          return b;
        }));
        alert('同步并刷新成功！');
      }
    } catch (err: any) {
      alert(`刷新失败: ${err.message}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldMappingSave = (mapping: LabelFieldMapping) => {
    if (!fieldMappingBatchId) return;

    setBatches(prev => prev.map(b => {
      if (b.id === fieldMappingBatchId) {
        return { ...b, fieldMapping: mapping };
      }
      return b;
    }));
  };

  const handleGoogleSheetsImport = async (sheetsUrl: string, sheetName: string, importAllSheets: boolean) => {
    setIsLoading(true);
    try {
      // Check if Service Account is configured
      if (!serviceAccountCredentials) {
        throw new Error('请先上传 Service Account JSON 文件');
      }

      // Parse the URL to extract spreadsheet ID
      const spreadsheetId = parseGoogleSheetsUrl(sheetsUrl);
      if (!spreadsheetId) {
        throw new Error('无效的 Google Sheets 链接。请确保链接格式正确。');
      }

      let sheetsData;
      if (importAllSheets) {
        sheetsData = await fetchAllGoogleSheetsData(
          spreadsheetId,
          serviceAccountCredentials
        );
      } else {
        // Fetch data from Google Sheets using googleapis
        sheetsData = await fetchGoogleSheetsData(
          spreadsheetId,
          sheetName,
          serviceAccountCredentials
        );
      }

      const { headers, data } = sheetsData;
      console.log('Imported Sheets Data:', { headers, data });

      // Auto-detect primary key
      const pk = headers.find(h => {
        const lower = h.toLowerCase();
        return lower.includes('tracking') ||
          lower.includes('order id') ||
          lower.includes('order') ||
          lower.includes('订单') ||
          lower.includes('id');
      }) || headers[0];

      // Validate records
      const validRecords = data.filter(row => {
        const pkValue = row[pk];
        return pkValue !== undefined && pkValue !== null && String(pkValue).trim() !== '';
      });

      if (validRecords.length === 0) {
        throw new Error(`主键列 "${pk}" 中没有有效数据。`);
      }

      // Create new batch from Google Sheets
      const newBatch: Batch = {
        id: crypto.randomUUID(),
        name: `${spreadsheetId.substring(0, 8)}...${importAllSheets ? ' (All Sheets)' : ` - ${sheetName}`}`,
        createdAt: new Date().toISOString(),
        primaryKeyColumn: pk,
        source: 'google-sheets',
        googleSheetsConfig: {
          spreadsheetId,
          sheetName: importAllSheets ? undefined : sheetName,
          url: sheetsUrl,
          importAllSheets
        },
        records: validRecords.map(row => ({
          id: String(row[pk]),
          data: row,
          scanned: false,
          sheetName: row._sheetName || sheetsData.sheetName // Use sheet name from row (multi-sheet) or batch (single sheet)
        })),
        rawData: data // Store original data for fixed cell references
      };

      setBatches(prev => [newBatch, ...prev]);
      setActiveBatchId(newBatch.id);
      setView('scan');
      setShowGoogleSheetsModal(false);
    } catch (err: any) {
      alert(err.message || '导入 Google Sheets 失败，请检查链接和权限。');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScan = async (trackingNum: string): Promise<BatchRecord | null> => {
    const batch = batches.find(b => b.id === activeBatchId);
    if (!batch) return null;

    const recordIndex = batch.records.findIndex(r => r.id === trackingNum);

    if (recordIndex >= 0) {
      const record = batch.records[recordIndex];

      const scannedAt = new Date().toISOString();
      if (syncMode === 'client') {
        // CLIENT MODE: Send scan to host
        console.log('Sending scan to host:', trackingNum);
        window.electronAPI?.sendClientScan({
          batchId: batch.id,
          trackingNumber: trackingNum,
          scannedAt,
          scannerName: 'Client'
        });
      } else {
        // HOST or STANDALONE
        // Update scanned status locally
        const updatedBatches = batches.map(b => {
          if (b.id === activeBatchId) {
            const newRecords = [...b.records];
            newRecords[recordIndex] = { ...newRecords[recordIndex], scanned: true, scannedAt };
            return { ...b, records: newRecords };
          }
          return b;
        });
        setBatches(updatedBatches);

        // HOST: Broadcast
        if (syncMode === 'host') {
          window.electronAPI?.broadcastScan({
            batchId: batch.id,
            trackingNumber: trackingNum,
            scannedAt,
            scannerName: 'Host'
          });
        }
      }

      return { ...batch.records[recordIndex], scanned: true, scannedAt };
    }

    return null;
  };

  const activeBatch = batches.find(b => b.id === activeBatchId) || null;

  // --- Rule Handlers ---
  const handleAddRule = () => {
    const newRule: Rule = {
      id: crypto.randomUUID(),
      name: 'New Rule',
      column: activeBatch?.primaryKeyColumn || 'Column',
      operator: ConditionOperator.CONTAINS,
      value: '',
      action: { type: 'show_badge', payload: 'ALERT' }
    };
    setRules([...rules, newRule]);
  };

  const handleUpdateRule = (id: string, updates: Partial<Rule>) => {
    setRules(rules.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  // --- Drag and Drop Handlers ---
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy'; // Show copy cursor
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];
    setIsLoading(true);
    try {
      const newBatch = await processFile(file);
      setBatches(prev => [newBatch, ...prev]);
      setActiveBatchId(newBatch.id);
      setView('scan');
    } catch (err: any) {
      alert(err.message || 'File parsing failed. Please check the file format.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };


  // --- Render Views ---

  const renderBatches = () => (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batch Management</h1>
          <p className="text-gray-500">Import Excel files or Google Sheets to start scanning.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowGoogleSheetsModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
          >
            <LinkIcon size={18} />
            <span>Google Sheets</span>
          </button>
          <label className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 shadow-sm transition-colors">
            <Upload size={18} />
            <span>Import Excel</span>
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>


      <SyncPanel onModeChange={setSyncMode} />

      {
        isLoading && (
          <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200 animate-pulse">
            Parsing file...
          </div>
        )
      }

      {
        !isLoading && batches.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
            <FileSpreadsheet size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium">No batches found</p>
            <p className="text-gray-400 text-sm">Upload an Excel file to get started</p>
          </div>
        )
      }

      <div className="grid gap-4">
        {batches.map(batch => {
          const progress = (batch.records.filter(r => r.scanned).length / batch.records.length) * 100;
          return (
            <div key={batch.id} className={`bg-white p-6 rounded-xl border transition-all ${activeBatchId === batch.id ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-200 hover:border-blue-300'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-lg text-gray-900">{batch.name}</h3>
                    {batch.source === 'google-sheets' && (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <LinkIcon size={12} />
                        Google Sheets
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    PK: <span className="font-mono bg-gray-100 px-1 rounded">{batch.primaryKeyColumn}</span> •
                    Created: {new Date(batch.createdAt).toLocaleDateString()}
                    {batch.source === 'google-sheets' && batch.googleSheetsConfig && (
                      <span className="ml-2">
                        • <a
                          href={batch.googleSheetsConfig.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs"
                        >
                          Open Sheet
                        </a>
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setFieldMappingBatchId(batch.id);
                      setShowFieldMappingModal(true);
                    }}
                    className="text-purple-600 hover:bg-purple-50 px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                    title="Configure Label Fields"
                  >
                    <Settings size={16} />
                    <span>Configure Fields</span>
                  </button>
                  {batch.source === 'google-sheets' && (
                    <button
                      onClick={() => handleRefreshGoogleSheets(batch.id)}
                      className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                      title="Refresh from Google Sheets"
                      disabled={isLoading}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                      </svg>
                      <span>Refresh</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleExportUnscanned(batch.id)}
                    className="text-green-600 hover:bg-green-50 px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                    title="Export Unscanned Orders"
                  >
                    <Download size={16} />
                    <span>Export Unscanned</span>
                  </button>
                  {activeBatchId !== batch.id && (
                    <button onClick={() => { setActiveBatchId(batch.id); setView('scan'); }} className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-sm font-medium transition-colors">
                      Select
                    </button>
                  )}
                  <button onClick={() => handleDeleteBatch(batch.id)} className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-100 rounded-full h-2.5 mb-1 overflow-hidden">
                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{batch.records.filter(r => r.scanned).length} scanned</span>
                <span>{batch.records.length} total</span>
              </div>
            </div>
          );
        })}
      </div>
    </div >
  );

  const renderRules = () => (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automation Rules</h1>
          <p className="text-gray-500">Automatically badge or flag labels based on data.</p>
        </div>
        <button onClick={handleAddRule} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors">
          <Plus size={18} />
          <span>Add Rule</span>
        </button>
      </div>

      <div className="space-y-4">
        {rules.map((rule) => (
          <div key={rule.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">If Column</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                value={rule.column}
                onChange={(e) => handleUpdateRule(rule.id, { column: e.target.value })}
                placeholder="Column Name"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Operator</label>
              <select
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                value={rule.operator}
                onChange={(e) => handleUpdateRule(rule.id, { operator: e.target.value as ConditionOperator })}
              >
                <option value={ConditionOperator.CONTAINS}>Contains</option>
                <option value={ConditionOperator.EQUALS}>Equals</option>
                <option value={ConditionOperator.STARTS_WITH}>Starts With</option>
                <option value={ConditionOperator.GREATER_THAN}>Greater Than</option>
              </select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Value</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                value={rule.value}
                onChange={(e) => handleUpdateRule(rule.id, { value: e.target.value })}
                placeholder="Match Value"
              />
            </div>
            <div className="flex items-center pt-5">
              <ArrowRight size={16} className="text-gray-400" />
            </div>
            <div className="w-40">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Show Badge</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-bold"
                value={rule.action.payload}
                onChange={(e) => handleUpdateRule(rule.id, { action: { ...rule.action, payload: e.target.value } })}
                placeholder="BADGE TEXT"
              />
            </div>
            <div className="pt-5">
              <button onClick={() => handleDeleteRule(rule.id)} className="text-gray-400 hover:text-red-600 p-2">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
        {rules.length === 0 && (
          <div className="text-center py-10 text-gray-400 italic">No rules defined.</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 text-slate-900">
      {/* Sidebar */}
      <nav className="w-20 bg-slate-900 flex flex-col items-center py-6 gap-8 z-50 print:hidden shadow-xl">
        <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/50">
          QL
        </div>

        <div className="flex flex-col w-full gap-2 px-2">
          <button
            onClick={() => setView('scan')}
            className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${view === 'scan' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            title="Scanner"
          >
            <Printer size={24} />
            <span className="text-[10px] font-medium">Scan</span>
          </button>

          <button
            onClick={() => setView('batches')}
            className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${view === 'batches' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            title="Batches"
          >
            <FileSpreadsheet size={24} />
            <span className="text-[10px] font-medium">Data</span>
          </button>

          <button
            onClick={() => setView('rules')}
            className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${view === 'rules' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            title="Rules"
          >
            <Settings size={24} />
            <span className="text-[10px] font-medium">Rules</span>
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-4 pb-4">
          <button
            onClick={() => setAutoPrint(!autoPrint)}
            className={`w-12 h-8 rounded-full flex items-center transition-colors relative px-1 ${autoPrint ? 'bg-green-500' : 'bg-slate-700'}`}
            title="Toggle Auto-Print"
          >
            <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform ${autoPrint ? 'translate-x-4' : 'translate-x-0'}`}></div>
          </button>
          <div className="text-[10px] text-slate-500 text-center font-medium">Auto Print</div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative">
        {/* Header Bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 justify-between print:hidden">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-800 capitalize">{view}</h2>
            {view === 'scan' && activeBatch && (
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-md font-medium">
                Active Batch: {activeBatch.name}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-400">
            QuickLabel Pro v1.0
          </div>
        </header>

        <div
          className="h-[calc(100vh-4rem)]"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {view === 'scan' && (
            <Scanner
              activeBatch={activeBatch}
              rules={rules}
              onScan={handleScan}
              onClearHistory={() => setBatches(batches.map(b => b.id === activeBatchId ? { ...b, records: b.records.map(r => ({ ...r, scanned: false })) } : b))}
              autoPrint={autoPrint}
              labelScale={labelScale}
              onLabelScaleChange={setLabelScale}
              fieldMapping={activeBatch?.fieldMapping || null}
              rawData={activeBatch?.rawData}
            />
          )}
          {view === 'batches' && renderBatches()}
          {view === 'rules' && renderRules()}
        </div>
      </main>

      {/* Google Sheets Import Modal */}
      {showGoogleSheetsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Import from Google Sheets</h2>
            <p className="text-gray-500 mb-6">Paste the link to your Google Sheets document below.</p>

            <GoogleSheetsImportForm
              onImport={handleGoogleSheetsImport}
              onCancel={() => setShowGoogleSheetsModal(false)}
              isLoading={isLoading}
              serviceAccountCredentials={serviceAccountCredentials}
              onServiceAccountUpload={setServiceAccountCredentials}
            />
          </div>
        </div>
      )}

      {/* Field Mapping Modal */}
      {showFieldMappingModal && fieldMappingBatchId && (
        <FieldMappingModal
          isOpen={showFieldMappingModal}
          onClose={() => {
            setShowFieldMappingModal(false);
            setFieldMappingBatchId(null);
          }}
          availableColumns={
            batches.find(b => b.id === fieldMappingBatchId)?.records[0]
              ? Object.keys(batches.find(b => b.id === fieldMappingBatchId)!.records[0].data)
              : []
          }
          currentMapping={batches.find(b => b.id === fieldMappingBatchId)?.fieldMapping || null}
          onSave={handleFieldMappingSave}
        />
      )}
    </div>
  );
};

export default App;
