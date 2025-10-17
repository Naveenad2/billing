// electron/main/inventory-sql.ts
// Relational inventory database using SQLite (better-sqlite3)
// Preserves ALL fields from your Product and InventoryStats types with robust indexes and transactions.

import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';

/***** Types (unchanged) *****/
export interface Product {
  id: string;
  itemCode: string;
  itemName: string;
  regionalName?: string;

  hsnCode: string;
  batch?: string;
  category: string;
  manufacturer?: string;

  rol: number;
  altUnit?: string;
  pack: string;
  purchasePrice: number;
  sellingPriceTab: number;
  mrp: number;

  stockQuantity: number;
  minStockLevel: number;
  maxStockLevel: number;

  cgstRate: number;
  sgstRate: number;
  igstRate: number;

  prTaxIncluded: boolean;
  slTaxIncluded: boolean;

  hasExpiryDate: boolean;
  expiryDate?: string;

  productCode?: string;
  productName?: string;
  shortKey?: string;
  brand?: string;
  unit?: string;
  sellingPrice?: number;
  supplier?: string;
  barcode?: string;
  description?: string;

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

/***** InventoryDB *****/
export class InventoryDB {
  private db: Database.Database;

  constructor(filename = 'inventory.db') {
    const file = path.join(app.getPath('userData'), filename);
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.init();
  }

  private init() {
    // Full schema preserving every field; TEXT uses NOCASE where relevant
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

        rol              REAL NOT NULL,
        altUnit          TEXT,
        pack             TEXT NOT NULL,
        purchasePrice    REAL NOT NULL,
        sellingPriceTab  REAL NOT NULL,
        mrp              REAL NOT NULL,

        stockQuantity    INTEGER NOT NULL,
        minStockLevel    REAL NOT NULL,
        maxStockLevel    REAL NOT NULL,

        cgstRate         REAL NOT NULL,
        sgstRate         REAL NOT NULL,
        igstRate         REAL NOT NULL,

        prTaxIncluded    INTEGER NOT NULL,  -- 0/1
        slTaxIncluded    INTEGER NOT NULL,  -- 0/1

        hasExpiryDate    INTEGER NOT NULL,  -- 0/1
        expiryDate       TEXT,              -- ISO date string

        productCode      TEXT COLLATE NOCASE,
        productName      TEXT COLLATE NOCASE,
        shortKey         TEXT COLLATE NOCASE,
        brand            TEXT COLLATE NOCASE,
        unit             TEXT COLLATE NOCASE,
        sellingPrice     REAL,
        supplier         TEXT COLLATE NOCASE,
        barcode          TEXT COLLATE NOCASE,
        description      TEXT,

        createdAt        TEXT NOT NULL,     -- ISO
        updatedAt        TEXT NOT NULL      -- ISO
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
      CREATE INDEX IF NOT EXISTS idx_products_created     ON products(createdAt);
    `);
  }

  /************ Mappers ************/
  private toRow(p: Product): any[] {
    return [
      p.id, p.itemCode, p.itemName, p.regionalName ?? null,
      p.hsnCode, p.batch ?? null, p.category, p.manufacturer ?? null,
      p.rol, p.altUnit ?? null, p.pack, p.purchasePrice, p.sellingPriceTab, p.mrp,
      p.stockQuantity, p.minStockLevel, p.maxStockLevel,
      p.cgstRate, p.sgstRate, p.igstRate,
      p.prTaxIncluded ? 1 : 0, p.slTaxIncluded ? 1 : 0,
      p.hasExpiryDate ? 1 : 0, p.expiryDate ?? null,
      p.productCode ?? p.itemCode, p.productName ?? p.itemName, p.shortKey ?? null, p.brand ?? null, p.unit ?? null, p.sellingPrice ?? p.sellingPriceTab,
      p.supplier ?? null, p.barcode ?? null, p.description ?? null,
      p.createdAt, p.updatedAt
    ];
  }

  /************ CRUD ************/
  getAllProducts(): Product[] {
    const stmt = this.db.prepare(`SELECT * FROM products ORDER BY datetime(createdAt) DESC`);
    return stmt.all() as Product[];
  }

  getProductById(id: string): Product | undefined {
    const stmt = this.db.prepare(`SELECT * FROM products WHERE id = ?`);
    return stmt.get(id) as Product | undefined;
  }

  getProductByItemCode(itemCode: string): Product | undefined {
    const stmt = this.db.prepare(`SELECT * FROM products WHERE itemCode = ? ORDER BY datetime(updatedAt) DESC LIMIT 1`);
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
      productCode: input.productCode ?? input.itemCode,
      productName: input.productName ?? input.itemName,
      sellingPrice: input.sellingPrice ?? input.sellingPriceTab,
      minStockLevel: input.minStockLevel ?? input.rol ?? 0,
      createdAt: now,
      updatedAt: now
    };

    const stmt = this.db.prepare(`
      INSERT INTO products (
        id,itemCode,itemName,regionalName,
        hsnCode,batch,category,manufacturer,
        rol,altUnit,pack,purchasePrice,sellingPriceTab,mrp,
        stockQuantity,minStockLevel,maxStockLevel,
        cgstRate,sgstRate,igstRate,
        prTaxIncluded,slTaxIncluded,
        hasExpiryDate,expiryDate,
        productCode,productName,shortKey,brand,unit,sellingPrice,
        supplier,barcode,description,
        createdAt,updatedAt
      ) VALUES (?,?,?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?, ?,?,?, ?,?, ?,?, ?,?,?,?,?,?, ?,?,?, ?,?)
    `);
    stmt.run(...this.toRow(product));
    return product;
  }

  updateProduct(id: string, updates: Partial<Product>): Product | null {
    const current = this.getProductById(id);
    if (!current) return null;
    const merged: Product = {
      ...current,
      ...updates,
      productCode: (updates.itemCode ?? current.itemCode),
      productName: (updates.itemName ?? current.itemName),
      sellingPrice: (updates.sellingPriceTab ?? current.sellingPriceTab),
      updatedAt: new Date().toISOString()
    };

    const stmt = this.db.prepare(`
      REPLACE INTO products (
        id,itemCode,itemName,regionalName,
        hsnCode,batch,category,manufacturer,
        rol,altUnit,pack,purchasePrice,sellingPriceTab,mrp,
        stockQuantity,minStockLevel,maxStockLevel,
        cgstRate,sgstRate,igstRate,
        prTaxIncluded,slTaxIncluded,
        hasExpiryDate,expiryDate,
        productCode,productName,shortKey,brand,unit,sellingPrice,
        supplier,barcode,description,
        createdAt,updatedAt
      ) VALUES (?,?,?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?, ?,?,?, ?,?, ?,?, ?,?,?,?,?,?, ?,?,?, ?,?)
    `);
    stmt.run(...this.toRow(merged));
    return merged;
  }

  deleteProduct(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM products WHERE id = ?`);
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /************ Stock operations ************/
  updateStock(id: string, quantity: number, type: 'add' | 'subtract'): Product | null {
    const current = this.getProductById(id);
    if (!current) return null;
    const newStock = Math.max(0, type === 'add' ? current.stockQuantity + quantity : current.stockQuantity - quantity);
    current.stockQuantity = newStock;
    current.updatedAt = new Date().toISOString();
    this.updateProduct(current.id, current);
    return current;
  }

