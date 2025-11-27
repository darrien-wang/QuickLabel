import React, { useState, useEffect } from 'react';
import { Layout, FileSpreadsheet, Settings, Printer, List, Upload, Trash2, Plus, ArrowRight, Download } from 'lucide-react';
import { parseExcelFile, exportUnscannedRecords } from './services/excelService';
import { Batch, BatchRecord, Rule, ConditionOperator } from './types';
import { Scanner } from './components/Scanner';

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

  // --- Effects ---
  useEffect(() => {
    // Load state from localstorage
    const savedBatches = localStorage.getItem('ql_batches');
    const savedRules = localStorage.getItem('ql_rules');
    if (savedBatches) setBatches(JSON.parse(savedBatches));
    if (savedRules) setRules(JSON.parse(savedRules));
  }, []);

  useEffect(() => {
    // Save state
    localStorage.setItem('ql_batches', JSON.stringify(batches));
  }, [batches]);

  useEffect(() => {
    localStorage.setItem('ql_rules', JSON.stringify(rules));
  }, [rules]);

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
      records: validRecords.map(row => ({
        id: String(row[pk]),
        data: row,
        scanned: false
      }))
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

  const handleScan = (trackingNum: string): BatchRecord | null => {
    const batch = batches.find(b => b.id === activeBatchId);
    if (!batch) return null;

    const recordIndex = batch.records.findIndex(r => r.id === trackingNum);
    
    if (recordIndex >= 0) {
      // Update scanned status
      const updatedBatches = batches.map(b => {
        if (b.id === activeBatchId) {
          const newRecords = [...b.records];
          newRecords[recordIndex] = { ...newRecords[recordIndex], scanned: true, scannedAt: new Date().toISOString() };
          return { ...b, records: newRecords };
        }
        return b;
      });
      setBatches(updatedBatches);
      return batch.records[recordIndex];
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
          <p className="text-gray-500">Import Excel files to start scanning.</p>
        </div>
        <label className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 shadow-sm transition-colors">
          <Upload size={18} />
          <span>Import Excel</span>
          <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>

      {isLoading && (
        <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200 animate-pulse">
          Parsing file...
        </div>
      )}

      {!isLoading && batches.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
           <FileSpreadsheet size={48} className="mx-auto text-gray-300 mb-4" />
           <p className="text-gray-500 font-medium">No batches found</p>
           <p className="text-gray-400 text-sm">Upload an Excel file to get started</p>
        </div>
      )}

      <div className="grid gap-4">
        {batches.map(batch => {
            const progress = (batch.records.filter(r => r.scanned).length / batch.records.length) * 100;
            return (
                <div key={batch.id} className={`bg-white p-6 rounded-xl border transition-all ${activeBatchId === batch.id ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-200 hover:border-blue-300'}`}>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="font-bold text-lg text-gray-900">{batch.name}</h3>
                            <p className="text-sm text-gray-500">PK: <span className="font-mono bg-gray-100 px-1 rounded">{batch.primaryKeyColumn}</span> • Created: {new Date(batch.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-2">
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
    </div>
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
                    onClearHistory={() => setBatches(batches.map(b => b.id === activeBatchId ? {...b, records: b.records.map(r => ({...r, scanned: false}))} : b))}
                    autoPrint={autoPrint}
                    labelScale={labelScale}
                    onLabelScaleChange={setLabelScale}
                />
             )}
             {view === 'batches' && renderBatches()}
             {view === 'rules' && renderRules()}
        </div>
      </main>
    </div>
  );
};

export default App;
