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