  getStockByCodeBatch(itemCode: string, batch: string): { id: string; stock: number } {
    const stmt = this.db.prepare(`
      SELECT id, stockQuantity as stock
      FROM products
      WHERE itemCode = ? AND ifnull(batch,'') = ifnull(?, '')
      ORDER BY datetime(updatedAt) DESC
      LIMIT 1
    `);
    return stmt.get(itemCode.trim(), (batch ?? '').trim()) as { id: string; stock: number } ?? { id: '', stock: 0 };
  }

  decrementStockByCodeBatch(itemCode: string, batch: string, qty: number): { success: boolean; newStock: number; itemName: string } {
    const trx = this.db.transaction((code: string, bt: string, q: number) => {
      const row = this.db.prepare(`
        SELECT id, itemName, stockQuantity
        FROM products
        WHERE itemCode = ? AND ifnull(batch,'') = ifnull(?, '')
        ORDER BY datetime(updatedAt) DESC
        LIMIT 1
      `).get(code, bt) as { id: string; itemName: string; stockQuantity: number } | undefined;

      if (!row) return { success: false, newStock: 0, itemName: '' };

      const newStock = Math.max(0, Number(row.stockQuantity || 0) - q);
      this.db.prepare(`UPDATE products SET stockQuantity = ?, updatedAt = ? WHERE id = ?`).run(newStock, new Date().toISOString(), row.id);
      return { success: true, newStock, itemName: row.itemName };
    });
    return trx(itemCode.trim(), (batch ?? '').trim(), qty);
  }

