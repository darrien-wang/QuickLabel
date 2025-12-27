/**
 * Google Sheets Integration Service
 * Uses Electron IPC to communicate with main process
 */

export interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

export interface SheetsData {
  headers: string[];
  data: any[];
  spreadsheetId: string;
  sheetName: string;
}

/**
 * Parse Google Sheets URL to extract spreadsheet ID
 */
export const parseGoogleSheetsUrl = (url: string): string | null => {
  const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

/**
 * Fetch data from Google Sheets using Electron IPC
 */
export const fetchGoogleSheetsData = async (
  spreadsheetId: string,
  sheetName: string,
  credentials: ServiceAccountCredentials
): Promise<SheetsData> => {
  if (!window.electronAPI?.fetchGoogleSheets) {
    throw new Error('Electron API not available. This feature only works in the Electron app.');
  }

  try {
    const result = await window.electronAPI.fetchGoogleSheets({
      spreadsheetId,
      sheetName,
      credentials
    });

    return result;
  } catch (err: any) {
    console.error('fetchGoogleSheetsData error:', err);
    throw new Error(`连接 Google Sheets 失败: ${err.message}`);
  }
};

/**
 * Fetch data from ALL sheets in a Google Spreadsheet
 */
export const fetchAllGoogleSheetsData = async (
  spreadsheetId: string,
  credentials: ServiceAccountCredentials
): Promise<SheetsData> => {
  if (!window.electronAPI?.fetchAllGoogleSheets) {
    throw new Error('Electron API not available.');
  }

  try {
    const result = await window.electronAPI.fetchAllGoogleSheets({
      spreadsheetId,
      credentials
    });

    return result;
  } catch (err: any) {
    console.error('fetchAllGoogleSheetsData error:', err);
    throw new Error(`连接 Google Sheets 失败: ${err.message}`);
  }
};

/**
 * Update scan status in Google Sheets
 * Marks a specific row as scanned
 */
export const updateScanStatus = async (
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number, // 0-based data index (excluding header) - deprecated, use orderId instead
  scanned: boolean,
  credentials: ServiceAccountCredentials,
  scannedColumnName: string = 'ScannedAt', // Column name to update
  orderId?: string, // The actual Order ID to search for
  primaryKeyColumn?: string // The primary key column name
): Promise<void> => {
  if (!window.electronAPI?.updateScanStatus) {
    throw new Error('Electron API not available. This feature only works in the Electron app.');
  }

  try {
    await window.electronAPI.updateScanStatus({
      spreadsheetId,
      sheetName,
      rowIndex,
      scanned,
      credentials,
      scannedColumnName,
      orderId,
      primaryKeyColumn
    });

    console.log(`✅ 已同步扫描状态到 Google Sheets: Order ID: ${orderId}`);
  } catch (err: any) {
    console.error(`❌ 更新扫描状态失败:`, err);
    throw new Error(`更新 Google Sheets 失败: ${err.message}`);
  }
};

/**
 * Batch update scan status in Google Sheets
 * Updates multiple rows in one API call
 */
export const batchUpdateScanStatus = async (
  spreadsheetId: string,
  sheetName: string,
  updates: Array<{ orderId: string; primaryKeyColumn: string }>,
  credentials: ServiceAccountCredentials
): Promise<{ success: boolean; updated: number }> => {
  if (!window.electronAPI?.batchUpdateScanStatus) {
    throw new Error('Electron API not available. This feature only works in the Electron app.');
  }

  try {
    const result = await window.electronAPI.batchUpdateScanStatus({
      spreadsheetId,
      sheetName,
      updates,
      credentials
    });

    console.log(`✅ 批量同步成功: ${result.updated} 条记录`);
    return result;
  } catch (err: any) {
    console.error(`❌ 批量更新失败:`, err);
    throw new Error(`批量更新 Google Sheets 失败: ${err.message}`);
  }
};
