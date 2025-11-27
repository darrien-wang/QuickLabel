import React, { useEffect, useRef } from 'react';
import { BatchRecord, Rule, ConditionOperator } from '../types';

declare const JsBarcode: any;
declare const QRCode: any;

interface LabelRendererProps {
  record: BatchRecord | null;
  rules: Rule[];
  scale?: number; // Only affects the style transform for on-screen preview
  className?: string;
  id?: string;
}

export const LabelRenderer: React.FC<LabelRendererProps> = ({ 
  record, 
  rules, 
  scale = 1,
  className = "",
  id
}) => {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  // Derive badge logic from rules
  const badges = React.useMemo(() => {
    if (!record) return [];
    
    const activeBadges: { text: string; color: string }[] = [];
    
    rules.forEach(rule => {
      const cellValue = String(record.data[rule.column] || '').toLowerCase();
      const ruleValue = rule.value.toLowerCase();
      let match = false;

      switch (rule.operator) {
        case ConditionOperator.EQUALS: match = cellValue === ruleValue; break;
        case ConditionOperator.CONTAINS: match = cellValue.includes(ruleValue); break;
        case ConditionOperator.STARTS_WITH: match = cellValue.startsWith(ruleValue); break;
        case ConditionOperator.GREATER_THAN: match = parseFloat(cellValue) > parseFloat(ruleValue); break;
      }

      if (match && rule.action.type === 'show_badge') {
        activeBadges.push({ text: rule.action.payload, color: 'bg-black text-white' });
      }
    });
    
    return activeBadges;
  }, [record, rules]);

  // Generate Barcode and QR
  useEffect(() => {
    if (!record) return;

    if (barcodeRef.current) {
      try {
        // High density barcode for thermal printing
        JsBarcode(barcodeRef.current, record.id, {
          format: "CODE128",
          width: 3, 
          height: 60,
          displayValue: true,
          margin: 0,
          fontSize: 20,
          background: "transparent"
        });
      } catch (e) {
        console.error("Barcode generation failed", e);
      }
    }

    if (qrRef.current) {
      qrRef.current.innerHTML = '';
      try {
        new QRCode(qrRef.current, {
          text: JSON.stringify(record.data),
          width: 90,
          height: 90,
          colorDark : "#000000",
          colorLight : "#ffffff",
          correctLevel : 2 // H
        });
      } catch (e) {
        console.error("QR generation failed", e);
      }
    }
  }, [record]);

  // Base style for a 100mm x 150mm label
  // We use mm directly. Tailwind handles the internal layout.
  const baseStyle: React.CSSProperties = {
    width: '100mm',
    height: '150mm',
    backgroundColor: 'white',
    // If it's the UI preview, we apply the scale transform.
    // If it's being printed, the print engine ignores transform (mostly) and uses the @page size.
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    transformOrigin: 'top left',
    flexShrink: 0,
  };

  if (!record) {
    return (
      <div
        id={id}
        className={`border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 ${className}`}
        style={baseStyle}
      >
        <div className="text-center p-4">
          <p className="font-medium">No Data Loaded</p>
          <p className="text-xs mt-1">Scan a tracking number to preview</p>
        </div>
      </div>
    );
  }

  // Use Excel column references (A, B, C, D, E, ...)
  // Users can map their Excel columns directly
  const A = record.data['A'] || '';  // Column A
  const B = record.data['B'] || '';  // Column B
  const C = record.data['C'] || '';  // Column C
  const D = record.data['D'] || '';  // Column D
  const E = record.data['E'] || '';  // Column E

  return (
    <div
      id={id}
      className={`relative text-black overflow-hidden flex flex-col print:shadow-none shadow-xl ${className}`}
      style={{
        ...baseStyle,
        padding: '5mm',
        boxSizing: 'border-box' // Important for print margins
      }}
    >
      {/* Header / Badges */}
      <div className="flex justify-between items-start mb-6 h-12">
        <div className="flex gap-2 flex-wrap">
          {badges.map((badge, idx) => (
            <span key={idx} className={`${badge.color} px-4 py-1 font-bold text-lg border-2 border-black`}>
              {badge.text}
            </span>
          ))}
        </div>
        <div className="font-mono text-5xl font-black tracking-tighter">
          {A||'A'}
        </div>
      </div>

      {/* Recipient Block */}
      <div className="border-b-4 border-black pb-4 mb-4">
        <h2 className="text-3xl font-bold leading-tight mb-2">{B||"B"}</h2>
        <p className="text-xl leading-snug">{C||'C'}</p>
        <p className="text-xl leading-snug font-bold mt-1">{D||'D'}</p>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-4 mb-auto">
        <div>
           <div className="text-sm text-gray-600 uppercase font-bold tracking-wider">Date</div>
           <div className="font-mono text-lg font-bold">{new Date().toLocaleDateString()}</div>
        </div>
        <div>
           <div className="text-sm text-gray-600 uppercase font-bold tracking-wider">Position</div>
           <div className="font-mono text-lg font-bold">{E|| 'E'} </div>
        </div>
      </div>

      {/* Footer / Barcodes */}
      <div className="mt-4 pt-4 border-t-4 border-black flex flex-col items-center justify-center">
        {/* Barcode container - ensure w-full */}
        <div className="w-full flex justify-center mb-4">
          <svg ref={barcodeRef} className="max-w-full h-20"></svg>
        </div>
        
        <div className="flex justify-between w-full items-end">
          <div ref={qrRef} className="print-qr-fix"></div>
        </div>
      </div>
    </div>
  );
};