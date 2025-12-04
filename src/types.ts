export interface BatchRecord {
  id: string; // The primary key (Tracking Number)
  data: Record<string, any>; // The full row data
  scanned: boolean;
  scannedAt?: string;
}

export interface Batch {
  id: string;
  name: string;
  createdAt: string;
  records: BatchRecord[];
  primaryKeyColumn: string;
  source: 'local' | 'google-sheets'; // Data source type
  googleSheetsConfig?: {
    spreadsheetId: string;
    sheetName: string;
    url: string;
  };
}

export interface FieldMapping {
  labelField: string; // e.g., "recipient_name", "address_line_1"
  excelColumn: string; // The column header from Excel
}

export enum ConditionOperator {
  EQUALS = 'equals',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  GREATER_THAN = 'greater_than',
}

export interface Rule {
  id: string;
  name: string;
  column: string;
  operator: ConditionOperator;
  value: string;
  action: {
    type: 'show_badge' | 'change_color' | 'alert';
    payload: string; // e.g., Badge text or Color hex
  };
}

export interface LabelTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  fields: LabelField[];
}

export interface LabelField {
  id: string;
  type: 'text' | 'variable' | 'barcode' | 'qrcode';
  variableKey?: string; // Maps to excel column
  staticText?: string;
  x: number; // Percentage or px
  y: number;
  fontSize?: number;
  bold?: boolean;
}

export interface AppSettings {
  autoPrint: boolean;
  printerName?: string;
  defaultTemplateId: string;
}

// Add Electron API definition
declare global {
  interface Window {
    electronAPI?: {
      printLabel: (imgData: string) => void;
      printHTML: (htmlContent: string) => void;
      fetchGoogleSheets: (params: { spreadsheetId: string; sheetName: string; credentials: any }) => Promise<any>;
      updateScanStatus: (params: { spreadsheetId: string; sheetName: string; rowIndex: number; scanned: boolean; credentials: any; scannedColumnName?: string }) => Promise<{ success: boolean }>;
    };
  }
}