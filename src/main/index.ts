// src/main/index.ts
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { InventoryDB } from './inventory-sql'
import Database from 'better-sqlite3'

// ========================================
// GLOBAL DATABASE INSTANCES
// ========================================
let inventoryDB: InventoryDB | null = null
let purchaseDB: PurchaseDB | null = null
let returnsDB: ReturnsDB | null = null

// ========================================
// PURCHASE DATABASE CLASS
// ========================================
class PurchaseDB {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.createTable()
    console.log('✅ Purchase DB initialized at:', dbPath)
  }

  private createTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id TEXT PRIMARY KEY,
        invoiceNo TEXT NOT NULL UNIQUE,
        header TEXT NOT NULL,
        party TEXT NOT NULL,
        items TEXT NOT NULL,
        totals TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `)
    console.log('✅ Purchase invoices table created/verified')
  }

  getAll() {
    try {
      const stmt = this.db.prepare('SELECT * FROM purchase_invoices ORDER BY createdAt DESC')
      const rows = stmt.all()
      return rows.map((row: any) => ({
        id: row.id,
        invoiceNo: row.invoiceNo,
        header: JSON.parse(row.header),
        party: JSON.parse(row.party),
        items: JSON.parse(row.items),
        totals: JSON.parse(row.totals),
        createdAt: row.createdAt,
      }))
    } catch (error) {
      console.error('Error getting all purchase invoices:', error)
      return []
    }
  }

  getById(id: string) {
    try {
      const stmt = this.db.prepare('SELECT * FROM purchase_invoices WHERE id = ?')
      const row = stmt.get(id) as any
      if (!row) return null
      return {
        id: row.id,
        invoiceNo: row.invoiceNo,
        header: JSON.parse(row.header),
        party: JSON.parse(row.party),
        items: JSON.parse(row.items),
        totals: JSON.parse(row.totals),
        createdAt: row.createdAt,
      }
    } catch (error) {
      console.error('Error getting purchase invoice by ID:', error)
      return null
    }
  }

  getByProduct(itemCode: string, batch: string) {
    try {
      const allInvoices = this.getAll()
      return allInvoices.filter((invoice: any) => 
        invoice.items.some((item: any) => 
          item.productName?.toLowerCase().includes(itemCode.toLowerCase()) ||
          (batch && item.batch?.toLowerCase().includes(batch.toLowerCase()))
        )
      )
    } catch (error) {
      console.error('Error searching purchase invoices by product:', error)
      return []
    }
  }

  search(query: string) {
    try {
      const allInvoices = this.getAll()
      const lowerQuery = query.toLowerCase()
      return allInvoices.filter((invoice: any) => 
        invoice.invoiceNo.toLowerCase().includes(lowerQuery) ||
        invoice.party.name.toLowerCase().includes(lowerQuery) ||
        invoice.items.some((item: any) => item.productName?.toLowerCase().includes(lowerQuery))
      )
    } catch (error) {
      console.error('Error searching purchase invoices:', error)
      return []
    }
  }

  deleteInvoice(id: string) {
    try {
      const stmt = this.db.prepare('DELETE FROM purchase_invoices WHERE id = ?')
      stmt.run(id)
      console.log('✅ Purchase invoice deleted:', id)
      return { success: true }
    } catch (error) {
      console.error('Error deleting purchase invoice:', error)
      return { success: false, error }
    }
  }

  create(record: any) {
    try {
      const id = `purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const createdAt = new Date().toISOString()
      const stmt = this.db.prepare(`
        INSERT INTO purchase_invoices (id, invoiceNo, header, party, items, totals, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run(
        id,
        record.invoiceNo,
        JSON.stringify(record.header),
        JSON.stringify(record.party),
        JSON.stringify(record.items),
        JSON.stringify(record.totals),
        createdAt
      )
      console.log('✅ Purchase invoice created:', record.invoiceNo)
      return { success: true, id }
    } catch (error) {
      console.error('Error creating purchase invoice:', error)
      throw error
    }
  }
}

// ========================================
// RETURNS DATABASE CLASS
// ========================================
class ReturnsDB {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.createTable()
    console.log('✅ Returns DB initialized at:', dbPath)
  }

  private createTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS returns (
        id TEXT PRIMARY KEY,
        returnNo TEXT NOT NULL UNIQUE,
        originalInvoiceNo TEXT NOT NULL,
        returnDate TEXT NOT NULL,
        reason TEXT NOT NULL,
        items TEXT NOT NULL,
        totalReturnAmount REAL NOT NULL,
        refundMethod TEXT NOT NULL,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `)
    console.log('✅ Returns table created/verified')
  }

  getAll() {
    try {
      const stmt = this.db.prepare('SELECT * FROM returns ORDER BY createdAt DESC')
      const rows = stmt.all()
      return rows.map((row: any) => ({
        ...row,
        items: JSON.parse(row.items),
      }))
    } catch (error) {
      console.error('Error getting all returns:', error)
      return []
    }
  }

  create(record: any) {
    try {
      const id = `return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const createdAt = new Date().toISOString()
      const stmt = this.db.prepare(`
        INSERT INTO returns (id, returnNo, originalInvoiceNo, returnDate, reason, items, totalReturnAmount, refundMethod, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run(
        id,
        record.returnNo,
        record.originalInvoiceNo,
        record.returnDate,
        record.reason,
        JSON.stringify(record.items),
        record.totalReturnAmount,
        record.refundMethod,
        record.status,
        createdAt
      )
      console.log('✅ Return created:', record.returnNo)
      return { success: true, id }
    } catch (error) {
      console.error('Error creating return:', error)
      throw error
    }
  }

  getByInvoice(invoiceNo: string) {
    try {
      const stmt = this.db.prepare('SELECT * FROM returns WHERE originalInvoiceNo = ?')
      const rows = stmt.all(invoiceNo)
      return rows.map((row: any) => ({
        ...row,
        items: JSON.parse(row.items),
      }))
    } catch (error) {
      console.error('Error getting returns by invoice:', error)
      return []
    }
  }
}

