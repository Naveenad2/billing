// src/main/index.ts (or electron/main/index.ts)
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { InventoryDB } from './inventory-sql' // Import SQLite class

// Global database instance
let inventoryDB: InventoryDB | null = null

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Register all inventory IPC handlers
 * Must be called BEFORE creating any windows
 */
function registerInventoryHandlers(): void {
  // Get all products
  ipcMain.handle('inventory:getAll', async () => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getAllProducts()
  })

  // Get inventory stats
  ipcMain.handle('inventory:stats', async () => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getInventoryStats()
  })

  // Get low stock products
  ipcMain.handle('inventory:getLowStock', async () => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getLowStockProducts()
  })



  // Get out of stock products
  ipcMain.handle('inventory:getOutOfStock', async () => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getOutOfStockProducts()
  })

  // Get expiring products
  ipcMain.handle('inventory:getExpiring', async (_event, days: number = 30) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getExpiringProducts(days)
  })

  // Get expired products
  ipcMain.handle('inventory:getExpired', async () => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getExpiredProducts()
  })

// Decrement stock (for sales)
ipcMain.handle('inventory:decrementStock', async (_event, code: string, batch: string, qty: number) => {
  if (!inventoryDB) throw new Error('Database not initialized')
  return inventoryDB.decrementStockByCodeBatch(code, batch, qty)
})

// 🔥 NEW: Increment stock (for returns)
ipcMain.handle('inventory:incrementStock', async (_event, code: string, batch: string, qty: number) => {
  if (!inventoryDB) throw new Error('Database not initialized')
  return inventoryDB.incrementStockByCodeBatch(code, batch, qty)
})
  // Search products
  ipcMain.handle('inventory:search', async (_event, query: string) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.searchProducts(query)
  })

  // Get categories
  ipcMain.handle('inventory:getCategories', async () => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getUniqueCategories()
  })

  // Bulk add products (for Excel import)
  ipcMain.handle('inventory:bulkAdd', async (_event, products: any[]) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.bulkAddProducts(products)
  })

  // Add single product
  ipcMain.handle('inventory:add', async (_event, product: any) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.addProduct(product)
  })

  // Update product
  ipcMain.handle('inventory:update', async (_event, id: string, updates: any) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.updateProduct(id, updates)
  })

  // Delete product
  ipcMain.handle('inventory:delete', async (_event, id: string) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.deleteProduct(id)
  })

  // Get product by item code
  ipcMain.handle('inventory:getByCode', async (_event, code: string) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getProductByItemCode(code)
  })

  // Get product by ID
  ipcMain.handle('inventory:getById', async (_event, id: string) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getProductById(id)
  })

  // Stock operations
  ipcMain.handle('inventory:updateStock', async (_event, id: string, qty: number, type: 'add' | 'subtract') => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.updateStock(id, qty, type)
  })

  // Get stock by code + batch
  ipcMain.handle('inventory:getByCodeBatch', async (_event, code: string, batch: string) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getStockByCodeBatch(code, batch)
  })

  // Alternative name for decrement (keeping for backward compatibility)
  ipcMain.handle('inventory:decrementByCodeBatch', async (_event, code: string, batch: string, qty: number) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.decrementStockByCodeBatch(code, batch, qty)
  })

  // Filters and reports
  ipcMain.handle('inventory:getByCategory', async (_event, category: string) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getProductsByCategory(category)
  })

  ipcMain.handle('inventory:getByManufacturer', async (_event, manufacturer: string) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getProductsByManufacturer(manufacturer)
  })

  ipcMain.handle('inventory:getByBatch', async (_event, batch: string) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.getProductsByBatch(batch)
  })

  ipcMain.handle('inventory:calculateValue', async () => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.calculateTotalStockValue()
  })

  // Backup and restore
  ipcMain.handle('inventory:export', async () => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.exportAllProducts()
  })

  ipcMain.handle('inventory:import', async (_event, jsonData: string) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.importProducts(jsonData)
  })

  ipcMain.handle('inventory:clear', async () => {
    if (!inventoryDB) throw new Error('Database not initialized')
    return inventoryDB.clearAllProducts()
  })

  console.log('✅ All inventory IPC handlers registered')
}


app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.whitehillsintl')

  // 🔥 Initialize SQLite database FIRST
  try {
    inventoryDB = new InventoryDB('inventory.db')
    const dbPath = app.getPath('userData')
    console.log('✅ SQLite Database initialized')
    console.log('📁 Database location:', join(dbPath, 'inventory.db'))
  } catch (error) {
    console.error('❌ Failed to initialize database:', error)
    // Optionally show error dialog to user
    app.quit()
    return
  }

  // 🔥 Register IPC handlers BEFORE creating window
  registerInventoryHandlers()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
