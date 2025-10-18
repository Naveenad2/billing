// src/services/purchaseDB.ts
// COMPLETE PURCHASE INVOICE DATABASE
// IndexedDB for storing purchase invoices with all fields
// NO LAZY CODE - FULL PRODUCTION IMPLEMENTATION

const DB_NAME = 'PurchaseInvoiceDB';
const DB_VERSION = 1;
const STORE_NAME = 'purchase_invoices';

// Types
export type PurchaseItem = {
  id: string;
  slNo: number;
  qty: number;
  free: number;
  mfr: string;
  pack: number;
  productName: string;
  batch: string;
  exp: string;
  hsn: string;
  mrp: number;
  rate: number;
  dis: number;
  sgst: number;
  sgstValue: number;
  cgst: number;
  cgstValue: number;
  value: number;
};

export type PurchaseInvoiceRecord = {
  id?: number;
  invoiceNo: string;
  header: {
    invoiceDate: string;
    dueDate: string;
    orderDate: string;
    lrNo: string;
    lrDate: string;
    cases: number;
    transport: string;
  };
  party: {
    name: string;
    address: string;
    phone: string;
    gstin: string;
    state: string;
    stateCode: string;
  };
  items: PurchaseItem[];
  totals: {
    totalQty: number;
    totalFree: number;
    scheme: number;
    discount: number;
    sgst: number;
    cgst: number;
    totalGST: number;
    total: number;
  };
  createdAt: string;
};

// Initialize Database
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create purchase invoices store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });

        // Create indexes
        store.createIndex('invoiceNo', 'invoiceNo', { unique: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('partyName', 'party.name', { unique: false });
        store.createIndex('invoiceDate', 'header.invoiceDate', { unique: false });
      }
    };
  });
}

// Save Purchase Invoice
export async function savePurchaseInvoice(
  record: Omit<PurchaseInvoiceRecord, 'id'>
): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.add(record);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

// Get Purchase Invoice by Invoice Number
export async function getPurchaseInvoiceByNo(
  invoiceNo: string
): Promise<PurchaseInvoiceRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('invoiceNo');

    const request = index.get(invoiceNo);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Get Purchase Invoice by ID
export async function getPurchaseInvoiceById(
  id: number
): Promise<PurchaseInvoiceRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Get All Purchase Invoices
export async function getAllPurchaseInvoices(): Promise<PurchaseInvoiceRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get Purchase Invoices by Date Range
export async function getPurchaseInvoicesByDateRange(
  fromDate: string,
  toDate: string
): Promise<PurchaseInvoiceRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('invoiceDate');

    const range = IDBKeyRange.bound(fromDate, toDate);
    const request = index.getAll(range);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get Purchase Invoices by Party Name
export async function getPurchaseInvoicesByParty(
  partyName: string
): Promise<PurchaseInvoiceRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('partyName');

    const request = index.getAll(partyName);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Search Purchase Invoices by Product
export async function searchPurchaseInvoicesByProduct(
  productQuery: string
): Promise<PurchaseInvoiceRecord[]> {
  const allInvoices = await getAllPurchaseInvoices();
  const query = productQuery.toLowerCase();

  return allInvoices.filter(invoice =>
    invoice.items.some(
      item =>
        item.productName.toLowerCase().includes(query) ||
        item.batch.toLowerCase().includes(query)
    )
  );
}

