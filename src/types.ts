export interface BatchRecord {
  id: string; // The primary key (Tracking Number)
  data: Record<string, any>; // The full row data
  scanned: boolean;
  scannedAt?: string;
  sheetName?: string; // The sheet this record belongs to
}

export interface LabelFieldMapping {
  stopNumber: string;      // Maps to top-right large number
  recipientName: string;   // Maps to main recipient name
  address: string;         // Maps to address line
  phone: string;           // Maps to phone/contact
  position: string;        // Maps to position/stop info
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
    sheetName?: string; // Optional if importing all sheets
    url: string;
    importAllSheets?: boolean;
  };
  fieldMapping?: LabelFieldMapping; // Column to label field mapping
  rawData?: Record<string, any>[]; // Original data for fixed cell references
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
      printHTML: (htmlContent: string, printerName?: string) => void;
      getPrinters: () => Promise<any[]>;
      fetchGoogleSheets: (params: { spreadsheetId: string; sheetName: string; credentials: any }) => Promise<any>;
      fetchAllGoogleSheets: (params: { spreadsheetId: string; credentials: any }) => Promise<any>;
      updateScanStatus: (params: { spreadsheetId: string; sheetName: string; rowIndex: number; scanned: boolean; credentials: any; scannedColumnName?: string }) => Promise<{ success: boolean }>;
      onSyncBeforeClose: (callback: () => void) => void;
      sendSyncComplete: () => void;

      // LAN Sync
      startHost: () => Promise<{ success: boolean; ip?: string; port?: number; error?: string }>;
      stopHost: () => Promise<void>;
      connectToHost: (ip: string) => Promise<{ success: boolean; error?: string }>;
      disconnectFromHost: () => Promise<void>;
      requestSync: () => Promise<{ success: boolean; error?: string }>;
      getLanStatus: () => Promise<{ mode: 'standalone' | 'host' | 'client'; port: number; isConnected: boolean; ip: string | null; targetIp: string }>;
      getLocalIp: () => Promise<string>;
      sendSyncData: (socketId: string, batches: any, activeBatchId: string | null) => void;
      broadcastScan: (scanData: any) => void;
      sendClientScan: (scanData: any) => void;

      // Events
      onSyncDataRequest: (callback: (socketId: string) => void) => void;
      onRemoteScan: (callback: (data: any) => void) => void;
      onHostConnected: (callback: () => void) => void;
      onHostConnectionError: (callback: (err: string) => void) => void;
      onSyncDataReceived: (callback: (data: { batches: any[]; activeBatchId: string | null }) => void) => void;
      onRemoteScanUpdate: (callback: (data: any) => void) => void;
    };
  }
}