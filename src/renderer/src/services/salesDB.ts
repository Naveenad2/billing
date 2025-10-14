// src/services/salesDB.ts
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
  };
  
  export async function openSalesDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('SalesInvoiceDB', 2);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('invoices')) {
          db.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('meta')) {
          const meta = db.createObjectStore('meta', { keyPath: 'key' });
          meta.put({ key: 'invoiceSeq', value: 1 });
        }
      };
      req.onsuccess = () => resolve(req.result);
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
  
  export async function saveInvoice(record: Omit<SaleInvoiceRecord, 'invoiceNo' | 'id'>): Promise<{ id: number; invoiceNo: string }> {
    const db = await openSalesDB();
    const seq = await nextInvoiceNumber(db);
    const invoiceNo = String(seq);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['invoices'], 'readwrite');
      const st = tx.objectStore('invoices');
      const addReq = st.add({ ...record, invoiceNo });
      addReq.onsuccess = () => resolve({ id: addReq.result as number, invoiceNo });
      addReq.onerror = () => reject(addReq.error);
    });
  }
  