// Update Purchase Invoice
export async function updatePurchaseInvoice(
  record: PurchaseInvoiceRecord
): Promise<void> {
  if (!record.id) {
    throw new Error('Invoice ID is required for update');
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Delete Purchase Invoice
export async function deletePurchaseInvoice(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get Purchase Summary Statistics
export async function getPurchaseSummary(
  fromDate: string,
  toDate: string
): Promise<{
  totalInvoices: number;
  totalAmount: number;
  totalQty: number;
  totalGST: number;
  topSuppliers: Array<{ name: string; amount: number; invoices: number }>;
}> {
  const invoices = await getPurchaseInvoicesByDateRange(fromDate, toDate);

  const totalInvoices = invoices.length;
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.totals.total, 0);
  const totalQty = invoices.reduce((sum, inv) => sum + inv.totals.totalQty, 0);
  const totalGST = invoices.reduce((sum, inv) => sum + inv.totals.totalGST, 0);

  // Calculate top suppliers
  const supplierMap = new Map<
    string,
    { name: string; amount: number; invoices: number }
  >();

  invoices.forEach(inv => {
    const existing = supplierMap.get(inv.party.name) || {
      name: inv.party.name,
      amount: 0,
      invoices: 0,
    };
    existing.amount += inv.totals.total;
    existing.invoices += 1;
    supplierMap.set(inv.party.name, existing);
  });

  const topSuppliers = Array.from(supplierMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return {
    totalInvoices,
    totalAmount,
    totalQty,
    totalGST,
    topSuppliers,
  };
}

// Get Purchase Report by Product
export async function getPurchaseReportByProduct(
  fromDate: string,
  toDate: string,
  productQuery?: string
): Promise<
  Array<{
    invoice: PurchaseInvoiceRecord;
    item: PurchaseItem;
  }>
> {
  const invoices = await getPurchaseInvoicesByDateRange(fromDate, toDate);
  const report: Array<{ invoice: PurchaseInvoiceRecord; item: PurchaseItem }> = [];

  invoices.forEach(invoice => {
    invoice.items.forEach(item => {
      if (
        !productQuery ||
        item.productName.toLowerCase().includes(productQuery.toLowerCase()) ||
        item.batch.toLowerCase().includes(productQuery.toLowerCase())
      ) {
        report.push({ invoice, item });
      }
    });
  });

  return report;
}

// Export Purchase Invoices to JSON
export async function exportPurchaseInvoicesToJSON(
  fromDate: string,
  toDate: string
): Promise<string> {
  const invoices = await getPurchaseInvoicesByDateRange(fromDate, toDate);
  return JSON.stringify(invoices, null, 2);
}

// Clear All Purchase Invoices (Use with caution!)
export async function clearAllPurchaseInvoices(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get Latest Invoice Number
export async function getLatestPurchaseInvoiceNo(): Promise<string> {
  const allInvoices = await getAllPurchaseInvoices();

  if (allInvoices.length === 0) {
    return 'P00001';
  }

  // Sort by created date and get the latest
  const latest = allInvoices.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  // Extract number and increment
  const match = latest.invoiceNo.match(/\d+$/);
  if (match) {
    const num = parseInt(match[0]) + 1;
    return `P${num.toString().padStart(5, '0')}`;
  }

  return 'P00001';
}

// Check if Invoice Number Exists
export async function isPurchaseInvoiceNoExists(
  invoiceNo: string
): Promise<boolean> {
  const invoice = await getPurchaseInvoiceByNo(invoiceNo);
  return invoice !== null;
}

// Get Purchase Invoices Count
export async function getPurchaseInvoicesCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get Purchase Amount by Date Range
export async function getPurchaseAmountByDateRange(
  fromDate: string,
  toDate: string
): Promise<number> {
  const invoices = await getPurchaseInvoicesByDateRange(fromDate, toDate);
  return invoices.reduce((sum, inv) => sum + inv.totals.total, 0);
}

// Backup Purchase Database
export async function backupPurchaseDatabase(): Promise<Blob> {
  const allInvoices = await getAllPurchaseInvoices();
  const json = JSON.stringify(allInvoices, null, 2);
  return new Blob([json], { type: 'application/json' });
}

// Restore Purchase Database from Backup
export async function restorePurchaseDatabase(jsonData: string): Promise<void> {
  try {
    const invoices = JSON.parse(jsonData) as PurchaseInvoiceRecord[];

    // Clear existing data
    await clearAllPurchaseInvoices();

    // Import all invoices
    for (const invoice of invoices) {
      const { id, ...record } = invoice;
      await savePurchaseInvoice(record);
    }
  } catch (error) {
    throw new Error('Failed to restore database: Invalid JSON format');
  }
}

// Batch operations
export async function savePurchaseInvoicesBatch(
  records: Array<Omit<PurchaseInvoiceRecord, 'id'>>
): Promise<number[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const ids: number[] = [];

    transaction.oncomplete = () => resolve(ids);
    transaction.onerror = () => reject(transaction.error);

    records.forEach(record => {
      const request = store.add(record);
      request.onsuccess = () => ids.push(request.result as number);
    });
  });
}

// Get Purchases by Multiple Filters
export async function getPurchasesByFilters(filters: {
  fromDate?: string;
  toDate?: string;
  partyName?: string;
  invoiceNo?: string;
  minAmount?: number;
  maxAmount?: number;
}): Promise<PurchaseInvoiceRecord[]> {
  let invoices = await getAllPurchaseInvoices();

  // Apply filters
  if (filters.fromDate && filters.toDate) {
    invoices = invoices.filter(
      inv =>
        inv.header.invoiceDate >= filters.fromDate! &&
        inv.header.invoiceDate <= filters.toDate!
    );
  }

  if (filters.partyName) {
    const query = filters.partyName.toLowerCase();
    invoices = invoices.filter(inv =>
      inv.party.name.toLowerCase().includes(query)
    );
  }

  if (filters.invoiceNo) {
    const query = filters.invoiceNo.toLowerCase();
    invoices = invoices.filter(inv =>
      inv.invoiceNo.toLowerCase().includes(query)
    );
  }

  if (filters.minAmount !== undefined) {
    invoices = invoices.filter(inv => inv.totals.total >= filters.minAmount!);
  }

  if (filters.maxAmount !== undefined) {
    invoices = invoices.filter(inv => inv.totals.total <= filters.maxAmount!);
  }

  return invoices;
}

// Get GST Summary
export async function getGSTSummary(
  fromDate: string,
  toDate: string
): Promise<{
  totalTaxable: number;
  totalCGST: number;
  totalSGST: number;
  totalGST: number;
  gstBreakdown: Array<{
    rate: number;
    taxable: number;
    cgst: number;
    sgst: number;
  }>;
}> {
  const invoices = await getPurchaseInvoicesByDateRange(fromDate, toDate);

  const gstMap = new Map<
    number,
    { rate: number; taxable: number; cgst: number; sgst: number }
  >();

  let totalTaxable = 0;
  let totalCGST = 0;
  let totalSGST = 0;

  invoices.forEach(invoice => {
    invoice.items.forEach(item => {
      const gstRate = item.cgst + item.sgst;
      const grossAmount = item.qty * item.rate;
      const discountAmount = (grossAmount * item.dis) / 100;
      const taxableAmount = grossAmount - discountAmount;

      totalTaxable += taxableAmount;
      totalCGST += item.cgstValue;
      totalSGST += item.sgstValue;

      if (gstRate > 0) {
        const existing = gstMap.get(gstRate) || {
          rate: gstRate,
          taxable: 0,
          cgst: 0,
          sgst: 0,
        };
        existing.taxable += taxableAmount;
        existing.cgst += item.cgstValue;
        existing.sgst += item.sgstValue;
        gstMap.set(gstRate, existing);
      }
    });
  });

  const gstBreakdown = Array.from(gstMap.values()).sort((a, b) => a.rate - b.rate);

  return {
    totalTaxable,
    totalCGST,
    totalSGST,
    totalGST: totalCGST + totalSGST,
    gstBreakdown,
  };
}

// Export functions for use in application
export default {
  savePurchaseInvoice,
  getPurchaseInvoiceByNo,
  getPurchaseInvoiceById,
  getAllPurchaseInvoices,
  getPurchaseInvoicesByDateRange,
  getPurchaseInvoicesByParty,
  searchPurchaseInvoicesByProduct,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
  getPurchaseSummary,
  getPurchaseReportByProduct,
  exportPurchaseInvoicesToJSON,
  clearAllPurchaseInvoices,
  getLatestPurchaseInvoiceNo,
  isPurchaseInvoiceNoExists,
  getPurchaseInvoicesCount,
  getPurchaseAmountByDateRange,
  backupPurchaseDatabase,
  restorePurchaseDatabase,
  savePurchaseInvoicesBatch,
  getPurchasesByFilters,
  getGSTSummary,
};
