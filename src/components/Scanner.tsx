import React, { useState, useRef, useEffect } from 'react';
import { Search, Printer, AlertTriangle, CheckCircle, RefreshCcw, XCircle, Settings, ZoomIn, ZoomOut } from 'lucide-react';
import { Batch, BatchRecord, Rule } from '../types';
import { LabelRenderer } from './LabelRenderer';

interface ScannerProps {
  activeBatch: Batch | null;
  rules: Rule[];
  onScan: (trackingNumber: string) => BatchRecord | null;
  onClearHistory: () => void;
  autoPrint: boolean;
  labelScale: number;
  onLabelScaleChange: (scale: number) => void;
}

export const Scanner: React.FC<ScannerProps> = ({
  activeBatch,
  rules,
  onScan,
  onClearHistory,
  autoPrint,
  labelScale,
  onLabelScaleChange
}) => {
  const [inputVal, setInputVal] = useState('');
  const [lastRecord, setLastRecord] = useState<BatchRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<BatchRecord[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount and after operations
  useEffect(() => {
    inputRef.current?.focus();
  }, [lastRecord, error]);

  // Handle auto-print when lastRecord updates
  useEffect(() => {
    if (autoPrint && lastRecord) {
      // Small timeout to allow React to render the new label to the DOM (for preview)
      const timer = setTimeout(() => {
        handlePrint();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [lastRecord, autoPrint]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    if (!activeBatch) {
      setError("No active batch selected. Please import or select a batch first.");
      return;
    }

    const result = onScan(inputVal.trim());

    if (result) {
      setError(null);
      setLastRecord(result);
      setHistory(prev => [result, ...prev].slice(0, 10)); // Keep last 10
      setInputVal('');
      // Printing is handled by useEffect
    } else {
      setError(`Tracking number "${inputVal}" not found in batch.`);
      setLastRecord(null);
    }
  };

  /**
   * ELECTRON SILENT PRINTING METHOD
   * 1. Copies the raw HTML of the label.
   * 2. Converts canvas elements (QR codes) to images.
   * 3. Sends complete HTML to Electron main process for silent printing.
   */
  const handlePrint = async () => {
    if (!lastRecord || isPrinting) return;

    setIsPrinting(true);

    try {
        // 1. Get the source element (The rendered label on screen)
        const sourceElement = document.getElementById('preview-label');
        if (!sourceElement) {
            throw new Error("Label source not found");
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

        // 4. Remove the scale transform from the clone for printing
        // We want the printer to print the 100mm x 150mm div naturally
        clonedNode.style.transform = 'none';
        clonedNode.style.border = 'none'; // Remove preview border
        clonedNode.style.margin = '0';
        clonedNode.classList.remove('shadow-xl'); // Remove shadow

        // 5. Build complete HTML document
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Print Label ${lastRecord.id}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    * {
                        box-sizing: border-box;
                    }

                    /* CRITICAL: Force the printer to use 100mm x 150mm paper size */
                    @page {
                        size: 100mm 150mm;
                        margin: 0;
                    }

                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 100mm;
                        height: 150mm;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        color-adjust: exact;
                    }

                    #print-root {
                        width: 100mm !important;
                        height: 150mm !important;
                        overflow: hidden;
                        position: relative;
                    }

                    /* Ensure SVG barcodes are black */
                    svg {
                        fill: black !important;
                    }

                    /* Force print styles */
                    @media print {
                        html, body {
                            width: 100mm;
                            height: 150mm;
                        }
                        #print-root {
                            width: 100mm !important;
                            height: 150mm !important;
                        }
                    }
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
            // Use Electron's silent printing (HTML -> PDF -> Print -> Delete)
            window.electronAPI.printHTML(htmlContent);

            // Cleanup after waiting for PDF generation and print to complete
            // (2s HTML load + 1s PDF generation + 1s print + buffer)
            setTimeout(() => {
                setIsPrinting(false);
                inputRef.current?.focus();
            }, 5000);
        } else {
            // Fallback to browser print dialog (for web version or debugging)
            console.warn("Electron API not available, falling back to browser print");
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow?.document;
            if (!doc) throw new Error("Iframe document inaccessible");

            doc.open();
            doc.write(htmlContent);
            doc.close();

            iframe.onload = () => {
                setTimeout(() => {
                    const win = iframe.contentWindow;
                    if (win) {
                        win.focus();
                        win.print();
                    }

                    setTimeout(() => {
                        document.body.removeChild(iframe);
                        setIsPrinting(false);
                        inputRef.current?.focus();
                    }, 1000);
                }, 500);
            };
        }

    } catch (err) {
        console.error("Print failed", err);
        setIsPrinting(false);
        alert("Printing failed. Please check console.");
    }
  };

  return (
    <div className="flex h-full gap-6 p-6">
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
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                        <span className="font-mono text-gray-700">{rec.id}</span>
                        <span className="text-xs text-gray-400">{new Date().toLocaleTimeString()}</span>
                    </div>
                ))}
                {history.length === 0 && <div className="text-xs text-gray-400 italic">No history yet</div>}
            </div>
        </div>
      </div>

      {/* Right Column: Preview */}
      <div className="flex-1 bg-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center relative overflow-hidden">
        
        {/* Top Controls */}
        <div className="absolute top-4 right-4 flex gap-2 z-10">
            <button
                onClick={handlePrint}
                disabled={!lastRecord || isPrinting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                {isPrinting ? <RefreshCcw size={18} className="animate-spin" /> : <Printer size={18} />}
                Print Now
            </button>
        </div>

        {/* Scale Control */}
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-md p-3 min-w-[200px] z-10">
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

        {/* The Label Preview - Used as Source for Printing */}
        {/* The transform affects visual size, but handlePrint clones the inner content and strips transform */}
        <div className="shadow-2xl bg-white">
           <LabelRenderer 
             id="preview-label" 
             record={lastRecord} 
             rules={rules} 
             scale={labelScale} 
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