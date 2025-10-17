// src/preload/index.d.ts
import { ElectronAPI } from '@electron-toolkit/preload'

export interface InventoryAPI {
  getAll: () => Promise<any[]>;
  stats: () => Promise<any>;
  getLowStock: () => Promise<any[]>;
  getOutOfStock: () => Promise<any[]>;
  getExpiring: (days: number) => Promise<any[]>;
  getExpired: () => Promise<any[]>;
  decrementStockByCodeBatch: (code: string, batch: string, qty: number) => Promise<{
    success: boolean;
    newStock: number;
    itemName: string;
  }>;
  incrementStockByCodeBatch: (code: string, batch: string, qty: number) => Promise<{
    success: boolean;
    newStock: number;
    itemName: string;
  }>; // 🔥 NEW
  search: (query: string) => Promise<any[]>;
  getCategories: () => Promise<string[]>;
  bulkAdd: (products: any[]) => Promise<any[]>;
  getByItemCode: (code: string) => Promise<any | undefined>;
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    inventory: InventoryAPI; // 🔥 Ensure this is here
  }
}
