// src/main/inventory-sql.ts
// Professional SQLite inventory database for Electron billing app
// Preserves all 33 Product fields with ACID transactions, indexes, and type safety

import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';

/***** Type Definitions *****/
export interface Product {
  // Core identification
  id: string;
  itemCode: string;
  itemName: string;
  regionalName?: string;

  // Classification
  hsnCode: string;
  batch?: string;
  category: string;
  manufacturer?: string;

  // Pricing
  rol: number;
  altUnit?: string;
  pack: string;
  purchasePrice: number;
  sellingPriceTab: number;
  mrp: number;

  // Stock management
  stockQuantity: number;
  minStockLevel: number;
  maxStockLevel: number;

  // Tax fields
  cgstRate: number;
  sgstRate: number;
  igstRate: number;

  // Tax inclusion flags
  prTaxIncluded: boolean;
  slTaxIncluded: boolean;

  // Expiry tracking
  hasExpiryDate: boolean;
  expiryDate?: string;

  // Legacy/optional fields
  productCode?: string;
  productName?: string;
  shortKey?: string;
  brand?: string;
  unit?: string;
  sellingPrice?: number;
  supplier?: string;
  barcode?: string;
  description?: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface InventoryStats {
  totalProducts: number;
  totalItems: number;
  totalQuantity: number;
  totalStockValue: number;
  totalCostValue: number;
  totalMRPValue: number;
  lowStockCount: number;
  lowStockItems: number;
  expiredCount: number;
  expiringCount: number;
  categoriesCount: number;
  outOfStockCount: number;
  outOfStockItems: number;
}

/***** SQLite Database Class *****/
export class InventoryDB {
  private db: Database.Database;

