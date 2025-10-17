// src/services/salesDB.ts
// IndexedDB-based Sales DB with safe upgrades, listing, returns, and reporting
// Keeps your existing saveInvoice(record) signature unchanged.

export type SaleInvoiceRecord = {
  id?: number;
  invoiceNo: string;
  header: {
    invoiceDate: string;
    timeISO: string;
    saleType: string;
    patientName: string;
    contactNo: string;
    doctorName: string;
    paymentMode: string;
  };
  items: any[]; // each item may include: itemCode, itemName, batch, quantity, rate, mrp, grossAmt, cgstPercent, cgstAmt, sgstPercent, sgstAmt, total, purchasePrice?
  totals: {
    totalQty: number;
    grossTotal: number;
    totalCgst: number;
    totalSgst: number;
    totalTax: number;
    roundOff: number;
    finalAmount: number;
  };
  createdAt: string;
  // optional internal fields added by this module
  returns?: { lineId: number; qty: number; timeISO: string }[];
};

const DB_NAME = 'SalesInvoiceDB';
const DB_VERSION = 4; // upgrade for indexes
export async function openSalesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    
    req.onerror = () => reject(req.error);
    
    req.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = req.result;
      const transaction = req.transaction;
      
      if (!transaction) {
        console.error('❌ No transaction available');
        return;
      }

      try {
        // Create or update invoices store
        if (!db.objectStoreNames.contains('invoices')) {
          const inv = db.createObjectStore('invoices', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          inv.createIndex('invoiceNo', 'invoiceNo', { unique: false }); // ✅ Changed to false
          inv.createIndex('invoiceDate', 'header.invoiceDate', { unique: false });
          console.log('✅ Created invoices store');
        } else {
          const inv = transaction.objectStore('invoices');
          const indexNames = Array.from(inv.indexNames || []);
          
          // Delete old unique index if it exists
          if (indexNames.includes('invoiceNo')) {
            try {
              inv.deleteIndex('invoiceNo');
              console.log('🗑️ Deleted old invoiceNo index');
            } catch (e) {
              console.warn('Could not delete old index:', e);
            }
          }
          
          // Create new non-unique index
          if (!indexNames.includes('invoiceNo') || true) { // Force recreate
            inv.createIndex('invoiceNo', 'invoiceNo', { unique: false }); // ✅ Non-unique
            console.log('✅ Created invoiceNo index (non-unique)');
          }
          
          if (!indexNames.includes('invoiceDate')) {
            inv.createIndex('invoiceDate', 'header.invoiceDate', { unique: false });
            console.log('✅ Added invoiceDate index');
          }
        }

        // Meta store
        if (!db.objectStoreNames.contains('meta')) {
          const meta = db.createObjectStore('meta', { keyPath: 'key' });
          meta.put({ key: 'invoiceSeq', value: 1 });
          console.log('✅ Created meta store');
        }

        console.log('✅ Database upgrade completed successfully');
      } catch (error) {
        console.error('❌ Upgrade error:', error);
        // Let it fail naturally - don't throw
      }
    };
    
    req.onsuccess = () => {
      console.log('✅ Database opened successfully');
      resolve(req.result);
    };

    req.onblocked = () => {
      console.warn('⚠️ Database upgrade blocked');
    };
  });
}


async function nextInvoiceNumber(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['meta'], 'readwrite');
    const meta = tx.objectStore('meta');
    const g = meta.get('invoiceSeq');
    g.onsuccess = () => {
      const n = (g.result?.value ?? 1) as number;
      meta.put({ key: 'invoiceSeq', value: n + 1 });
      resolve(n);
    };
    g.onerror = () => reject(g.error);
  });
}

// Utility: compute a line with taxes/totals (keeps original numbers if already present)
function recalcLine(line: any) {
  const qty = Number(line.quantity || 0);
  const rate = Number(line.rate || 0);
  const gross = +(qty * rate).toFixed(2);
  const cgstP = Number(line.cgstPercent || 0);
  const sgstP = Number(line.sgstPercent || 0);
  const cgstAmt = +((gross * cgstP) / 100).toFixed(2);
  const sgstAmt = +((gross * sgstP) / 100).toFixed(2);
  const total = +(gross + cgstAmt + sgstAmt).toFixed(2);
  return {
    ...line,
    grossAmt: Number(line.grossAmt ?? gross),
    cgstAmt: Number(line.cgstAmt ?? cgstAmt),
    sgstAmt: Number(line.sgstAmt ?? sgstAmt),
    total: Number(line.total ?? total),
  };
}

