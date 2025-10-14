// src/components/SalesInvoice.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllProducts } from '../services/inventoryDB';

// Inventory product type (normalize fields from DB to these names)
type InvProduct = {
  id: string;
  itemCode: string;
  itemName: string;
  batch?: string;
  expiryDate?: string;       // ISO or MM/YY
  pack?: number;             // pack size per unit (optional)
  mrp?: number;              // MRP per unit/strip
  sellingPrice?: number;     // selling rate per unit/strip
  cgstRate?: number;         // %
  sgstRate?: number;         // %
  stockQuantity?: number;
};

interface InvoiceItem {
  no: number;
  itemCode: string;
  itemName: string;
  batch: string;
  expiryDate: string;
  quantity: number;
  pack: number;
  mrp: number;
  rate: number;
  grossAmt: number;
  cgstPercent: number;
  cgstAmt: number;
  sgstPercent: number;
  sgstAmt: number;
  total: number;
}

type PickedRow = {
  product: InvProduct;
  batch: string;
  expiryDate: string;
  mrp: number;
  rate: number;
  cgstPercent: number;
  sgstPercent: number;
  pack: number;
  quantity: number;
};

// ---------------- Product Search Modal ----------------

function normalizeExpiry(exp?: string) {
  if (!exp) return '';
  if (/^\d{2}\/\d{2}$/.test(exp)) return exp;
  const d = new Date(exp);
  if (Number.isNaN(d.getTime())) return exp;
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const yy = `${d.getFullYear()}`.slice(-2);
  return `${mm}/${yy}`;
}

