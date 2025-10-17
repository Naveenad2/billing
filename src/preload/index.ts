// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

// Expose inventory API to renderer process
contextBridge.exposeInMainWorld('inventory', {
  // Get all products
  getAll: () => ipcRenderer.invoke('inventory:getAll'),
  
  // Get inventory stats
  stats: () => ipcRenderer.invoke('inventory:stats'),
  
  // Get low stock products
  getLowStock: () => ipcRenderer.invoke('inventory:getLowStock'),
  
  // Get out of stock products
  getOutOfStock: () => ipcRenderer.invoke('inventory:getOutOfStock'),
  
  // Get expiring products
  getExpiring: (days: number) => ipcRenderer.invoke('inventory:getExpiring', days),
  
  // Get expired products
  getExpired: () => ipcRenderer.invoke('inventory:getExpired'),
  
  // Decrement stock by code and batch
  decrementStockByCodeBatch: (code: string, batch: string, qty: number) => 
    ipcRenderer.invoke('inventory:decrementStock', code, batch, qty),
  
  // 🔥 NEW: Increment stock by code and batch (for returns)
  incrementStockByCodeBatch: (code: string, batch: string, qty: number) => 
    ipcRenderer.invoke('inventory:incrementStock', code, batch, qty),
  
  // Search products
  search: (query: string) => ipcRenderer.invoke('inventory:search', query),
  
  // Get categories
  getCategories: () => ipcRenderer.invoke('inventory:getCategories'),
  
  // Bulk add for Excel import
  bulkAdd: (products: any[]) => ipcRenderer.invoke('inventory:bulkAdd', products),
  
  // Get by item code (for duplicate check)
  getByItemCode: (code: string) => ipcRenderer.invoke('inventory:getByCode', code),
});

// Type definitions for TypeScript
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
    inventory: InventoryAPI;
  }
}