// Utility: recompute header totals from items
function recomputeHeaderTotals(items: any[], originalTotals?: SaleInvoiceRecord['totals']) {
  const totalQty = items.reduce((s, r) => s + Number(r.quantity || 0), 0);
  const grossTotal = +items.reduce((s, r) => s + Number(r.grossAmt || 0), 0).toFixed(2);
  const totalCgst = +items.reduce((s, r) => s + Number(r.cgstAmt || 0), 0).toFixed(2);
  const totalSgst = +items.reduce((s, r) => s + Number(r.sgstAmt || 0), 0).toFixed(2);
  const billAmount = +(grossTotal + totalCgst + totalSgst).toFixed(2);
  const roundOff = +((Math.round(billAmount) - billAmount).toFixed(2));
  const finalAmount = Math.round(billAmount);
  // preserve original roundOff if provided
  const ro = originalTotals?.roundOff ?? roundOff;
  const fa = originalTotals?.finalAmount ?? finalAmount;
  return {
    totalQty,
    grossTotal,
    totalCgst,
    totalSgst,
    totalTax: +(totalCgst + totalSgst).toFixed(2),
    roundOff: ro,
    finalAmount: fa,
  };
}

// Assign lineId sequentially if missing (internal only, no signature change)
function withLineIds(items: any[]): any[] {
  let n = 1;
  return items.map(it => (it.lineId ? it : { ...it, lineId: n++ }));
}

export async function saveInvoice(
  record: Omit<SaleInvoiceRecord, 'invoiceNo' | 'id'>
): Promise<{ id: number; invoiceNo: string }> {
  const db = await openSalesDB();
  const seq = await nextInvoiceNumber(db);
  const invoiceNo = String(seq);
  const payload: SaleInvoiceRecord = {
    ...record,
    invoiceNo,
    items: withLineIds(record.items).map(recalcLine),
    totals: recomputeHeaderTotals(record.items.map(recalcLine), record.totals),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readwrite');
    const st = tx.objectStore('invoices');
    const addReq = st.add(payload);
    addReq.onsuccess = () => resolve({ id: addReq.result as number, invoiceNo });
    addReq.onerror = () => reject(addReq.error);
  });
}

// Get invoice by invoiceNo
export async function getInvoiceByNo(invoiceNo: string): Promise<SaleInvoiceRecord | null> {
  const db = await openSalesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readonly');
    const st = tx.objectStore('invoices');
    let req: IDBRequest<any>;
    try {
      req = st.index('invoiceNo').get(invoiceNo);
    } catch {
      // fallback scan
      req = st.getAll();
      req.onsuccess = () => {
        const list = (req.result || []) as SaleInvoiceRecord[];
        resolve(list.find(r => r.invoiceNo === invoiceNo) || null);
      };
      req.onerror = () => reject(req.error);
      return;
    }
    req.onsuccess = () => resolve((req.result as SaleInvoiceRecord) || null);
    req.onerror = () => reject(req.error);
  });
}

// Get items for invoice id
export async function getInvoiceItemsByInvoiceId(invoiceId: number): Promise<any[]> {
  const db = await openSalesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readonly');
    const st = tx.objectStore('invoices');
    const g = st.get(invoiceId);
    g.onsuccess = () => {
      const rec = g.result as SaleInvoiceRecord | undefined;
      resolve(rec ? (rec.items || []).map(recalcLine) : []);
    };
    g.onerror = () => reject(g.error);
  });
}

// List invoices within date range with optional keyword filter and computed profit
export async function getInvoicesRange(
  fromISO: string,
  toISO: string,
  q: string
): Promise<{
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  customer?: string;
  itemsCount: number;
  qtyTotal: number;
  gross: number;
  cgst: number;
  sgst: number;
  billAmount: number;
  roundOff: number;
  finalAmount: number;
  profit: number;
}[]> {
  const db = await openSalesDB();
  const fromT = new Date(fromISO).getTime();
  const toT = new Date(toISO).getTime() + 24 * 3600 * 1000 - 1;
  const qLower = (q || '').trim().toLowerCase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readonly');
    const st = tx.objectStore('invoices');
    const useIndex = (() => {
      try { st.index('invoiceDate'); return true; } catch { return false; }
    })();

    const out: any[] = [];
    const pushIfMatch = (rec: SaleInvoiceRecord) => {
      const t = new Date(rec.header.invoiceDate).getTime();
      if (!(t >= fromT && t <= toT)) return;
      if (qLower) {
        const inHeader =
          rec.invoiceNo.toLowerCase().includes(qLower) ||
          (rec.header.patientName || '').toLowerCase().includes(qLower);
        const inItems = (rec.items || []).some((it: any) =>
          (it.itemCode || '').toLowerCase().includes(qLower) ||
          (it.itemName || '').toLowerCase().includes(qLower)
        );
        if (!inHeader && !inItems) return;
      }
      const qtyTotal = (rec.items || []).reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
      const profit = (rec.items || []).reduce((s: number, r: any) => {
        const pp = Number(r.purchasePrice || 0);
        return s + (Number(r.rate || 0) - pp) * Number(r.quantity || 0);
      }, 0);
      out.push({
        id: rec.id!,
        invoiceNo: rec.invoiceNo,
        invoiceDate: rec.header.invoiceDate,
        customer: rec.header.patientName,
        itemsCount: (rec.items || []).length,
        qtyTotal,
        gross: Number(rec.totals.grossTotal || 0),
        cgst: Number(rec.totals.totalCgst || 0),
        sgst: Number(rec.totals.totalSgst || 0),
        billAmount: Number((rec.totals.grossTotal || 0) + (rec.totals.totalCgst || 0) + (rec.totals.totalSgst || 0)),
        roundOff: Number(rec.totals.roundOff || 0),
        finalAmount: Number(rec.totals.finalAmount || 0),
        profit: +profit.toFixed(2),
      });
    };

    if (useIndex) {
      const idx = st.index('invoiceDate');
      // Open full range and filter in JS (simpler/robust for string ISO compare issues)
      const req = idx.openCursor();
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (cursor) {
          pushIfMatch(cursor.value as SaleInvoiceRecord);
          cursor.continue();
        } else {
          resolve(out.sort((a, b) => Number(a.invoiceNo) - Number(b.invoiceNo)));
        }
      };
      req.onerror = () => reject(req.error);
    } else {
      const req = st.getAll();
      req.onsuccess = () => {
        (req.result as SaleInvoiceRecord[]).forEach(pushIfMatch);
        resolve(out.sort((a, b) => Number(a.invoiceNo) - Number(b.invoiceNo)));
      };
      req.onerror = () => reject(req.error);
    }
  });
}

