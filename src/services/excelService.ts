// Assuming global XLSX is available via CDN
declare const XLSX: any;

export const parseExcelFile = async (file: File): Promise<{ headers: string[]; data: any[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (jsonData.length === 0) {
          resolve({ headers: [], data: [] });
          return;
        }

        const headers = jsonData[0] as string[];
        const rawData = jsonData.slice(1);

        const structuredData = rawData.map((row: any[]) => {
          const obj: Record<string, any> = {};
          headers.forEach((header, index) => {
            obj[header] = row[index];
          });
          return obj;
        });

        resolve({ headers, data: structuredData });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};

/**
 * Export unscanned records to an Excel file
 * @param records - Array of records with their data
 * @param fileName - The name of the file to export (without extension)
 */
export const exportUnscannedRecords = (records: Array<{ data: Record<string, any> }>, fileName: string) => {
  if (records.length === 0) {
    alert('没有未扫描的订单可以导出');
    return;
  }

  try {
    // Extract data from records
    const dataToExport = records.map(record => record.data);

    // Create worksheet from data
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Create workbook and append worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Unscanned Orders');

    // Generate file name with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const fullFileName = `${fileName}_unscanned_${timestamp}.xlsx`;

    // Trigger download
    XLSX.writeFile(workbook, fullFileName);
  } catch (err) {
    alert('导出失败，请重试');
    console.error('Export error:', err);
  }
};
