// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

// Expose inventory API
contextBridge.exposeInMainWorld('inventory', {
  getAll: () => ipcRenderer.invoke('inventory:getAll'),
  stats: () => ipcRenderer.invoke('inventory:stats'),
  getLowStock: () => ipcRenderer.invoke('inventory:getLowStock'),
  getOutOfStock: () => ipcRenderer.invoke('inventory:getOutOfStock'),
  getExpiring: (days: number) => ipcRenderer.invoke('inventory:getExpiring', days),
  getExpired: () => ipcRenderer.invoke('inventory:getExpired'),
  decrementStock: (code: string, batch: string, qty: number) => 
    ipcRenderer.invoke('inventory:decrementStock', code, batch, qty),
  incrementStock: (code: string, batch: string, qty: number) => 
    ipcRenderer.invoke('inventory:incrementStock', code, batch, qty),
  search: (query: string) => ipcRenderer.invoke('inventory:search', query),
  getCategories: () => ipcRenderer.invoke('inventory:getCategories'),
  bulkAdd: (products: any[]) => ipcRenderer.invoke('inventory:bulkAdd', products),
  add: (product: any) => ipcRenderer.invoke('inventory:add', product),
  update: (id: string, updates: any) => ipcRenderer.invoke('inventory:update', id, updates),
  delete: (id: string) => ipcRenderer.invoke('inventory:delete', id),
  getByCode: (code: string) => ipcRenderer.invoke('inventory:getByCode', code),
  getById: (id: string) => ipcRenderer.invoke('inventory:getById', id),
  updateStock: (id: string, qty: number, type: 'add' | 'subtract') => 
    ipcRenderer.invoke('inventory:updateStock', id, qty, type),
  getByCodeBatch: (code: string, batch: string) => 
    ipcRenderer.invoke('inventory:getByCodeBatch', code, batch),
  decrementByCodeBatch: (code: string, batch: string, qty: number) => 
    ipcRenderer.invoke('inventory:decrementByCodeBatch', code, batch, qty),
  getByCategory: (category: string) => ipcRenderer.invoke('inventory:getByCategory', category),
  getByManufacturer: (manufacturer: string) => 
    ipcRenderer.invoke('inventory:getByManufacturer', manufacturer),
  getByBatch: (batch: string) => ipcRenderer.invoke('inventory:getByBatch', batch),
  calculateValue: () => ipcRenderer.invoke('inventory:calculateValue'),
  export: () => ipcRenderer.invoke('inventory:export'),
  import: (jsonData: string) => ipcRenderer.invoke('inventory:import', jsonData),
  clear: () => ipcRenderer.invoke('inventory:clear'),
  addProduct: (product: any) => ipcRenderer.invoke('inventory:addProduct', product),
  updateProduct: (id: string, updates: any) => 
    ipcRenderer.invoke('inventory:updateProduct', id, updates),
  incrementStockByCodeBatch: (code: string, batch: string, qty: number) => 
    ipcRenderer.invoke('inventory:incrementStockByCodeBatch', code, batch, qty),
})

// Expose purchase API
contextBridge.exposeInMainWorld('purchase', {
  getAll: () => ipcRenderer.invoke('purchase:getAll'),
  getById: (id: string) => ipcRenderer.invoke('purchase:getById', id),
  getByProduct: (itemCode: string, batch: string) => 
    ipcRenderer.invoke('purchase:getByProduct', itemCode, batch),
  search: (query: string) => ipcRenderer.invoke('purchase:search', query),
  delete: (id: string) => ipcRenderer.invoke('purchase:delete', id),
  create: (record: any) => ipcRenderer.invoke('purchase:create', record),
})

// Expose returns API
contextBridge.exposeInMainWorld('returns', {
  getAll: () => ipcRenderer.invoke('returns:getAll'),
  create: (record: any) => ipcRenderer.invoke('returns:create', record),
  getByInvoice: (invoiceNo: string) => ipcRenderer.invoke('returns:getByInvoice', invoiceNo),
})

console.log('✅ Preload script loaded successfully')
