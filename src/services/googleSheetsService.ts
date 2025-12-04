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
 * Update scan status in Google Sheets
 * Marks a specific row as scanned
 */
export const updateScanStatus = async (
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number, // 0-based data index (excluding header)
  scanned: boolean,
  credentials: ServiceAccountCredentials,
  scannedColumnName: string = 'Scanned' // Column name to update
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
      scannedColumnName
    });

    console.log(`✅ 已同步扫描状态到 Google Sheets: 行 ${rowIndex + 2}, 状态: ${scanned ? 'YES' : 'NO'}`);
  } catch (err: any) {
    console.error(`❌ 更新扫描状态失败:`, err);
    throw new Error(`更新 Google Sheets 失败: ${err.message}`);
  }
};
