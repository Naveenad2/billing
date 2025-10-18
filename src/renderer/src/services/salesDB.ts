// src/services/salesDB.ts
// COMPLETE IndexedDB-based Sales DB with safe upgrades, listing, returns, and reporting
// ALL FUNCTIONS INCLUDED - PRODUCTION READY

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
  items: any[];
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
  returns?: { lineId: number; qty: number; timeISO: string }[];
};

const DB_NAME = 'SalesInvoiceDB';
const DB_VERSION = 4;

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
        if (!db.objectStoreNames.contains('invoices')) {
          const inv = db.createObjectStore('invoices', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          inv.createIndex('invoiceNo', 'invoiceNo', { unique: false });
          inv.createIndex('invoiceDate', 'header.invoiceDate', { unique: false });
          console.log('✅ Created invoices store');
        } else {
          const inv = transaction.objectStore('invoices');
          const indexNames = Array.from(inv.indexNames || []);
          
          if (indexNames.includes('invoiceNo')) {
            try {
              inv.deleteIndex('invoiceNo');
              console.log('🗑️ Deleted old invoiceNo index');
            } catch (e) {
              console.warn('Could not delete old index:', e);
            }
          }
          
          if (!indexNames.includes('invoiceNo') || true) {
            inv.createIndex('invoiceNo', 'invoiceNo', { unique: false });
            console.log('✅ Created invoiceNo index (non-unique)');
          }
          
          if (!indexNames.includes('invoiceDate')) {
            inv.createIndex('invoiceDate', 'header.invoiceDate', { unique: false });
            console.log('✅ Added invoiceDate index');
          }
        }

        if (!db.objectStoreNames.contains('meta')) {
          const meta = db.createObjectStore('meta', { keyPath: 'key' });
          meta.put({ key: 'invoiceSeq', value: 1 });
          console.log('✅ Created meta store');
        }

        console.log('✅ Database upgrade completed successfully');
      } catch (error) {
        console.error('❌ Upgrade error:', error);
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

function recomputeHeaderTotals(items: any[], originalTotals?: SaleInvoiceRecord['totals']) {
  const totalQty = items.reduce((s, r) => s + Number(r.quantity || 0), 0);
  const grossTotal = +items.reduce((s, r) => s + Number(r.grossAmt || 0), 0).toFixed(2);
  const totalCgst = +items.reduce((s, r) => s + Number(r.cgstAmt || 0), 0).toFixed(2);
  const totalSgst = +items.reduce((s, r) => s + Number(r.sgstAmt || 0), 0).toFixed(2);
  const billAmount = +(grossTotal + totalCgst + totalSgst).toFixed(2);
  const roundOff = +((Math.round(billAmount) - billAmount).toFixed(2));
  const finalAmount = Math.round(billAmount);
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

export async function getInvoiceByNo(invoiceNo: string): Promise<SaleInvoiceRecord | null> {
  const db = await openSalesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readonly');
    const st = tx.objectStore('invoices');
    let req: IDBRequest<any>;
    try {
      req = st.index('invoiceNo').get(invoiceNo);
    } catch {
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

export async function updateInvoiceAfterReturn(invoiceId: number): Promise<{ ok: boolean }> {
  const db = await openSalesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['invoices'], 'readwrite');
    const st = tx.objectStore('invoices');
    const g = st.get(invoiceId);
    
    g.onsuccess = () => {
      const rec = g.result as SaleInvoiceRecord | undefined;
      if (!rec) { 
        resolve({ ok: false }); 
        return; 
      }

      const items = withLineIds((rec.items || []).map(recalcLine));
      const totals = recomputeHeaderTotals(items);
      const updatedRec: SaleInvoiceRecord = {
        ...rec,
        items,
        totals,
      };

      const putReq = st.put(updatedRec);
      putReq.onsuccess = () => {
        console.log('✅ Invoice totals updated after return');
        resolve({ ok: true });
      };
      putReq.onerror = () => {
        console.error('❌ Failed to update invoice:', putReq.error);
        reject(putReq.error);
      };
    };
    
    g.onerror = () => {
      console.error('❌ Failed to get invoice:', g.error);
      reject(g.error);
    };
  });
}

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
