// Type definitions for Electron API exposed via preload
export {};

declare global {
  interface Window {
    electronAPI?: {
      printLabel: (imgData: string) => void;
      printHTML: (htmlContent: string) => void;
    };
  }
}