// Save a return: reduce quantity on the selected line, add a return entry, recompute invoice totals
// itemRef can be either a lineId (preferred) or a 0-based item index; qty is validated against available quantity
export async function saveReturnAgainstInvoice(
  invoiceId: number,
  itemRef: number,
  qty: number
): Promise<{ ok: boolean }> {
  const db = await openSalesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readwrite');
    const st = tx.objectStore('invoices');
    const g = st.get(invoiceId);
    g.onsuccess = () => {
      const rec = g.result as SaleInvoiceRecord | undefined;
      if (!rec) { resolve({ ok: false }); return; }
      const items = withLineIds((rec.items || []).map(recalcLine));
      const idxByLineId = items.findIndex((it: any) => Number(it.lineId) === Number(itemRef));
      const targetIndex = idxByLineId >= 0 ? idxByLineId : Math.max(0, Math.min(Number(itemRef), items.length - 1));
      const line = { ...items[targetIndex] };
      const allowed = Math.max(0, Number(line.quantity || 0));
      const take = Math.min(Math.max(1, Number(qty || 1)), allowed);
      line.quantity = Number(line.quantity || 0) - take;
      const updated = recalcLine(line);
      items[targetIndex] = updated;

      const totals = recomputeHeaderTotals(items, rec.totals);
      const returns = [...(rec.returns || []), { lineId: Number(line.lineId), qty: take, timeISO: new Date().toISOString() }];
      const updatedRec: SaleInvoiceRecord = { ...rec, items, totals, returns };

      const putReq = st.put(updatedRec);
      putReq.onsuccess = () => resolve({ ok: true });
      putReq.onerror = () => reject(putReq.error);
    };
    g.onerror = () => reject(g.error);
  });
}

// Detailed sales report rows for export (date range + optional q filter)
export type SalesReportRow = {
  header: {
    id: number;
    invoiceNo: string;
    invoiceDate: string;
    patientName?: string;
  };
  item: any & {
    profit?: number;
  };
};

export async function getSalesReport(fromISO: string, toISO: string, q?: string): Promise<SalesReportRow[]> {
  const list = await getInvoicesRange(fromISO, toISO, q || '');
  // Re-read each invoice’s items for detailed lines
  const db = await openSalesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readonly');
    const st = tx.objectStore('invoices');
    const req = st.getAll();
    req.onsuccess = () => {
      const all = (req.result || []) as SaleInvoiceRecord[];
      const map = new Map<number, SaleInvoiceRecord>();
      all.forEach(r => { if (r.id != null) map.set(r.id, r); });
      const results: SalesReportRow[] = [];
      for (const row of list) {
        const rec = map.get(row.id);
        if (!rec) continue;
        const items = (rec.items || []).map(recalcLine);
        for (const it of items) {
          const pp = Number(it.purchasePrice || 0);
          const profit = (Number(it.rate || 0) - pp) * Number(it.quantity || 0);
          results.push({
            header: { id: rec.id!, invoiceNo: rec.invoiceNo, invoiceDate: rec.header.invoiceDate, patientName: rec.header.patientName },
            item: { ...it, profit: +profit.toFixed(2) }
          });
        }
      }
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}
// Export type aliases for AllInvoices component
export type InvoiceHeader = {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  patientName?: string;
  contactNo?: string;
  doctorName?: string;
  paymentMode?: string;
  saleType?: string;
};

export type InvoiceLine = {
  id: number;
  lineId: number;
  itemCode: string;
  itemName: string;
  hsnCode?: string;
  batch: string;
  expiryDate?: string;
  quantity: number;
  pack?: number;
  mrp: number;
  rate: number;
  grossAmt: number;
  cgstPercent: number;
  cgstAmt: number;
  sgstPercent: number;
  sgstAmt: number;
  total: number;
  purchasePrice?: number;
  profit?: number;
};