  constructor(filename = 'inventory.db') {
    const dbPath = path.join(app.getPath('userData'), filename);
    this.db = new Database(dbPath);
    
    // Performance and reliability settings
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id               TEXT PRIMARY KEY,
        itemCode         TEXT NOT NULL COLLATE NOCASE,
        itemName         TEXT NOT NULL COLLATE NOCASE,
        regionalName     TEXT COLLATE NOCASE,

        hsnCode          TEXT NOT NULL COLLATE NOCASE,
        batch            TEXT COLLATE NOCASE,
        category         TEXT NOT NULL COLLATE NOCASE,
        manufacturer     TEXT COLLATE NOCASE,

        rol              REAL NOT NULL DEFAULT 0,
        altUnit          TEXT,
        pack             TEXT NOT NULL DEFAULT '1',
        purchasePrice    REAL NOT NULL DEFAULT 0,
        sellingPriceTab  REAL NOT NULL DEFAULT 0,
        mrp              REAL NOT NULL DEFAULT 0,

        stockQuantity    INTEGER NOT NULL DEFAULT 0,
        minStockLevel    REAL NOT NULL DEFAULT 0,
        maxStockLevel    REAL NOT NULL DEFAULT 0,

        cgstRate         REAL NOT NULL DEFAULT 0,
        sgstRate         REAL NOT NULL DEFAULT 0,
        igstRate         REAL NOT NULL DEFAULT 0,

        prTaxIncluded    INTEGER NOT NULL DEFAULT 0,
        slTaxIncluded    INTEGER NOT NULL DEFAULT 0,

        hasExpiryDate    INTEGER NOT NULL DEFAULT 0,
        expiryDate       TEXT,

        productCode      TEXT COLLATE NOCASE,
        productName      TEXT COLLATE NOCASE,
        shortKey         TEXT COLLATE NOCASE,
        brand            TEXT COLLATE NOCASE,
        unit             TEXT COLLATE NOCASE,
        sellingPrice     REAL,
        supplier         TEXT COLLATE NOCASE,
        barcode          TEXT COLLATE NOCASE,
        description      TEXT,

        createdAt        TEXT NOT NULL,
        updatedAt        TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_products_code        ON products(itemCode);
      CREATE INDEX IF NOT EXISTS idx_products_name        ON products(itemName);
      CREATE INDEX IF NOT EXISTS idx_products_code_batch  ON products(itemCode, batch);
      CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_mfg         ON products(manufacturer);
      CREATE INDEX IF NOT EXISTS idx_products_hsn         ON products(hsnCode);
      CREATE INDEX IF NOT EXISTS idx_products_barcode     ON products(barcode);
      CREATE INDEX IF NOT EXISTS idx_products_expiry      ON products(expiryDate);
      CREATE INDEX IF NOT EXISTS idx_products_stock       ON products(stockQuantity);
    `);
  }

  private productToRow(p: Product): any {
    return {
      id: p.id,
      itemCode: p.itemCode,
      itemName: p.itemName,
      regionalName: p.regionalName ?? null,
      hsnCode: p.hsnCode,
      batch: p.batch ?? null,
      category: p.category,
      manufacturer: p.manufacturer ?? null,
      rol: p.rol,
      altUnit: p.altUnit ?? null,
      pack: p.pack,
      purchasePrice: p.purchasePrice,
      sellingPriceTab: p.sellingPriceTab,
      mrp: p.mrp,
      stockQuantity: p.stockQuantity,
      minStockLevel: p.minStockLevel,
      maxStockLevel: p.maxStockLevel,
      cgstRate: p.cgstRate,
      sgstRate: p.sgstRate,
      igstRate: p.igstRate,
      prTaxIncluded: p.prTaxIncluded ? 1 : 0,
      slTaxIncluded: p.slTaxIncluded ? 1 : 0,
      hasExpiryDate: p.hasExpiryDate ? 1 : 0,
      expiryDate: p.expiryDate ?? null,
      productCode: p.productCode ?? p.itemCode,
      productName: p.productName ?? p.itemName,
      shortKey: p.shortKey ?? null,
      brand: p.brand ?? null,
      unit: p.unit ?? null,
      sellingPrice: p.sellingPrice ?? p.sellingPriceTab,
      supplier: p.supplier ?? null,
      barcode: p.barcode ?? null,
      description: p.description ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    };
  }

  /************ CRUD Operations ************/
  
  getAllProducts(): Product[] {
    const stmt = this.db.prepare('SELECT * FROM products ORDER BY datetime(createdAt) DESC');
    return stmt.all() as Product[];
  }

  getProductById(id: string): Product | undefined {
    const stmt = this.db.prepare('SELECT * FROM products WHERE id = ?');
    return stmt.get(id) as Product | undefined;
  }

  getProductByItemCode(itemCode: string): Product | undefined {
    const stmt = this.db.prepare('SELECT * FROM products WHERE itemCode = ? COLLATE NOCASE LIMIT 1');
    return stmt.get(itemCode) as Product | undefined;
  }

  searchProducts(term: string): Product[] {
    const q = `%${term.trim()}%`;
    const stmt = this.db.prepare(`
      SELECT * FROM products
      WHERE itemName     LIKE ? COLLATE NOCASE
         OR itemCode     LIKE ? COLLATE NOCASE
         OR regionalName LIKE ? COLLATE NOCASE
         OR shortKey     LIKE ? COLLATE NOCASE
         OR barcode      LIKE ? COLLATE NOCASE
         OR batch        LIKE ? COLLATE NOCASE
         OR hsnCode      LIKE ? COLLATE NOCASE
      ORDER BY itemName COLLATE NOCASE
    `);
    return stmt.all(q, q, q, q, q, q, q) as Product[];
  }

  addProduct(input: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product {
    const now = new Date().toISOString();
    const product: Product = {
      ...input,
      id: `PROD-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      productCode: input.itemCode,
      productName: input.itemName,
      sellingPrice: input.sellingPriceTab,
      minStockLevel: input.rol,
      createdAt: now,
      updatedAt: now
    };

    const stmt = this.db.prepare(`
      INSERT INTO products (
        id, itemCode, itemName, regionalName, hsnCode, batch, category, manufacturer,
        rol, altUnit, pack, purchasePrice, sellingPriceTab, mrp,
        stockQuantity, minStockLevel, maxStockLevel,
        cgstRate, sgstRate, igstRate, prTaxIncluded, slTaxIncluded,
        hasExpiryDate, expiryDate,
        productCode, productName, shortKey, brand, unit, sellingPrice,
        supplier, barcode, description, createdAt, updatedAt
      ) VALUES (
        @id, @itemCode, @itemName, @regionalName, @hsnCode, @batch, @category, @manufacturer,
        @rol, @altUnit, @pack, @purchasePrice, @sellingPriceTab, @mrp,
        @stockQuantity, @minStockLevel, @maxStockLevel,
        @cgstRate, @sgstRate, @igstRate, @prTaxIncluded, @slTaxIncluded,
        @hasExpiryDate, @expiryDate,
        @productCode, @productName, @shortKey, @brand, @unit, @sellingPrice,
        @supplier, @barcode, @description, @createdAt, @updatedAt
      )
    `);
    stmt.run(this.productToRow(product));
    return product;
  }