  /************ Filters & queries ************/
  getLowStockProducts(): Product[] {
    return this.db.prepare(`SELECT * FROM products WHERE stockQuantity <= rol AND stockQuantity > 0 ORDER BY itemName`).all() as Product[];
  }

  getOutOfStockProducts(): Product[] {
    return this.db.prepare(`SELECT * FROM products WHERE stockQuantity = 0 ORDER BY itemName`).all() as Product[];
  }

  getProductsByCategory(category: string): Product[] {
    return this.db.prepare(`SELECT * FROM products WHERE category = ? ORDER BY itemName`).all(category) as Product[];
  }

  getProductsByManufacturer(manufacturer: string): Product[] {
    return this.db.prepare(`SELECT * FROM products WHERE ifnull(manufacturer,'') = ? ORDER BY itemName`).all(manufacturer) as Product[];
  }

  getProductsByBatch(batch: string): Product[] {
    return this.db.prepare(`SELECT * FROM products WHERE ifnull(batch,'') = ? ORDER BY itemName`).all(batch) as Product[];
  }

  getExpiringProducts(daysThreshold = 30): Product[] {
    const now = new Date();
    const to = new Date(now.getTime() + daysThreshold * 86400000).toISOString();
    const from = now.toISOString();
    return this.db.prepare(`
      SELECT * FROM products
      WHERE hasExpiryDate = 1
        AND expiryDate IS NOT NULL
        AND expiryDate >= ?
        AND expiryDate <= ?
      ORDER BY expiryDate
    `).all(from, to) as Product[];
  }

  getExpiredProducts(): Product[] {
    const now = new Date().toISOString();
    return this.db.prepare(`
      SELECT * FROM products
      WHERE hasExpiryDate = 1 AND expiryDate IS NOT NULL AND expiryDate < ?
      ORDER BY expiryDate
    `).all(now) as Product[];
  }

  getProductsWithTaxIncluded(type: 'purchase' | 'selling'): Product[] {
    if (type === 'purchase') {
      return this.db.prepare(`SELECT * FROM products WHERE prTaxIncluded = 1`).all() as Product[];
    }
    return this.db.prepare(`SELECT * FROM products WHERE slTaxIncluded = 1`).all() as Product[];
  }

  getUniqueCategories(): string[] {
    const rows = this.db.prepare(`SELECT DISTINCT category FROM products ORDER BY lower(category)`).all() as { category: string }[];
    return rows.map(r => r.category);
  }

  // 🔥 UPDATED: Calculate total stock value using ONLY selling rate (SRate/sellingPriceTab)
  calculateTotalStockValue(): number {
    const row = this.db.prepare(`SELECT SUM(stockQuantity * sellingPriceTab) AS val FROM products`).get() as { val: number };
    return Number(row?.val || 0);
  }
  // Add stock back when products are returned
incrementStockByCodeBatch(itemCode: string, batch: string, qty: number): { success: boolean; newStock: number; itemName: string } {
  const trx = this.db.transaction((code: string, bt: string, q: number) => {
    const row = this.db.prepare(`
      SELECT id, itemName, stockQuantity
      FROM products
      WHERE itemCode = ? AND ifnull(batch,'') = ifnull(?, '')
      ORDER BY datetime(updatedAt) DESC
      LIMIT 1
    `).get(code, bt) as { id: string; itemName: string; stockQuantity: number } | undefined;

    if (!row) return { success: false, newStock: 0, itemName: '' };

    const newStock = Number(row.stockQuantity || 0) + q;
    this.db.prepare(`UPDATE products SET stockQuantity = ?, updatedAt = ? WHERE id = ?`).run(newStock, new Date().toISOString(), row.id);
    return { success: true, newStock, itemName: row.itemName };
  });
  return trx(itemCode.trim(), (batch ?? '').trim(), qty);
}