function ProductSearchModal({
  open,
  prefix,
  products,
  onClose,
  onSelect
}: {
  open: boolean;
  prefix: string;
  products: InvProduct[];
  onClose: () => void;
  onSelect: (picked: PickedRow) => void;
}) {
  const [query, setQuery] = useState(prefix || '');
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);

  useEffect(() => {
    setQuery(prefix || '');
  }, [prefix]);

  const heads = useMemo(() => {
    const map = new Map<string, InvProduct>();
    const q = query.trim().toLowerCase();
    products.forEach(p => {
      const code = p.itemCode || '';
      const name = p.itemName || '';
      const hay = `${code} ${name}`.toLowerCase();
      if (q && !hay.includes(q)) return;
      const key = `${code}||${name}`;
      if (!map.has(key)) map.set(key, p);
    });
    return Array.from(map.values()).sort((a, b) => (a.itemCode || '').localeCompare(b.itemCode || ''));
  }, [products, query]);

  const batchRows = useMemo(() => {
    if (!activeCode) return [];
    return products
      .filter(p => p.itemCode === activeCode)
      .map(p => ({
        ...p,
        batch: p.batch || '-',
        expiry: normalizeExpiry(p.expiryDate || ''),
        mrpN: Number(p.mrp || 0),
        rateN: Number(p.sellingPrice || 0),
        cgstN: Number(p.cgstRate || 0),
        sgstN: Number(p.sgstRate || 0),
        packN: Number(p.pack || 1),
        stockN: Number(p.stockQuantity || 0),
      }))
      .sort((a, b) => (a.batch || '').localeCompare(b.batch || ''));
  }, [products, activeCode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-800 text-white flex items-center justify-between">
          <h3 className="text-sm font-bold">Product Search (Inventory)</h3>
          <button onClick={onClose} className="px-2 py-1 rounded hover:bg-white/10">Close</button>
        </div>

        <div className="p-4 grid grid-cols-5 gap-4">
          {/* Code/Name list */}
          <div className="col-span-2 border rounded-lg overflow-hidden">
            <div className="p-2 border-b bg-slate-50">
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by Item Code / Name"
                className="w-full px-3 py-2 text-sm border rounded"
              />
            </div>
            <div className="max-h-[380px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left">Item Code</th>
                    <th className="px-2 py-2 text-left">Item Name</th>
                  </tr>
                </thead>
                <tbody>
                  {heads.map((p, i) => (
                    <tr
                      key={`${p.itemCode}-${i}`}
                      onClick={() => setActiveCode(p.itemCode)}
                      className={`cursor-pointer hover:bg-blue-50 ${activeCode === p.itemCode ? 'bg-blue-100' : ''}`}
                    >
                      <td className="px-2 py-1.5 font-mono font-bold">{p.itemCode}</td>
                      <td className="px-2 py-1.5">{p.itemName}</td>
                    </tr>
                  ))}
                  {heads.length === 0 && (
                    <tr>
                      <td className="px-2 py-3 text-center text-slate-500" colSpan={2}>No products</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Batch list for selected code */}
          <div className="col-span-3 border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b flex items-center justify-between">
              <div className="text-sm font-semibold">Batches {activeCode ? `for ${activeCode}` : ''}</div>
              <div className="flex items-center space-x-2">
                <label className="text-xs font-semibold">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={e => setQty(Math.max(1, Number(e.target.value || 1)))}
                  className="w-20 px-2 py-1 text-sm border rounded"
                />
              </div>
            </div>
            <div className="max-h-[380px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left">Batch</th>
                    <th className="px-2 py-2 text-center">Expiry</th>
                    <th className="px-2 py-2 text-right">MRP</th>
                    <th className="px-2 py-2 text-right">Rate</th>
                    <th className="px-2 py-2 text-center">CGST%</th>
                    <th className="px-2 py-2 text-center">SGST%</th>
                    <th className="px-2 py-2 text-center">Pack</th>
                    <th className="px-2 py-2 text-center">Stock</th>
                    <th className="px-2 py-2 text-center">Select</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((b, i) => (
                    <tr key={`${b.id}-${i}`} className="hover:bg-blue-50">
                      <td className="px-2 py-1.5 font-mono">{b.batch}</td>
                      <td className="px-2 py-1.5 text-center text-purple-700 font-semibold">{b.expiry}</td>
                      <td className="px-2 py-1.5 text-right">₹{b.mrpN.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-green-700">₹{b.rateN.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-center">{b.cgstN}%</td>
                      <td className="px-2 py-1.5 text-center">{b.sgstN}%</td>
                      <td className="px-2 py-1.5 text-center">{b.packN}</td>
                      <td className="px-2 py-1.5 text-center">{b.stockN}</td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          className="px-2 py-1 text-xs bg-primary text-white rounded"
                          onClick={() =>
                            onSelect({
                              product: b,
                              batch: b.batch || '',
                              expiryDate: b.expiry || '',
                              mrp: b.mrpN,
                              rate: b.rateN,
                              cgstPercent: b.cgstN,
                              sgstPercent: b.sgstN,
                              pack: b.packN,
                              quantity: qty
                            })
                          }
                        >
                          Use
                        </button>
                      </td>
                    </tr>
                  ))}
                  {batchRows.length === 0 && (
                    <tr>
                      <td className="px-2 py-3 text-center text-slate-500" colSpan={9}>
                        {activeCode ? 'No batches found' : 'Pick an Item Code to see batches'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="px-4 py-2 bg-slate-50 border-t flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300">Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Main Sales Invoice ----------------

export default function SalesInvoice({ onClose }: { onClose: () => void }) {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleType, setSaleType] = useState('B2C');
  const [patientName, setPatientName] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');

  const [items, setItems] = useState<InvoiceItem[]>([{
    no: 1, itemCode: '', itemName: '', batch: '', expiryDate: '', quantity: 0, pack: 1,
    mrp: 0, rate: 0, grossAmt: 0, cgstPercent: 9, cgstAmt: 0, sgstPercent: 9, sgstAmt: 0, total: 0
  }]);

  const [inv, setInv] = useState<InvProduct[]>([]);
  const [openSearch, setOpenSearch] = useState(false);
  const [searchRow, setSearchRow] = useState<number | null>(null);
  const [searchPrefix, setSearchPrefix] = useState('');

  const [showPreview, setShowPreview] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');

  const inputRefs = useRef<{ [k: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    (async () => {
      try {
        const products = await getAllProducts();
        const normalized: InvProduct[] = (products || []).map((p: any) => ({
          id: String(p.id ?? `${p.itemCode}-${p.batch ?? ''}`),
          itemCode: String(p.itemCode ?? ''),
          itemName: String(p.itemName ?? ''),
          batch: p.batch ?? '',
          expiryDate: p.expiryDate ?? p.expiry ?? '',
          pack: Number(p.pack ?? 1),
          mrp: Number(p.mrp ?? p.mrpStr ?? 0),
          sellingPrice: Number(p.sellingPriceTab ?? p.sRateStrip ?? p.sellingPrice ?? 0),
          cgstRate: Number(p.cgstRate ?? p.cgstPercent ?? 0),
          sgstRate: Number(p.sgstRate ?? p.sgstPercent ?? 0),
          stockQuantity: Number(p.stockQuantity ?? 0),
        }));
        setInv(normalized);
      } catch (e) {
        console.error('Failed to load inventory', e);
      }
    })();
    setInvoiceNo(`SI${Date.now().toString().slice(-6)}`);
  }, []);

  const numberToWords = (num: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    if (num === 0) return 'Zero';
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) return `${tens[Math.floor(num / 10)]} ${ones[num % 10]}`.trim();
    if (num < 1000) return `${ones[Math.floor(num / 100)]} Hundred ${numberToWords(num % 100)}`.trim();
    if (num < 100000) return `${numberToWords(Math.floor(num / 1000))} Thousand ${numberToWords(num % 1000)}`.trim();
    if (num < 10000000) return `${numberToWords(Math.floor(num / 100000))} Lakh ${numberToWords(num % 100000)}`.trim();
    return `${numberToWords(Math.floor(num / 10000000))} Crore ${numberToWords(num % 10000000)}`.trim();
  };

  const calcRow = (r: InvoiceItem): InvoiceItem => {
    const gross = (r.quantity || 0) * (r.rate || 0);
    const cgstAmt = (gross * (r.cgstPercent || 0)) / 100;
    const sgstAmt = (gross * (r.sgstPercent || 0)) / 100;
    const total = gross + cgstAmt + sgstAmt;
    return {
      ...r,
      grossAmt: Number(gross.toFixed(2)),
      cgstAmt: Number(cgstAmt.toFixed(2)),
      sgstAmt: Number(sgstAmt.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  };

  const setRow = (idx: number, updater: (row: InvoiceItem) => InvoiceItem) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = calcRow(updater(next[idx]));
      return next;
    });
  };

  // Open search when first letter entered in Item Code
  const handleItemCodeChange = (index: number, value: string) => {
    setRow(index, r => ({ ...r, itemCode: value }));
    if (value && value.length === 1) {
      setSearchRow(index);
      setSearchPrefix(value);
      setOpenSearch(true);
    }
  };

  const applyPickedToRow = (idx: number, picked: PickedRow) => {
    const p = picked.product;
    setRow(idx, r => ({
      ...r,
      itemCode: p.itemCode || r.itemCode,
      itemName: p.itemName || r.itemName,
      batch: picked.batch || '',
      expiryDate: picked.expiryDate || '',
      pack: picked.pack || 1,
      mrp: picked.mrp || 0,
      rate: picked.rate || 0,
      cgstPercent: picked.cgstPercent ?? 0,
      sgstPercent: picked.sgstPercent ?? 0,
      quantity: picked.quantity || 1,
    }));
    setTimeout(() => inputRefs.current[`${idx}-quantity`]?.focus(), 50);
  };

  const columns = ['itemCode','itemName','batch','expiryDate','quantity','pack','mrp','rate','cgstPercent','sgstPercent'] as const;

  const handleKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === 'F3') {
      e.preventDefault();
      setSearchRow(rowIdx);
      setSearchPrefix('');
      setOpenSearch(true);
      return;
    }
    if (e.key === 'Tab' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextCol = Math.min(colIdx + 1, columns.length - 1);
      inputRefs.current[`${rowIdx}-${columns[nextCol]}`]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevCol = Math.max(colIdx - 1, 0);
      inputRefs.current[`${rowIdx}-${columns[prevCol]}`]?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIdx < items.length - 1) inputRefs.current[`${rowIdx + 1}-${columns[colIdx]}`]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx > 0) inputRefs.current[`${rowIdx - 1}-${columns[colIdx]}`]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rowIdx === items.length - 1) {
        addRow();
        setTimeout(() => inputRefs.current[`${items.length}-${columns[0]}`]?.focus(), 30);
      } else {
        inputRefs.current[`${rowIdx + 1}-${columns[colIdx]}`]?.focus();
      }
    }
  };

  const addRow = () => {
    setItems(prev => [...prev, {
      no: prev.length + 1, itemCode: '', itemName: '', batch: '', expiryDate: '',
      quantity: 0, pack: 1, mrp: 0, rate: 0, grossAmt: 0,
      cgstPercent: 9, cgstAmt: 0, sgstPercent: 9, sgstAmt: 0, total: 0
    }]);
  };

  const removeRow = (index: number) => {
    setItems(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, no: i + 1 }));
    });
  };

  const totals = useMemo(() => {
    const totalQty = items.reduce((s, r) => s + (r.quantity || 0), 0);
    const grossTotal = items.reduce((s, r) => s + (r.grossAmt || 0), 0);
    const totalCgst = items.reduce((s, r) => s + (r.cgstAmt || 0), 0);
    const totalSgst = items.reduce((s, r) => s + (r.sgstAmt || 0), 0);
    const billAmount = items.reduce((s, r) => s + (r.total || 0), 0);
    return {
      totalQty,
      grossTotal: Number(grossTotal.toFixed(2)),
      totalCgst: Number(totalCgst.toFixed(2)),
      totalSgst: Number(totalSgst.toFixed(2)),
      totalTax: Number((totalCgst + totalSgst).toFixed(2)),
      billAmount: Number(billAmount.toFixed(2)),
      roundOff: Number((Math.round(billAmount) - billAmount).toFixed(2)),
      finalAmount: Math.round(billAmount),
    };
  }, [items]);

  const saveToLocalDB = async (invoiceData: any) =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('SalesInvoiceDB', 1);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = (ev) => {
        const db = (ev.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('invoices')) {
          db.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['invoices'], 'readwrite');
        const st = tx.objectStore('invoices');
        const add = st.add(invoiceData);
        add.onsuccess = () => resolve(add.result);
        add.onerror = () => reject(add.error);
      };
    });

  const generateInvoiceHTML = (invoiceData: any) => {
    const t = invoiceData.totals;
    return `
<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${invoiceData.invoiceNo}</title>
<style>
@page{size:A4 landscape;margin:10mm}
body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:10mm;color:#000}
.table{width:100%;border-collapse:collapse}
.table th{background:#111;color:#fff;border:2px solid #000;padding:6px 5px}
.table td{border:1px solid #000;padding:5px;text-align:center}
.left{text-align:left} .small{font-size:10px}
.section{margin:8px 0} .bold{font-weight:700}
.totals{border:2px solid #000;padding:8px}
.row{display:flex;justify-content:space-between;margin:4px 0}
</style>
</head><body>
<div class="section" style="text-align:center;border-bottom:2px solid #000;padding-bottom:6px">
  <div class="bold" style="font-size:18px">PENCOS MEDICALS</div>
  <div class="small">Kerala, India | GSTIN: 32XXXXXXXXX1ZX</div>
</div>

<div class="section" style="display:flex;justify-content:space-between">
  <div>
    <div class="small"><span class="bold">Invoice No:</span> ${invoiceData.invoiceNo}</div>
    <div class="small"><span class="bold">Date:</span> ${new Date(inventoryDate).toLocaleDateString('en-IN')}</div>
    <div class="small"><span class="bold">Type:</span> ${invoiceData.saleType}</div>
    <div class="small"><span class="bold">Payment:</span> ${invoiceData.paymentMode}</div>
  </div>
  <div>
    <div class="small"><span class="bold">Customer:</span> ${invoiceData.patientName || '-'}</div>
    <div class="small"><span class="bold">Contact:</span> ${invoiceData.contactNo || '-'}</div>
    <div class="small"><span class="bold">Doctor:</span> ${invoiceData.doctorName || '-'}</div>
  </div>
</div>

<table class="table">
<thead>
<tr>
<th>No</th><th class="left">Item Code</th><th class="left">Item Name</th><th>Batch</th><th>Expiry</th><th>Qty</th>
<th>Pack</th><th>MRP</th><th>Rate</th><th>Gross</th><th>CGST%</th><th>CGST</th><th>SGST%</th><th>SGST</th><th>Total</th>
</tr>
</thead>
<tbody>
${invoiceData.items.map((r:any)=>`
<tr>
<td>${r.no}</td><td class="left">${r.itemCode}</td><td class="left bold">${r.itemName}</td>
<td>${r.batch||'-'}</td><td>${r.expiryDate||'-'}</td><td class="bold">${r.quantity}</td>
<td>${r.pack}</td><td>₹${(r.mrp||0).toFixed(2)}</td><td class="bold">₹${(r.rate||0).toFixed(2)}</td>
<td class="bold">₹${(r.grossAmt||0).toFixed(2)}</td><td>${r.cgstPercent}</td><td>₹${(r.cgstAmt||0).toFixed(2)}</td>
<td>${r.sgstPercent}</td><td>₹${(r.sgstAmt||0).toFixed(2)}</td><td class="bold">₹${(r.total||0).toFixed(2)}</td>
</tr>`).join('')}
</tbody>
</table>

<div class="section" style="display:flex;gap:16px">
  <div style="flex:1">
    <div class="small"><span class="bold">Amount in words:</span> ${t.finalAmount} — ${'${words}'} </div>
  </div>
  <div class="totals" style="min-width:320px">
    <div class="row"><span>Total Qty</span><span class="bold">${t.totalQty}</span></div>
    <div class="row"><span>Gross Total</span><span>₹${t.grossTotal.toFixed(2)}</span></div>
    <div class="row"><span>CGST</span><span>₹${t.totalCgst.toFixed(2)}</span></div>
    <div class="row"><span>SGST</span><span>₹${t.totalSgst.toFixed(2)}</span></div>
    <div class="row"><span>Total Tax</span><span class="bold">₹${t.totalTax.toFixed(2)}</span></div>
    <div class="row"><span>Round Off</span><span>₹${t.roundOff.toFixed(2)}</span></div>
    <div class="row bold" style="font-size:14px;border-top:2px solid #000;padding-top:6px">
      <span>Bill Amount</span><span>₹${t.finalAmount.toFixed(2)}</span>
    </div>
  </div>
</div>

<script>
  function numberToWords(num){
    const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
    const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const teens=['Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    function ntw(n){if(n===0)return'Zero';if(n<10)return ones[n];if(n<20)return teens[n-10];
      if(n<100)return (tens[Math.floor(n/10)]+' '+ones[n%10]).trim();
      if(n<1000)return (ones[Math.floor(n/100)]+' Hundred '+ntw(n%100)).trim();
      if(n<100000)return (ntw(Math.floor(n/1000))+' Thousand '+ntw(n%1000)).trim();
      if(n<10000000)return (ntw(Math.floor(n/100000))+' Lakh '+ntw(n%100000)).trim();
      return (ntw(Math.floor(n/10000000))+' Crore '+ntw(n%10000000)).trim();}
    return ntw(num);
  }
  const words = numberToWords(${t.finalAmount});
  document.body.innerHTML = document.body.innerHTML.replace('${'+'${words}'+'}', words + ' Rupees Only');
</script>

</body></html>`;
  };

  const handlePreview = () => {
    if (!patientName || items.every(i => !i.itemName)) {
      alert('Please enter customer and at least one item');
      return;
    }
    const data = {
      invoiceNo, invoiceDate, saleType, patientName, contactNo, doctorName, paymentMode,
      items: items.filter(i => i.itemName),
      totals,
      createdAt: new Date().toISOString()
    };
    setPreviewHTML(generateInvoiceHTML(data));
    setShowPreview(true);
  };

  const handlePrint = () => {
    const iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
    iframe?.contentWindow?.print();
  };

  const handleSave = async () => {
    if (!patientName || items.every(i => !i.itemName)) {
      alert('Please enter customer and at least one item');
      return;
    }
    const data = {
      invoiceNo, invoiceDate, saleType, patientName, contactNo, doctorName, paymentMode,
      items: items.filter(i => i.itemName),
      totals,
      createdAt: new Date().toISOString()
    };
    await saveToLocalDB(data);
    setPreviewHTML(generateInvoiceHTML(data));
    setShowPreview(true);
    setTimeout(handlePrint, 400);
  };

  return (
    <>
      {/* Screen */}
      <div className="fixed inset-0 bg-slate-900/95 z-50 overflow-hidden">
        <div className="h-screen flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-indigo-600 text-white px-4 py-2 flex justify-between items-center shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="p-1.5 bg-white/10 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold">Sales Invoice</h1>
                <p className="text-[9px] text-white/70">Type first letter in Item Code to open search • F3 to search</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Top form */}
          <div className="bg-white px-4 py-2 border-b grid grid-cols-7 gap-2">
            <div>
              <label className="block text-[9px] font-bold text-gray-600 mb-0.5">Invoice No</label>
              <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 rounded" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-gray-600 mb-0.5">Date</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 rounded" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-gray-600 mb-0.5">Sale Type</label>
              <select value={saleType} onChange={e => setSaleType(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 rounded">
                <option value="B2C">B2C</option>
                <option value="B2B">B2B</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[9px] font-bold text-gray-600 mb-0.5">Customer</label>
              <input type="text" value={patientName} onChange={e => setPatientName(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 rounded" placeholder="Customer name" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-gray-600 mb-0.5">Contact</label>
              <input type="text" value={contactNo} onChange={e => setContactNo(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 rounded" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-gray-600 mb-0.5">Doctor</label>
              <input type="text" value={doctorName} onChange={e => setDoctorName(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-300 rounded" />
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto bg-white">
            <table className="w-full border-collapse text-[10px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-slate-700 to-slate-600 text-white">
                  <th className="border border-slate-500 px-2 py-1.5 font-bold w-10">No</th>
                  <th className="border border-slate-500 px-2 py-1.5 font-bold w-28">Item Code</th>
                  <th className="border border-slate-500 px-2 py-1.5 font-bold text-left min-w-[220px]">Item Name</th>
                  <th className="border border-slate-500 px-2 py-1.5 font-bold w-24">Batch</th>
                  <th className="border border-slate-500 px-2 py-1.5 font-bold w-20">Expiry</th>
                  <th className="border border-blue-500 px-2 py-1.5 font-bold w-16 bg-blue-600">Qty</th>
                  <th className="border border-slate-500 px-2 py-1.5 font-bold w-16">Pack</th>
                  <th className="border border-slate-500 px-2 py-1.5 font-bold text-right w-24">MRP</th>
                  <th className="border border-blue-500 px-2 py-1.5 font-bold text-right w-24 bg-blue-600">Rate</th>
                  <th className="border border-green-500 px-2 py-1.5 font-bold text-right w-28 bg-green-600">Gross</th>
                  <th className="border border-slate-500 px-2 py-1.5 font-bold w-16">CGST%</th>
                  <th className="border border-green-500 px-2 py-1.5 font-bold text-right w-24 bg-green-600">CGST</th>
                  <th className="border border-slate-500 px-2 py-1.5 font-bold w-16">SGST%</th>
                  <th className="border border-green-500 px-2 py-1.5 font-bold text-right w-24 bg-green-600">SGST</th>
                  <th className="border border-indigo-500 px-2 py-1.5 font-bold text-right w-28 bg-indigo-600">Total</th>
                  <th className="border border-slate-500 px-2 py-1.5 font-bold w-10">Del</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, index) => (
                  <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50`}>
                    <td className="border border-slate-300 px-2 py-0.5 text-center font-bold">{r.no}</td>

                    {/* Item Code */}
                    <td className="border border-slate-300 p-0">
                      <input
                        ref={el => (inputRefs.current[`${index}-itemCode`] = el)}
                        type="text"
                        value={r.itemCode}
                        onChange={e => handleItemCodeChange(index, e.target.value)}
                        onKeyDown={e => handleKeyDown(e, index, 0)}
                        className="w-full px-2 py-0.5 text-[10px] border-0 focus:ring-2 focus:ring-blue-400 bg-transparent font-mono font-semibold"
                        placeholder="Code"
                      />
                    </td>

                    {/* Item Name */}
                    <td className="border border-slate-300 p-0">
                      <input
                        ref={el => (inputRefs.current[`${index}-itemName`] = el)}
                        type="text"
                        value={r.itemName}
                        onChange={e => setRow(index, row => ({ ...row, itemName: e.target.value }))}
                        onKeyDown={e => handleKeyDown(e, index, 1)}
                        className="w-full px-2 py-0.5 text-[10px] border-0 focus:ring-2 focus:ring-blue-400 bg-transparent font-semibold"
                        placeholder="Item name"
                      />
                    </td>

                    {/* Batch */}
                    <td className="border border-slate-300 p-0">
                      <input
                        ref={el => (inputRefs.current[`${index}-batch`] = el)}
                        type="text"
                        value={r.batch}
                        onChange={e => setRow(index, row => ({ ...row, batch: e.target.value }))}
                        onKeyDown={e => handleKeyDown(e, index, 2)}
                        className="w-full px-1 py-0.5 text-[10px] text-center border-0 focus:ring-2 focus:ring-blue-400 bg-transparent font-mono"
                      />
                    </td>

                    {/* Expiry */}
                    <td className="border border-slate-300 p-0">
                      <input
                        ref={el => (inputRefs.current[`${index}-expiryDate`] = el)}
                        type="text"
                        value={r.expiryDate}
                        onChange={e => setRow(index, row => ({ ...row, expiryDate: e.target.value }))}
                        onKeyDown={e => handleKeyDown(e, index, 3)}
                        className="w-full px-1 py-0.5 text-[10px] text-center border-0 focus:ring-2 focus:ring-blue-400 bg-transparent"
                        placeholder="MM/YY"
                      />
                    </td>

                    {/* Qty */}
                    <td className="border border-blue-300 p-0 bg-blue-50">
                      <input
                        ref={el => (inputRefs.current[`${index}-quantity`] = el)}
                        type="number"
                        value={r.quantity || ''}
                        onChange={e => setRow(index, row => ({ ...row, quantity: Number(e.target.value || 0) }))}
                        onKeyDown={e => handleKeyDown(e, index, 4)}
                        className="w-full px-1 py-0.5 text-[10px] text-center font-bold text-blue-700 border-0 focus:ring-2 focus:ring-blue-500 bg-transparent"
                      />
                    </td>

                    {/* Pack */}
                    <td className="border border-slate-300 p-0">
                      <input
                        ref={el => (inputRefs.current[`${index}-pack`] = el)}
                        type="number"
                        value={r.pack || ''}
                        onChange={e => setRow(index, row => ({ ...row, pack: Number(e.target.value || 1) }))}
                        onKeyDown={e => handleKeyDown(e, index, 5                        )}}
                        className="w-full px-1 py-0.5 text-[10px] text-center border-0 focus:ring-2 focus:ring-blue-400 bg-transparent"
                      />
                    </td>

                    {/* MRP */}
                    <td className="border border-slate-300 p-0">
                      <input
                        ref={el => (inputRefs.current[`${index}-mrp`] = el)}
                        type="number"
                        step="0.01"
                        value={r.mrp || ''}
                        onChange={e => setRow(index, row => ({ ...row, mrp: Number(e.target.value || 0) }))}
                        onKeyDown={e => handleKeyDown(e, index, 6)}
                        className="w-full px-1 py-0.5 text-[10px] text-right border-0 focus:ring-2 focus:ring-blue-400 bg-transparent"
                      />
                    </td>

                    {/* Rate */}
                    <td className="border border-blue-300 p-0 bg-blue-50">
                      <input
                        ref={el => (inputRefs.current[`${index}-rate`] = el)}
                        type="number"
                        step="0.01"
                        value={r.rate || ''}
                        onChange={e => setRow(index, row => ({ ...row, rate: Number(e.target.value || 0) }))}
                        onKeyDown={e => handleKeyDown(e, index, 7)}
                        className="w-full px-1 py-0.5 text-[10px] text-right font-bold text-blue-700 border-0 focus:ring-2 focus:ring-blue-500 bg-transparent"
                      />
                    </td>

                    {/* Gross */}
                    <td className="border border-green-300 px-2 py-0.5 text-right text-[10px] font-bold bg-green-50 text-green-800">
                      {r.grossAmt.toFixed(2)}
                    </td>

                    {/* CGST% */}
                    <td className="border border-slate-300 p-0">
                      <input
                        ref={el => (inputRefs.current[`${index}-cgstPercent`] = el)}
                        type="number"
                        step="0.1"
                        value={r.cgstPercent || ''}
                        onChange={e => setRow(index, row => ({ ...row, cgstPercent: Number(e.target.value || 0) }))}
                        onKeyDown={e => handleKeyDown(e, index, 8)}
                        className="w-full px-1 py-0.5 text-[10px] text-center border-0 focus:ring-2 focus:ring-blue-400 bg-transparent"
                      />
                    </td>

                    {/* CGST Amt */}
                    <td className="border border-green-300 px-2 py-0.5 text-right text-[10px] font-semibold bg-green-50 text-green-800">
                      {r.cgstAmt.toFixed(2)}
                    </td>

                    {/* SGST% */}
                    <td className="border border-slate-300 p-0">
                      <input
                        ref={el => (inputRefs.current[`${index}-sgstPercent`] = el)}
                        type="number"
                        step="0.1"
                        value={r.sgstPercent || ''}
                        onChange={e => setRow(index, row => ({ ...row, sgstPercent: Number(e.target.value || 0) }))}
                        onKeyDown={e => handleKeyDown(e, index, 9)}
                        className="w-full px-1 py-0.5 text-[10px] text-center border-0 focus:ring-2 focus:ring-blue-400 bg-transparent"
                      />
                    </td>

                    {/* SGST Amt */}
                    <td className="border border-green-300 px-2 py-0.5 text-right text-[10px] font-semibold bg-green-50 text-green-800">
                      {r.sgstAmt.toFixed(2)}
                    </td>

                    {/* Total */}
                    <td className="border border-indigo-300 px-2 py-0.5 text-right text-[11px] font-bold bg-indigo-50 text-indigo-900">
                      ₹{r.total.toFixed(2)}
                    </td>

                    {/* Delete */}
                    <td className="border border-slate-300 p-0 text-center">
                      <button
                        onClick={() => removeRow(index)}
                        className="p-1 text-red-600 hover:bg-red-100 rounded transition-all"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Row */}
          <div className="bg-white px-4 py-2 border-t">
            <button
              onClick={addRow}
              className="px-4 py-1.5 bg-gradient-to-r from-slate-600 to-slate-500 text-white text-xs rounded-lg hover:shadow-lg transition-all flex items-center space-x-2 font-semibold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Add Row (Enter)</span>
            </button>
          </div>

          {/* Totals Bar */}
          <div className="bg-gradient-to-r from-slate-100 to-white px-4 py-2 border-t-2 grid grid-cols-6 gap-2">
            <div className="bg-white rounded-lg p-2 border border-slate-200 shadow-sm">
              <p className="text-[9px] text-gray-600 font-bold mb-0.5">Total Qty</p>
              <p className="text-base font-bold text-blue-700">{totals.totalQty}</p>
            </div>
            <div className="bg-white rounded-lg p-2 border border-slate-200 shadow-sm">
              <p className="text-[9px] text-gray-600 font-bold mb-0.5">Gross Total</p>
              <p className="text-base font-bold text-green-700">₹{totals.grossTotal.toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-lg p-2 border border-slate-200 shadow-sm">
              <p className="text-[9px] text-gray-600 font-bold mb-0.5">CGST</p>
              <p className="text-base font-bold text-orange-700">₹{totals.totalCgst.toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-lg p-2 border border-slate-200 shadow-sm">
              <p className="text-[9px] text-gray-600 font-bold mb-0.5">SGST</p>
              <p className="text-base font-bold text-orange-700">₹{totals.totalSgst.toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-lg p-2 border border-slate-200 shadow-sm">
              <p className="text-[9px] text-gray-600 font-bold mb-0.5">Round Off</p>
              <p className="text-base font-bold text-purple-700">₹{totals.roundOff.toFixed(2)}</p>
            </div>
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg p-2 shadow-lg flex flex-col items-center justify-center text-white">
              <p className="text-[9px] font-bold uppercase mb-0.5">Bill Amount</p>
              <p className="text-xl font-bold">₹{totals.finalAmount}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white px-4 py-2 border-t flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <label className="text-[10px] font-bold text-gray-600">Payment:</label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value)}
                className="px-2 py-1 text-xs border-2 border-gray-300 rounded font-semibold"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Credit">Credit</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handlePreview}
                className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded-lg font-bold"
              >
                Preview
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs rounded-lg font-bold shadow"
              >
                Save & Print
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs rounded-lg font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preview / Print Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2 bg-gradient-to-r from-slate-800 to-slate-700 text-white flex justify-between items-center">
              <h3 className="font-bold">Invoice Preview</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
                    iframe?.contentWindow?.print();
                  }}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-bold"
                >
                  Print
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg font-bold"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe id="print-iframe" title="Invoice Preview" className="w-full h-full bg-white" srcDoc={previewHTML} />
            </div>
          </div>
        </div>
      )}

      {/* Product Search Modal */}
      <ProductSearchModal
        open={openSearch}
        prefix={searchPrefix}
        products={inv}
        onClose={() => setOpenSearch(false)}
        onSelect={(picked) => {
          if (searchRow !== null) applyPickedToRow(searchRow, picked);
          setOpenSearch(false);
        }}
      />
    </>
  );
}

