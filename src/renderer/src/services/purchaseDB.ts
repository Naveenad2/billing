import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface PurchaseItem {
  no: number;
  itemName: string;
  pack: number;
  batch: string;
  expiry: string;
  quantity: number;
  free: number;
  rateStrip: number;
  costStrip: number;
  mrpStr: number;
  sRate: number;
  sRateStrip: number;
  grossAmt: number;
  cgstPercent: number;
  cgstAmt: number;
  sgstPercent: number;
  sgstAmt: number;
  total: number;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNo: string;
  billDate: string;
  supplier: string;
  contactNo: string;
  supplierType: string; // B2B, B2C, etc.
  type: string; // Credit/Cash
  items: PurchaseItem[];
  
  // Totals
  grossTotal: number;
  discount: number;
  discountPercent: number;
  taxableAmount: number;
  totalCgst: number;
  totalSgst: number;
  totalTax: number;
  totalQty: number;
  
  // Additional charges
  freightCharges: number;
  otherExpenses: number;
  addCess: number;
  
  // Final calculations
  purchaseValue: number;
  netValue: number;
  cashDiscount: number;
  roundOff: number;
  billAmount: number;
  
  createdAt: string;
  updatedAt: string;
}

interface PurchaseDB extends DBSchema {
  purchases: {
    key: string;
    value: PurchaseInvoice;
    indexes: {
      'by-date': string;
      'by-supplier': string;
      'by-invoiceNo': string;
    };
  };
}

let dbInstance: IDBPDatabase<PurchaseDB> | null = null;

async function getDB(): Promise<IDBPDatabase<PurchaseDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<PurchaseDB>('PurchaseDB', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('purchases')) {
        const store = db.createObjectStore('purchases', { keyPath: 'id' });
        store.createIndex('by-date', 'billDate');
        store.createIndex('by-supplier', 'supplier');
        store.createIndex('by-invoiceNo', 'invoiceNo');
      }
    },
  });

  return dbInstance;
}

export async function addPurchaseInvoice(purchase: Omit<PurchaseInvoice, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const db = await getDB();
  const id = `PURCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();

  const newPurchase: PurchaseInvoice = {
    ...purchase,
    id,
    createdAt: now,
    updatedAt: now,
  };

  await db.add('purchases', newPurchase);
  return id;
}

export async function getAllPurchases(): Promise<PurchaseInvoice[]> {
  const db = await getDB();
  return db.getAll('purchases');
}

export async function getPurchaseById(id: string): Promise<PurchaseInvoice | undefined> {
  const db = await getDB();
  return db.get('purchases', id);
}

export async function updatePurchaseInvoice(id: string, purchase: Partial<Omit<PurchaseInvoice, 'id' | 'createdAt'>>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('purchases', id);
  
  if (!existing) {
    throw new Error('Purchase invoice not found');
  }

  const updated: PurchaseInvoice = {
    ...existing,
    ...purchase,
    updatedAt: new Date().toISOString(),
  };

  await db.put('purchases', updated);
}

export async function deletePurchaseInvoice(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('purchases', id);
}