  /************ Stats & reporting ************/
  // 🔥 UPDATED: getInventoryStats now uses sellingPriceTab for totalStockValue
  getInventoryStats(): InventoryStats {
    const totals = this.db.prepare(`
      SELECT
        COUNT(*)                             AS totalProducts,
        SUM(stockQuantity)                   AS totalQuantity,
        SUM(stockQuantity * sellingPriceTab) AS totalStockValue,
        SUM(stockQuantity * purchasePrice)   AS totalCostValue,
        SUM(stockQuantity * mrp)             AS totalMRPValue
      FROM products
    `).get() as any;

    const lowStock = this.db.prepare(`SELECT COUNT(*) AS c FROM products WHERE stockQuantity <= rol AND stockQuantity > 0`).get() as any;
    const outOf   = this.db.prepare(`SELECT COUNT(*) AS c FROM products WHERE stockQuantity = 0`).get() as any;
    const expired = this.db.prepare(`SELECT COUNT(*) AS c FROM products WHERE hasExpiryDate = 1 AND expiryDate IS NOT NULL AND expiryDate < ?`).get(new Date().toISOString()) as any;
    const exp30   = this.getExpiringProducts(30).length;
    const cats    = this.getUniqueCategories().length;

    return {
      totalProducts: Number(totals?.totalProducts || 0),
      totalItems: Number(totals?.totalProducts || 0),
      totalQuantity: Number(totals?.totalQuantity || 0),
      totalStockValue: Number(totals?.totalStockValue || 0),  // ✅ Now uses sellingPriceTab
      totalCostValue: Number(totals?.totalCostValue || 0),
      totalMRPValue: Number(totals?.totalMRPValue || 0),
      lowStockCount: Number(lowStock?.c || 0),
      lowStockItems: Number(lowStock?.c || 0),
      expiredCount: Number(expired?.c || 0),
      expiringCount: Number(exp30 || 0),
      categoriesCount: Number(cats || 0),
      outOfStockCount: Number(outOf?.c || 0),
      outOfStockItems: Number(outOf?.c || 0)
    };
  }

  /************ Bulk ops & backup ************/
  bulkAddProducts(products: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[]): Product[] {
    const now = new Date().toISOString();
    const toInsert: Product[] = products.map(p => ({
      ...p,
      id: `PROD-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      productCode: p.productCode ?? p.itemCode,
      productName: p.productName ?? p.itemName,
      sellingPrice: p.sellingPrice ?? p.sellingPriceTab,
      minStockLevel: p.minStockLevel ?? p.rol ?? 0,
      createdAt: now,
      updatedAt: now
    }));

    const insert = this.db.prepare(`
      INSERT INTO products (
        id,itemCode,itemName,regionalName,
        hsnCode,batch,category,manufacturer,
        rol,altUnit,pack,purchasePrice,sellingPriceTab,mrp,
        stockQuantity,minStockLevel,maxStockLevel,
        cgstRate,sgstRate,igstRate,
        prTaxIncluded,slTaxIncluded,
        hasExpiryDate,expiryDate,
        productCode,productName,shortKey,brand,unit,sellingPrice,
        supplier,barcode,description,
        createdAt,updatedAt
      ) VALUES (?,?,?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?, ?,?,?, ?,?, ?,?, ?,?,?,?,?,?, ?,?,?, ?,?)
    `);

    const trx = this.db.transaction((rows: Product[]) => {
      for (const r of rows) insert.run(...this.toRow(r));
      return rows.length;
    });
    trx(toInsert);
    return toInsert;
  }

  exportAllProducts(): string {
    const rows = this.getAllProducts();
    return JSON.stringify(rows, null, 2);
  }

  importProducts(jsonData: string): boolean {
    const rows = JSON.parse(jsonData) as Product[];
    const replace = this.db.prepare(`
      REPLACE INTO products (
        id,itemCode,itemName,regionalName,
        hsnCode,batch,category,manufacturer,
        rol,altUnit,pack,purchasePrice,sellingPriceTab,mrp,
        stockQuantity,minStockLevel,maxStockLevel,
        cgstRate,sgstRate,igstRate,
        prTaxIncluded,slTaxIncluded,
        hasExpiryDate,expiryDate,
        productCode,productName,shortKey,brand,unit,sellingPrice,
        supplier,barcode,description,
        createdAt,updatedAt
      ) VALUES (?,?,?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?, ?,?,?, ?,?, ?,?, ?,?,?,?,?,?, ?,?,?, ?,?)
    `);
    const trx = this.db.transaction((list: Product[]) => {
      for (const p of list) replace.run(...this.toRow(p));
    });
    trx(rows);
    return true;
  }

  clearAllProducts(): boolean {
    const info = this.db.prepare(`DELETE FROM products`).run();
    return info.changes >= 0;
  }
}