// ========================================
// CREATE WINDOW FUNCTION
// ========================================
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

// ========================================
// REGISTER INVENTORY IPC HANDLERS
// ========================================
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

  // Increment stock (for returns)
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

  // Add Product (used by Purchase Invoice)
  ipcMain.handle('inventory:addProduct', async (_event, product: any) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    try {
      const newProduct = inventoryDB.addProduct(product)
      return { success: true, product: newProduct }
    } catch (error) {
      console.error('Add product error:', error)
      return { success: false, error: String(error) }
    }
  })

  // Update Product (used by Purchase Invoice)
  ipcMain.handle('inventory:updateProduct', async (_event, id: string, updates: any) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    try {
      const updatedProduct = inventoryDB.updateProduct(id, updates)
      if (updatedProduct) {
        return { success: true, product: updatedProduct }
      }
      return { success: false, error: 'Product not found' }
    } catch (error) {
      console.error('Update product error:', error)
      return { success: false, error: String(error) }
    }
  })

  // Increment Stock by Code and Batch (used by Purchase Invoice)
  ipcMain.handle('inventory:incrementStockByCodeBatch', async (_event, code: string, batch: string, qty: number) => {
    if (!inventoryDB) throw new Error('Database not initialized')
    try {
      const result = inventoryDB.incrementStockByCodeBatch(code, batch, qty)
      return result
    } catch (error) {
      console.error('Increment stock error:', error)
      return { success: false, newStock: 0, itemName: '' }
    }
  })

  console.log('✅ All inventory IPC handlers registered')
}

// ========================================
// REGISTER PURCHASE & RETURNS IPC HANDLERS
// ========================================
function registerPurchaseHandlers(): void {
  // Purchase handlers
  ipcMain.handle('purchase:getAll', () => {
    if (!purchaseDB) throw new Error('Purchase database not initialized')
    return purchaseDB.getAll()
  })

  ipcMain.handle('purchase:getById', (_event, id: string) => {
    if (!purchaseDB) throw new Error('Purchase database not initialized')
    return purchaseDB.getById(id)
  })

  ipcMain.handle('purchase:getByProduct', (_event, itemCode: string, batch: string) => {
    if (!purchaseDB) throw new Error('Purchase database not initialized')
    return purchaseDB.getByProduct(itemCode, batch)
  })

  ipcMain.handle('purchase:search', (_event, query: string) => {
    if (!purchaseDB) throw new Error('Purchase database not initialized')
    return purchaseDB.search(query)
  })

  ipcMain.handle('purchase:delete', (_event, id: string) => {
    if (!purchaseDB) throw new Error('Purchase database not initialized')
    return purchaseDB.deleteInvoice(id)
  })

  ipcMain.handle('purchase:create', (_event, record: any) => {
    if (!purchaseDB) throw new Error('Purchase database not initialized')
    return purchaseDB.create(record)
  })

  // Returns handlers
  ipcMain.handle('returns:getAll', () => {
    if (!returnsDB) throw new Error('Returns database not initialized')
    return returnsDB.getAll()
  })

  ipcMain.handle('returns:create', (_event, record: any) => {
    if (!returnsDB) throw new Error('Returns database not initialized')
    return returnsDB.create(record)
  })

  ipcMain.handle('returns:getByInvoice', (_event, invoiceNo: string) => {
    if (!returnsDB) throw new Error('Returns database not initialized')
    return returnsDB.getByInvoice(invoiceNo)
  })

  console.log('✅ All Purchase & Returns IPC handlers registered')
}

// ========================================
// APP INITIALIZATION
// ========================================
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.whitehillsintl')

  // Initialize ALL SQLite databases FIRST
  try {
    const dbPath = app.getPath('userData')
    inventoryDB = new InventoryDB('inventory.db')
    purchaseDB = new PurchaseDB(join(dbPath, 'purchase.db'))
    returnsDB = new ReturnsDB(join(dbPath, 'returns.db'))
    console.log('✅ All SQLite Databases initialized')
    console.log('📁 Database location:', dbPath)
  } catch (error) {
    console.error('❌ Failed to initialize databases:', error)
    app.quit()
    return
  }

  // Register ALL IPC handlers BEFORE creating window
  registerInventoryHandlers()
  registerPurchaseHandlers()

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
