import React, { useState, useRef, useEffect } from 'react';
import { Search, Printer, AlertTriangle, CheckCircle, RefreshCcw, XCircle, Settings, ZoomIn, ZoomOut } from 'lucide-react';
import { Batch, BatchRecord, Rule, LabelFieldMapping } from '../types';
import { LabelRenderer } from './LabelRenderer';

interface ScannerProps {
  activeBatch: Batch | null;
  rules: Rule[];
  onScan: (trackingNumber: string) => BatchRecord | null | Promise<BatchRecord | null>;
  onClearHistory: () => void;
  autoPrint: boolean;
  labelScale: number;
  onLabelScaleChange: (scale: number) => void;
  fieldMapping: LabelFieldMapping | null;
  rawData?: Record<string, any>[];
}

interface PrintTask {
  internalId: string;
  record: BatchRecord;
  status: 'pending' | 'processing';
  timestamp: number;
}

export const Scanner: React.FC<ScannerProps> = ({
  activeBatch,
  rules,
  onScan,
  onClearHistory,
  autoPrint,
  labelScale,
  onLabelScaleChange,
  fieldMapping,
  rawData
}) => {
  const [inputVal, setInputVal] = useState('');
  const [lastRecord, setLastRecord] = useState<BatchRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<BatchRecord[]>([]);

  // Print Queue State
  const [printQueue, setPrintQueue] = useState<PrintTask[]>([]);

  // Printer Selection State
  const [printers, setPrinters] = useState<any[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount and after operations
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [lastRecord, error]);

  // Load Printers and Restore Selection
  useEffect(() => {
    const loadPrinters = async () => {
      // Small delay to ensure Electron API is ready
      await new Promise(resolve => setTimeout(resolve, 500));

      if (window.electronAPI?.getPrinters) {
        try {
          const printerList = await window.electronAPI.getPrinters();
          if (printerList && printerList.length > 0) {
            setPrinters(printerList);

            // Try to restore saved printer
            const savedPrinter = localStorage.getItem('ql_selected_printer');
            if (savedPrinter && printerList.some((p: any) => p.name === savedPrinter)) {
              setSelectedPrinter(savedPrinter);
            } else {
              const defaultP = printerList.find((p: any) => p.isDefault);
              if (defaultP) setSelectedPrinter(defaultP.name);
              else setSelectedPrinter(printerList[0].name);
            }
          } else {
            // No printers found
            setPrinters([{ name: 'System Default', isDefault: true }]);
          }
        } catch (err) {
          console.error("Failed to load printers:", err);
          // Fallback
          setPrinters([{ name: 'System Default', isDefault: true }]);
        }
      } else {
        // API missing (likely needs restart)
        console.warn("getPrinters not found");
        setPrinters([{ name: 'System Default', isDefault: true }]);
      }
    };
    loadPrinters();
  }, []);

  // Save Printer Selection
  useEffect(() => {
    if (selectedPrinter) {
      localStorage.setItem('ql_selected_printer', selectedPrinter);
    }
  }, [selectedPrinter]);

  // Handle auto-print when lastRecord updates
  useEffect(() => {
    if (autoPrint && lastRecord) {
      addToPrintQueue(lastRecord);
    }
  }, [lastRecord, autoPrint]);

  // --- Print Queue Processor ---
  useEffect(() => {
    const processQueue = async () => {
      // Find the next pending task
      const nextTask = printQueue.find(t => t.status === 'pending');

      // If no pending task, or if something is already processing, do nothing
      if (!nextTask || printQueue.some(t => t.status === 'processing')) {
        return;
      }

      // 1. Mark as processing
      setPrintQueue(prev => prev.map(t =>
        t.internalId === nextTask.internalId ? { ...t, status: 'processing' } : t
      ));

      try {
        // 2. Wait a bit for React to render the hidden label and useEffect hooks (Barcode/QR) to run
        await new Promise(resolve => setTimeout(resolve, 800));

        // 3. Execute Print
        await executePrint(nextTask.internalId, nextTask.record);
      } catch (err) {
        console.error("Queue Print Failed:", err);
      } finally {
        // 4. Remove from queue regardless of success/failure
        setPrintQueue(prev => prev.filter(t => t.internalId !== nextTask.internalId));
      }
    };

    processQueue();
  }, [printQueue]);

  const addToPrintQueue = (record: BatchRecord) => {
    const newTask: PrintTask = {
      internalId: crypto.randomUUID(),
      record: record,
      status: 'pending',
      timestamp: Date.now()
    };
    setPrintQueue(prev => [...prev, newTask]);
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    if (!activeBatch) {
      setError("No active batch selected. Please import or select a batch first.");
      return;
    }

    const result = await Promise.resolve(onScan(inputVal.trim()));

    if (result) {
      setError(null);
      setLastRecord(result);
      setHistory(prev => [result, ...prev].slice(0, 10)); // Keep last 10
      setInputVal('');
      // Auto-print is handled by useEffect
    } else {
      setError(`Tracking number "${inputVal}" not found in batch.`);
      setLastRecord(null);
      setInputVal(''); // Clear input even on error so user can scan again
    }
  };

  /**
   * Actual Print Logic
   * Scrapes the DOM of the specific hidden label by ID
   */
  const executePrint = async (elementId: string, record: BatchRecord) => {
    try {
      // 1. Get the source element (The rendered label from the hidden queue area)
      const sourceElement = document.getElementById(`print-task-${elementId}`);
      if (!sourceElement) {
        throw new Error(`Label source element not found: ${elementId}`);
      }

      // 2. Clone the node so we can manipulate it without affecting the UI
      const clonedNode = sourceElement.cloneNode(true) as HTMLElement;

      // 3. FIX CANVAS ELEMENTS (QR Codes)
      // cloneNode does NOT copy the internal pixel data of a <canvas>.
      // We must convert them to <img> tags manually.
      const originalCanvases = sourceElement.querySelectorAll('canvas');
      const clonedCanvases = clonedNode.querySelectorAll('canvas');

      originalCanvases.forEach((origCanvas, index) => {
        const dataURL = origCanvas.toDataURL();
        const img = document.createElement('img');
        img.src = dataURL;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.display = 'block';

        // Replace the empty canvas in the clone with this image
        if (clonedCanvases[index]) {
          clonedCanvases[index].parentNode?.replaceChild(img, clonedCanvases[index]);
        }
      });

      // 4. Remove styles for printing
      clonedNode.style.transform = 'none';
      clonedNode.style.border = 'none';
      clonedNode.style.margin = '0';
      clonedNode.classList.remove('shadow-xl');

      // 5. Build complete HTML document
      const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Print Label ${record.id}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    * { box-sizing: border-box; }
                    @page { size: 100mm 150mm; margin: 0; }
                    html, body {
                        margin: 0; padding: 0;
                        width: 100mm; height: 150mm;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        color-adjust: exact;
                    }
                    #print-root {
                        width: 100mm !important;
                        height: 150mm !important;
                        overflow: hidden;
                    }
                    svg { fill: black !important; }
                </style>
            </head>
            <body>
                <div id="print-root">
                    ${clonedNode.outerHTML}
                </div>
            </body>
            </html>
        `;

      // 6. Check if Electron API is available
      if (window.electronAPI && window.electronAPI.printHTML) {
        // Pass selected printer logic
        // If selectedPrinter is "System Default", pass empty string or undefined to use default
        const printerName = selectedPrinter === 'System Default' ? '' : selectedPrinter;
        window.electronAPI.printHTML(htmlContent, printerName);
      } else {
        console.warn("Electron API not available");
      }
    } catch (err) {
      console.error("Print execution failed", err);
    }
  };

  return (
    <div className="flex h-full gap-6 p-6">

      {/* --- Hidden Print Queue Renderer --- */}
      {/* This area renders labels for the print queue off-screen so they can be captured */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, opacity: 0, pointerEvents: 'none' }}>
        {printQueue.map((task) => (
          <div key={task.internalId} id={`print-task-${task.internalId}`}>
            <LabelRenderer
              record={task.record}
              rules={rules}
              scale={1} // Always print at 100% scale
              fieldMapping={fieldMapping}
              rawData={rawData}
            />
          </div>
        ))}
      </div>

      {/* Left Column: Input & Status */}
      <div className="flex-1 flex flex-col gap-6 max-w-xl">

        {/* Input Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Scan / Enter Tracking Number
          </label>
          <form onSubmit={handleScan} className="relative">
            <input
              ref={inputRef}
              type="text"
              className="w-full pl-12 pr-4 py-4 text-xl font-mono bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-0 transition-colors"
              placeholder="Waiting for input..."
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              autoFocus
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
          </form>

          {/* Messages */}
          <div className="mt-4 min-h-[3rem]">
            {error && (
              <div className="flex items-center gap-3 text-red-600 bg-red-50 p-3 rounded-lg animate-in fade-in slide-in-from-top-2">
                <AlertTriangle size={20} />
                <span className="font-medium">{error}</span>
              </div>
            )}
            {lastRecord && !error && (
              <div className="flex items-center gap-3 text-green-600 bg-green-50 p-3 rounded-lg animate-in fade-in slide-in-from-top-2">
                <CheckCircle size={20} />
                <span className="font-medium">Matched: {lastRecord.id}</span>
                {lastRecord.scanned && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full ml-auto">Re-scan</span>}
              </div>
            )}
          </div>
        </div>

        {/* Print Queue Status (Optional Visual Indicator) */}
        {printQueue.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center justify-between text-blue-800 text-sm">
            <div className="flex items-center gap-2">
              <RefreshCcw size={16} className="animate-spin" />
              <span className="font-bold">Printing in progress...</span>
            </div>
            <span className="bg-blue-200 px-2 py-0.5 rounded text-xs font-mono">
              Queue: {printQueue.length}
            </span>
          </div>
        )}

        {/* Info Card */}
        {lastRecord ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Parcel Details</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              {Object.entries(lastRecord.data).slice(0, 8).map(([key, val]) => (
                <div key={key}>
                  <dt className="text-gray-500 font-medium truncate">{key}</dt>
                  <dd className="text-gray-900 font-mono mt-0.5 truncate" title={String(val)}>
                    {String(val)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl flex-1 flex flex-col items-center justify-center text-gray-400">
            <Search size={48} className="mb-4 opacity-50" />
            <p>Scan a parcel to see details</p>
          </div>
        )}

        {/* Recent History */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase text-gray-500 tracking-wider">Recent Scans</h4>
            <button onClick={onClearHistory} className="text-gray-400 hover:text-red-500">
              <XCircle size={16} />
            </button>
          </div>
          <div className="space-y-2">
            {history.map((rec, i) => (
              <div key={`${rec.id}-${i}`} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                <span className="font-mono text-gray-700">{rec.id}</span>
                <span className="text-xs text-gray-400">
                  {rec.scannedAt ? new Date(rec.scannedAt).toLocaleTimeString() : new Date().toLocaleTimeString()}
                </span>
              </div>
            ))}
            {history.length === 0 && <div className="text-xs text-gray-400 italic">No history yet</div>}
          </div>
        </div>
      </div>

      {/* Right Column: Preview */}
      <div className="flex-1 bg-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center relative overflow-hidden">

        {/* Top Controls */}
        <div className="absolute top-4 right-4 flex gap-2 z-10 w-full px-4 justify-between pointer-events-none">
          {/* Left Side: Printer Selection */}
          <div className="pointer-events-auto bg-white rounded-lg shadow-md p-1 flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 px-2 flex items-center gap-1">
              <Printer size={12} />
              PRINTER
            </span>
            <select
              value={selectedPrinter}
              onChange={(e) => setSelectedPrinter(e.target.value)}
              className="text-sm border-0 focus:ring-0 bg-transparent py-1 pr-8 font-medium max-w-[200px] truncate cursor-pointer"
            >
              {printers.length === 0 && <option value="">Loading...</option>}
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.isDefault ? '(Default)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Right Side: Print Button */}
          <button
            onClick={() => lastRecord && addToPrintQueue(lastRecord)}
            disabled={!lastRecord}
            className="pointer-events-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Printer size={18} />
            <span>Print Now</span>
          </button>
        </div>

        {/* Scale Control */}
        <div className="absolute top-16 left-4 bg-white rounded-lg shadow-md p-3 min-w-[200px] z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-600">View Scale</span>
            <span className="text-xs font-mono text-blue-600">{Math.round(labelScale * 100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onLabelScaleChange(Math.max(0.5, labelScale - 0.1))}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ZoomOut size={16} className="text-gray-600" />
            </button>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={labelScale}
              onChange={(e) => onLabelScaleChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <button
              onClick={() => onLabelScaleChange(Math.min(1.5, labelScale + 0.1))}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ZoomIn size={16} className="text-gray-600" />
            </button>
          </div>
        </div>

        {/* The Label Preview (Visual Only) */}
        <div className="shadow-2xl bg-white mt-12 bg-white">
          <LabelRenderer
            id="preview-label"
            record={lastRecord}
            rules={rules}
            scale={labelScale}
            fieldMapping={fieldMapping}
            rawData={rawData}
          />
        </div>

        {autoPrint && (
          <div className="absolute bottom-4 right-4 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 z-10">
            <RefreshCcw size={12} className="animate-spin-slow" />
            Auto-Print: ON
          </div>
        )}

        <div className="absolute bottom-4 left-4 text-gray-400 text-xs max-w-xs z-10">
          <p className="flex items-center gap-1">
            <Settings size={10} />
            Output: 100x150mm (Vector PDF Mode)
          </p>
        </div>
      </div>
    </div>
  );
};