  updateProduct(id: string, updates: Partial<Product>): Product | null {
    const current = this.getProductById(id);
    if (!current) return null;

    const merged: Product = {
      ...current,
      ...updates,
      productCode: updates.itemCode ?? current.itemCode,
      productName: updates.itemName ?? current.itemName,
      sellingPrice: updates.sellingPriceTab ?? current.sellingPriceTab,
      updatedAt: new Date().toISOString()
    };

    const stmt = this.db.prepare(`
      UPDATE products SET
        itemCode=@itemCode, itemName=@itemName, regionalName=@regionalName,
        hsnCode=@hsnCode, batch=@batch, category=@category, manufacturer=@manufacturer,
        rol=@rol, altUnit=@altUnit, pack=@pack,
        purchasePrice=@purchasePrice, sellingPriceTab=@sellingPriceTab, mrp=@mrp,
        stockQuantity=@stockQuantity, minStockLevel=@minStockLevel, maxStockLevel=@maxStockLevel,
        cgstRate=@cgstRate, sgstRate=@sgstRate, igstRate=@igstRate,
        prTaxIncluded=@prTaxIncluded, slTaxIncluded=@slTaxIncluded,
        hasExpiryDate=@hasExpiryDate, expiryDate=@expiryDate,
        productCode=@productCode, productName=@productName, shortKey=@shortKey,
        brand=@brand, unit=@unit, sellingPrice=@sellingPrice,
        supplier=@supplier, barcode=@barcode, description=@description,
        updatedAt=@updatedAt
      WHERE id=@id
    `);
    stmt.run(this.productToRow(merged));
    return merged;
  }

