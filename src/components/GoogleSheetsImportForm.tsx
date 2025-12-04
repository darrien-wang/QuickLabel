import React, { useState } from 'react';
import { Link as LinkIcon, AlertCircle, Upload } from 'lucide-react';
import { ServiceAccountCredentials } from '../services/googleSheetsService';

interface GoogleSheetsImportFormProps {
  onImport: (url: string, sheetName: string, importAllSheets: boolean) => void;
  onCancel: () => void;
  isLoading: boolean;
  serviceAccountCredentials: ServiceAccountCredentials | null;
  onServiceAccountUpload: (credentials: ServiceAccountCredentials) => void;
}

export const GoogleSheetsImportForm: React.FC<GoogleSheetsImportFormProps> = ({
  onImport,
  onCancel,
  isLoading,
  serviceAccountCredentials,
  onServiceAccountUpload
}) => {
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [sheetName, setSheetName] = useState('Sheet1');
  const [importAllSheets, setImportAllSheets] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sheetsUrl.trim()) {
      if (importAllSheets) {
        onImport(sheetsUrl.trim(), '', true);
      } else if (sheetName.trim()) {
        onImport(sheetsUrl.trim(), sheetName.trim(), false);
      }
    }
  };

  const handleServiceAccountUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const credentials = JSON.parse(text) as ServiceAccountCredentials;

      // Validate that it's a service account file
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Invalid Service Account JSON file');
      }

      onServiceAccountUpload(credentials);
      alert('Service Account 配置成功！现在可以双向同步数据。');
    } catch (err: any) {
      alert(`上传失败: ${err.message}`);
    }

    // Reset file input
    e.target.value = '';
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">How to use:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
            <li>Upload your Service Account JSON file below</li>
            <li>Open your Google Sheet and share it with the Service Account email</li>
            <li>Copy the sheet URL and paste it below</li>
          </ol>
        </div>
      </div>

      {/* URL Input */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Google Sheets URL
        </label>
        <div className="relative">
          <input
            type="url"
            className="w-full pl-12 pr-4 py-3 text-base bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-0 transition-colors"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetsUrl}
            onChange={(e) => setSheetsUrl(e.target.value)}
            required
            disabled={isLoading}
          />
          <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        </div>
      </div>

      {/* Sheet Name Input */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-semibold text-gray-700">
            Sheet Name
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              checked={importAllSheets}
              onChange={(e) => setImportAllSheets(e.target.checked)}
              disabled={isLoading}
            />
            Import All Sheets
          </label>
        </div>
        <div className="relative">
          <input
            type="text"
            className={`w-full px-4 py-3 text-base bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-0 transition-colors ${importAllSheets ? 'opacity-50 cursor-not-allowed' : ''}`}
            placeholder="e.g. Sheet1"
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            required={!importAllSheets}
            disabled={isLoading || importAllSheets}
          />
        </div>
      </div>

      {/* Service Account Upload */}
      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Service Account (For Two-Way Sync)</h3>
            <p className="text-xs text-gray-500 mt-0.5">Upload to enable syncing scan status back to Google Sheets</p>
          </div>
          {serviceAccountCredentials && (
            <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-medium">
              ✓ Configured
            </span>
          )}
        </div>
        <label className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-300 hover:border-green-400 rounded-lg cursor-pointer transition-colors">
          <Upload size={18} className="text-gray-500" />
          <span className="text-sm text-gray-700 font-medium">
            {serviceAccountCredentials ? 'Replace Service Account JSON' : 'Upload Service Account JSON'}
          </span>
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleServiceAccountUpload}
            disabled={isLoading}
          />
        </label>
        {serviceAccountCredentials && (
          <p className="text-xs text-gray-600 mt-2">
            Using: {serviceAccountCredentials.client_email}
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !sheetsUrl.trim() || (!importAllSheets && !sheetName.trim())}
          className="flex-1 px-4 py-3 text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Importing...' : 'Import Data'}
        </button>
      </div>
    </form>
  );
};