  deleteProduct(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM products WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /************ Stock Operations ************/
  
  updateStock(id: string, quantity: number, type: 'add' | 'subtract'): Product | null {
    const product = this.getProductById(id);
    if (!product) return null;

    const newStock = type === 'add' 
      ? product.stockQuantity + quantity 
      : Math.max(0, product.stockQuantity - quantity);

    const stmt = this.db.prepare('UPDATE products SET stockQuantity = ?, updatedAt = ? WHERE id = ?');
    stmt.run(newStock, new Date().toISOString(), id);
    
    return this.getProductById(id) ?? null;
  }

  getStockByCodeBatch(itemCode: string, batch: string): { id: string; stock: number } {
    const stmt = this.db.prepare(`
      SELECT id, stockQuantity as stock FROM products
      WHERE itemCode = ? COLLATE NOCASE AND ifnull(batch,'') = ifnull(?,'')
      LIMIT 1
    `);
    const result = stmt.get(itemCode.trim(), batch.trim()) as any;
    return result ?? { id: '', stock: 0 };
  }

  decrementStockByCodeBatch(code: string, batch: string, qty: number): { 
    success: boolean; 
    newStock: number; 
    itemName: string 
  } {
    const trx = this.db.transaction((itemCode: string, batchVal: string, quantity: number) => {
      const stmt = this.db.prepare(`
        SELECT id, itemName, stockQuantity FROM products
        WHERE itemCode = ? COLLATE NOCASE AND ifnull(batch,'') = ifnull(?,'')
        LIMIT 1
      `);
      const row = stmt.get(itemCode, batchVal) as any;

      if (!row) return { success: false, newStock: 0, itemName: '' };

      const newStock = Math.max(0, row.stockQuantity - quantity);
      const updateStmt = this.db.prepare('UPDATE products SET stockQuantity = ?, updatedAt = ? WHERE id = ?');
      updateStmt.run(newStock, new Date().toISOString(), row.id);

      return { success: true, newStock, itemName: row.itemName };
    });

    return trx(code.trim(), batch.trim(), qty);
  }

  // 🔥 ADD THIS - Increment stock for product returns
  incrementStockByCodeBatch(code: string, batch: string, qty: number): { 
    success: boolean; 
    newStock: number; 
    itemName: string 
  } {
    const trx = this.db.transaction((itemCode: string, batchVal: string, quantity: number) => {
      const stmt = this.db.prepare(`
        SELECT id, itemName, stockQuantity FROM products
        WHERE itemCode = ? COLLATE NOCASE AND ifnull(batch,'') = ifnull(?,'')
        LIMIT 1
      `);
      const row = stmt.get(itemCode, batchVal) as any;

      if (!row) return { success: false, newStock: 0, itemName: '' };

      const newStock = row.stockQuantity + quantity; // ADD instead of subtract
      const updateStmt = this.db.prepare('UPDATE products SET stockQuantity = ?, updatedAt = ? WHERE id = ?');
      updateStmt.run(newStock, new Date().toISOString(), row.id);

      return { success: true, newStock, itemName: row.itemName };
    });

    return trx(code.trim(), batch.trim(), qty);
  }


  /************ Filters & Queries ************/
  
  getLowStockProducts(): Product[] {
    const stmt = this.db.prepare('SELECT * FROM products WHERE stockQuantity <= rol AND stockQuantity > 0');
    return stmt.all() as Product[];
  }

  getOutOfStockProducts(): Product[] {
    const stmt = this.db.prepare('SELECT * FROM products WHERE stockQuantity = 0');
    return stmt.all() as Product[];
  }

  getProductsByCategory(category: string): Product[] {
    const stmt = this.db.prepare('SELECT * FROM products WHERE category = ? COLLATE NOCASE');
    return stmt.all(category) as Product[];
  }

  getProductsByManufacturer(manufacturer: string): Product[] {
    const stmt = this.db.prepare('SELECT * FROM products WHERE manufacturer = ? COLLATE NOCASE');
    return stmt.all(manufacturer) as Product[];
  }

  getProductsByBatch(batch: string): Product[] {
    const stmt = this.db.prepare('SELECT * FROM products WHERE batch = ? COLLATE NOCASE');
    return stmt.all(batch) as Product[];
  }

  getExpiringProducts(daysThreshold = 30): Product[] {
    const now = new Date();
    const future = new Date(now.getTime() + daysThreshold * 86400000);
    const stmt = this.db.prepare(`
      SELECT * FROM products
      WHERE hasExpiryDate = 1 AND expiryDate IS NOT NULL
        AND expiryDate BETWEEN ? AND ?
      ORDER BY expiryDate
    `);
    return stmt.all(now.toISOString(), future.toISOString()) as Product[];
  }

  getExpiredProducts(): Product[] {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM products
      WHERE hasExpiryDate = 1 AND expiryDate IS NOT NULL AND expiryDate < ?
    `);
    return stmt.all(now) as Product[];
  }

  getProductsWithTaxIncluded(type: 'purchase' | 'selling'): Product[] {
    const field = type === 'purchase' ? 'prTaxIncluded' : 'slTaxIncluded';
    const stmt = this.db.prepare(`SELECT * FROM products WHERE ${field} = 1`);
    return stmt.all() as Product[];
  }

  getUniqueCategories(): string[] {
    const stmt = this.db.prepare('SELECT DISTINCT category FROM products ORDER BY category COLLATE NOCASE');
    const rows = stmt.all() as Array<{ category: string }>;
    return rows.map(r => r.category);
  }

  calculateTotalStockValue(): number {
    const stmt = this.db.prepare('SELECT SUM(stockQuantity * purchasePrice) as total FROM products');
    const result = stmt.get() as { total: number | null };
    return result?.total ?? 0;
  }

  /************ Stats & Reporting ************/
  
  getInventoryStats(): InventoryStats {
    const totals = this.db.prepare(`
      SELECT
        COUNT(*) as totalProducts,
        SUM(stockQuantity) as totalQuantity,
        SUM(stockQuantity * purchasePrice) as totalStockValue,
        SUM(stockQuantity * mrp) as totalMRPValue
      FROM products
    `).get() as any;

    const lowStock = this.db.prepare('SELECT COUNT(*) as c FROM products WHERE stockQuantity <= rol AND stockQuantity > 0').get() as any;
    const outOfStock = this.db.prepare('SELECT COUNT(*) as c FROM products WHERE stockQuantity = 0').get() as any;
    const expired = this.db.prepare('SELECT COUNT(*) as c FROM products WHERE hasExpiryDate = 1 AND expiryDate < ?').get(new Date().toISOString()) as any;
    const expiring = this.getExpiringProducts(30).length;
    const categories = this.getUniqueCategories().length;

    return {
      totalProducts: Number(totals?.totalProducts ?? 0),
      totalItems: Number(totals?.totalProducts ?? 0),
      totalQuantity: Number(totals?.totalQuantity ?? 0),
      totalStockValue: Number(totals?.totalStockValue ?? 0),
      totalCostValue: Number(totals?.totalStockValue ?? 0),
      totalMRPValue: Number(totals?.totalMRPValue ?? 0),
      lowStockCount: Number(lowStock?.c ?? 0),
      lowStockItems: Number(lowStock?.c ?? 0),
      expiredCount: Number(expired?.c ?? 0),
      expiringCount: expiring,
      categoriesCount: categories,
      outOfStockCount: Number(outOfStock?.c ?? 0),
      outOfStockItems: Number(outOfStock?.c ?? 0)
    };
  }

  /************ Bulk Operations ************/
  
  bulkAddProducts(products: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[]): Product[] {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO products (
        id, itemCode, itemName, regionalName, hsnCode, batch, category, manufacturer,
        rol, altUnit, pack, purchasePrice, sellingPriceTab, mrp,
        stockQuantity, minStockLevel, maxStockLevel,
        cgstRate, sgstRate, igstRate, prTaxIncluded, slTaxIncluded,
        hasExpiryDate, expiryDate,
        productCode, productName, shortKey, brand, unit, sellingPrice,
        supplier, barcode, description, createdAt, updatedAt
      ) VALUES (
        @id, @itemCode, @itemName, @regionalName, @hsnCode, @batch, @category, @manufacturer,
        @rol, @altUnit, @pack, @purchasePrice, @sellingPriceTab, @mrp,
        @stockQuantity, @minStockLevel, @maxStockLevel,
        @cgstRate, @sgstRate, @igstRate, @prTaxIncluded, @slTaxIncluded,
        @hasExpiryDate, @expiryDate,
        @productCode, @productName, @shortKey, @brand, @unit, @sellingPrice,
        @supplier, @barcode, @description, @createdAt, @updatedAt
      )
    `);

    const insertMany = this.db.transaction((items: Product[]) => {
      for (const item of items) {
        stmt.run(this.productToRow(item));
      }
    });

    const toInsert: Product[] = products.map(p => ({
      ...p,
      id: `PROD-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      productCode: p.itemCode,
      productName: p.itemName,
      sellingPrice: p.sellingPriceTab,
      minStockLevel: p.rol,
      createdAt: now,
      updatedAt: now
    }));

    insertMany(toInsert);
    return toInsert;
  }

  exportAllProducts(): string {
    return JSON.stringify(this.getAllProducts(), null, 2);
  }

  importProducts(jsonData: string): boolean {
    try {
      const products = JSON.parse(jsonData) as Product[];
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO products (
          id, itemCode, itemName, regionalName, hsnCode, batch, category, manufacturer,
          rol, altUnit, pack, purchasePrice, sellingPriceTab, mrp,
          stockQuantity, minStockLevel, maxStockLevel,
          cgstRate, sgstRate, igstRate, prTaxIncluded, slTaxIncluded,
          hasExpiryDate, expiryDate,
          productCode, productName, shortKey, brand, unit, sellingPrice,
          supplier, barcode, description, createdAt, updatedAt
        ) VALUES (
          @id, @itemCode, @itemName, @regionalName, @hsnCode, @batch, @category, @manufacturer,
          @rol, @altUnit, @pack, @purchasePrice, @sellingPriceTab, @mrp,
          @stockQuantity, @minStockLevel, @maxStockLevel,
          @cgstRate, @sgstRate, @igstRate, @prTaxIncluded, @slTaxIncluded,
          @hasExpiryDate, @expiryDate,
          @productCode, @productName, @shortKey, @brand, @unit, @sellingPrice,
          @supplier, @barcode, @description, @createdAt, @updatedAt
        )
      `);

      const importMany = this.db.transaction((items: Product[]) => {
        for (const item of items) {
          stmt.run(this.productToRow(item));
        }
      });

      importMany(products);
      return true;
    } catch (error) {
      console.error('Import failed:', error);
      return false;
    }
  }

  clearAllProducts(): boolean {
    const stmt = this.db.prepare('DELETE FROM products');
    stmt.run();
    return true;
  }
}
