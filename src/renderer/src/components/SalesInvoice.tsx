// src/components/SalesInvoice.tsx
// A4 Invoice (sample photo style) • 7 rows per printed page • Single-copy print (printer handles copies)
// Electron + SQLite (InventoryDB) • Smooth keyboard nav • Optional customer/phone/doctor
// Live "saved amount" • Auto-invoice numbering from 1 • Merge same item rows • Refresh inventory after save

import { useEffect, useMemo, useRef, useState } from 'react';
import { saveInvoice } from '../services/salesDB';

/***** Type Definitions *****/
type InvProduct = {
  id: string;
  itemCode: string;
  itemName: string;
  batch?: string;
  expiryDate?: string;
  pack: number;
  mrp: number;
  sellingPriceTab: number;
  cgstRate: number;
  sgstRate: number;
  stockQuantity: number;
  hsnCode?: string;
  manufacturer?: string;
};

interface InvoiceItem {
  no: number;
  itemCode: string;
  itemName: string;
  hsnCode?: string;
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

/***** Inventory IPC (from preload) *****/
declare global {
  interface Window {
    inventory?: {
      getAll: () => Promise<InvProduct[]>;
      decrementStockByCodeBatch: (
        code: string,
        batch: string,
        qty: number
      ) => Promise<{ success: boolean; newStock: number; itemName: string }>;
    };
  }
}

/***** Helpers *****/
const MMYY = (exp?: string) => {
  if (!exp) return '';
  if (/^\d{2}\/\d{2}$/.test(exp)) return exp;
  const d = new Date(exp);
  if (Number.isNaN(d.getTime())) return exp;
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const yy = `${d.getFullYear()}`.slice(-2);
  return `${mm}/${yy}`;
};

const keyFor = (code: string, batch: string) => `${code}||${batch}`;

const nextInvoiceNo = (): string => {
  // Stored numeric sequence starting from 1
  const k = 'sales_invoice_seq_v1';
  const n = Number(localStorage.getItem(k) || '0') + 1;
  localStorage.setItem(k, String(n));
  return String(n); // pure number like sample photo
};

/***** Product Search Modal *****/
function ProductSearchModal({
  open,
  prefix,
  products,
  pendingQty,
  onClose,
  onSelect
}: {
  open: boolean;
  prefix: string;
  products: InvProduct[];
  pendingQty: Record<string, number>;
  onClose: () => void;
  onSelect: (picked: PickedRow) => void;
}) {
  const [query, setQuery] = useState(prefix || '');
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [focusPane, setFocusPane] = useState<'heads' | 'batches'>('heads');
  const [headIndex, setHeadIndex] = useState(0);
  const [batchIndex, setBatchIndex] = useState(0);
  const [qty, setQty] = useState<number>(1);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setQuery(prefix || ''), [prefix]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        modalRef.current?.focus();
        inputRef.current?.focus(); // keep cursor in search box
      }, 0);
    }
  }, [open]);

  const codesWithStock = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      const k = keyFor(p.itemCode || '', p.batch || '');
      const avail = Number(p.stockQuantity || 0) - Number(pendingQty[k] || 0);
      if (avail >= 1) set.add(p.itemCode || '');
    });
    return set;
  }, [products, pendingQty]);

  const heads = useMemo(() => {
    const map = new Map<string, InvProduct>();
    const q = query.trim().toLowerCase();
    products.forEach(p => {
      const code = p.itemCode || '';
      const name = p.itemName || '';
      const k = keyFor(code, p.batch || '');
      const avail = Number(p.stockQuantity || 0) - Number(pendingQty[k] || 0);
      if (avail < 1) return;
      const hay = `${code} ${name}`.toLowerCase();
      if (q && !hay.includes(q)) return;
      const headKey = `${code}||${name}`;
      if (!map.has(headKey)) map.set(headKey, p);
    });
    const arr = Array.from(map.values()).sort((a, b) => (a.itemCode || '').localeCompare(b.itemCode || ''));
    if (headIndex >= arr.length) setHeadIndex(arr.length ? arr.length - 1 : 0);
    if (!arr.length) setActiveCode(null);
    return arr;
  }, [products, query, headIndex, pendingQty]);

  const batchRows = useMemo(() => {
    if (!activeCode) return [];
    const rows = products
      .filter(p => p.itemCode === activeCode)
      .map(p => {
        const k = keyFor(p.itemCode || '', p.batch || '');
        const avail = Math.max(0, Number(p.stockQuantity || 0) - Number(pendingQty[k] || 0));
        return {
          ...p,
          batch: p.batch || '-',
          expiry: MMYY(p.expiryDate || ''),
          mrpN: Number(p.mrp || 0),
          rateN: Number(p.sellingPriceTab || 0),
          cgstN: Number(p.cgstRate || 0),
          sgstN: Number(p.sgstRate || 0),
          packN: Number(p.pack || 1),
          stockN: avail,
        };
      })
      .filter(r => r.stockN > 0)
      .sort((a, b) => (a.batch || '').localeCompare(b.batch || ''));
    if (batchIndex >= rows.length) setBatchIndex(rows.length ? rows.length - 1 : 0);
    return rows;
  }, [products, activeCode, batchIndex, pendingQty]);

  useEffect(() => {
    if (!open) return;
    const id = focusPane === 'heads' ? `head-row-${headIndex}` : `batch-row-${batchIndex}`;
    document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
  }, [open, focusPane, headIndex, batchIndex]);

  const commitHeadToBatches = () => {
    const h = heads[headIndex];
    if (!h) return;
    setActiveCode(h.itemCode);
    setFocusPane('batches');
    setBatchIndex(0);
  };

  const commitBatchSelection = () => {
    const b = batchRows[batchIndex];
    if (!b) return;
    onSelect({
      product: b,
      batch: b.batch || '',
      expiryDate: b.expiry || '',
      mrp: b.mrpN,
      rate: b.rateN,
      cgstPercent: b.cgstN,
      sgstPercent: b.sgstN,
      pack: b.packN,
      quantity: Math.min(qty || 1, b.stockN)
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab'].includes(k)) e.preventDefault();
    switch (k) {
      case 'ArrowDown':
        if (focusPane === 'heads') setHeadIndex(i => Math.min(i + 1, Math.max(0, heads.length - 1)));
        else setBatchIndex(i => Math.min(i + 1, Math.max(0, batchRows.length - 1)));
        break;
      case 'ArrowUp':
        if (focusPane === 'heads') setHeadIndex(i => Math.max(0, i - 1));
        else setBatchIndex(i => Math.max(0, i - 1));
        break;
      case 'ArrowRight':
        if (focusPane === 'heads') { if (!activeCode) commitHeadToBatches(); else setFocusPane('batches'); }
        break;
      case 'ArrowLeft':
        setFocusPane('heads');
        break;
      case 'Enter':
        if (focusPane === 'heads') commitHeadToBatches();
        else commitBatchSelection();
        break;
      case 'Escape':
        onClose();
        break;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={modalRef}
        tabIndex={0}
        onKeyDown={handleKey}
        className="bg-white w-full max-w-5xl rounded-lg shadow-2xl overflow-hidden outline-none"
      >
        <div className="px-3 py-2 bg-indigo-600 text-white flex items-center justify-between">
          <h3 className="text-sm font-bold">Product Search</h3>
          <div className="text-[10px] text-white/80">Keep typing • Arrows • Enter • Esc</div>
        </div>

        <div className="p-3 grid grid-cols-5 gap-3">
          <div className={`col-span-2 border rounded overflow-hidden ${focusPane === 'heads' ? 'ring-2 ring-blue-500' : ''}`}>
            <div className="p-2 border-b bg-slate-50">
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={e => { setQuery(e.target.value); setHeadIndex(0); }}
                placeholder="Search Item Code / Name"
                className="w-full px-2 py-1 text-xs border rounded"
              />
            </div>
            <div className="max-h-[350px] overflow-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">Code</th>
                    <th className="px-2 py-1 text-left">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {heads.map((p, i) => {
                    const active = focusPane === 'heads' && i === headIndex;
                    return (
                      <tr
                        id={`head-row-${i}`}
                        key={`${p.itemCode}-${i}`}
                        onMouseEnter={() => setHeadIndex(i)}
                        onClick={() => { setHeadIndex(i); commitHeadToBatches(); }}
                        className={`cursor-pointer ${active ? 'bg-blue-100' : 'hover:bg-blue-50'}`}
                      >
                        <td className="px-2 py-1 font-mono font-bold">{p.itemCode}</td>
                        <td className="px-2 py-1">{p.itemName}</td>
                      </tr>
                    );
                  })}
                  {heads.length === 0 && <tr><td className="px-2 py-2 text-center text-slate-500" colSpan={2}>No stock</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`col-span-3 border rounded overflow-hidden ${focusPane === 'batches' ? 'ring-2 ring-blue-500' : ''}`}>
            <div className="px-2 py-1 bg-slate-50 border-b flex items-center justify-between">
              <div className="text-xs font-semibold">Batches {activeCode ? `for ${activeCode}` : ''}</div>
              <div className="flex items-center space-x-2">
                <label className="text-[10px] font-semibold">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={e => setQty(Math.max(1, Number(e.target.value || 1)))}
                  className="w-16 px-1 py-0.5 text-xs border rounded"
                />
              </div>
            </div>
            <div className="max-h-[350px] overflow-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">Batch</th>
                    <th className="px-2 py-1 text-center">Exp</th>
                    <th className="px-2 py-1 text-right">MRP</th>
                    <th className="px-2 py-1 text-right">Rate</th>
                    <th className="px-2 py-1 text-center">CGST</th>
                    <th className="px-2 py-1 text-center">SGST</th>
                    <th className="px-2 py-1 text-center">Pack</th>
                    <th className="px-2 py-1 text-center">Stock</th>
                    <th className="px-2 py-1 text-center">Pick</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((b, i) => {
                    const active = focusPane === 'batches' && i === batchIndex;
                    return (
                      <tr
                        id={`batch-row-${i}`}
                        key={`${b.id}-${i}`}
                        onMouseEnter={() => setBatchIndex(i)}
                        onClick={() => { setBatchIndex(i); commitBatchSelection(); }}
                        className={`cursor-pointer ${active ? 'bg-blue-100' : 'hover:bg-blue-50'}`}
                      >
                        <td className="px-2 py-1 font-mono">{b.batch}</td>
                        <td className="px-2 py-1 text-center text-purple-700">{b.expiry}</td>
                        <td className="px-2 py-1 text-right">₹{b.mrpN.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-bold text-green-700">₹{b.rateN.toFixed(2)}</td>
                        <td className="px-2 py-1 text-center">{b.cgstN}%</td>
                        <td className="px-2 py-1 text-center">{b.sgstN}%</td>
                        <td className="px-2 py-1 text-center">{b.packN}</td>
                        <td className="px-2 py-1 text-center font-bold text-blue-700">{b.stockN}</td>
                        <td className="px-2 py-1 text-center text-[10px] text-slate-500">Enter</td>
                      </tr>
                    );
                  })}
                  {(!activeCode || batchRows.length === 0) && (
                    <tr><td className="px-2 py-2 text-center text-slate-500" colSpan={9}>
                      {activeCode ? 'No batches' : 'Select item'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="px-3 py-2 bg-slate-50 border-t flex justify-end">
          <button onClick={onClose} className="px-3 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300">Close</button>
        </div>
      </div>
    </div>
  );
}

/***** Main Component *****/
export default function SalesInvoice({ onClose }: { onClose: () => void }) {
  const [invoiceNo, setInvoiceNo] = useState(nextInvoiceNo());
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleType, setSaleType] = useState('B2C');
  const [customerName, setCustomerName] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');

  const [items, setItems] = useState<InvoiceItem[]>([
    { no: 1, itemCode: '', itemName: '', hsnCode: '', batch: '', expiryDate: '', quantity: 0, pack: 1,
      mrp: 0, rate: 0, grossAmt: 0, cgstPercent: 2.5, cgstAmt: 0, sgstPercent: 2.5, sgstAmt: 0, total: 0 }
  ]);

  const [inv, setInv] = useState<InvProduct[]>([]);
  const [openSearch, setOpenSearch] = useState(false);
  const [searchRow, setSearchRow] = useState<number | null>(null);
  const [searchPrefix, setSearchPrefix] = useState('');
  const [savedToast, setSavedToast] = useState<{show:boolean; text:string}>({ show:false, text:'' });
  const [previewHTML, setPreviewHTML] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // For live “available” while picking
  const pendingQty = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of items) {
      if (!r.itemCode || !r.batch || !r.quantity) continue;
      const k = keyFor(r.itemCode, r.batch);
      map[k] = (map[k] || 0) + r.quantity;
    }
    return map;
  }, [items]);

  const inputRefs = useRef<{ [k: string]: HTMLInputElement | null }>({});

  const showSaved = (text: string) => {
    setSavedToast({ show:true, text });
    setTimeout(() => setSavedToast({ show:false, text:'' }), 3500);
  };

  const loadInventory = async () => {
    try {
      if (!window.inventory) return;
      const products = await window.inventory.getAll();
      setInv(products || []);
    } catch (e) {
      console.error('Failed to load inventory', e);
    }
  };
  useEffect(() => { loadInventory(); }, []);

  /***** Row math *****/
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

  const mergeIntoExistingRow = (picked: PickedRow): number | null => {
    const code = picked.product.itemCode || '';
    const batch = picked.batch || '';
    const rate = picked.rate || 0;
    const idx = items.findIndex(r => r.itemCode === code && r.batch === batch && r.rate === rate);
    if (idx >= 0) {
      setRow(idx, r => ({ ...r, quantity: (r.quantity || 0) + (picked.quantity || 1) }));
      return idx;
    }
    return null;
  };

  const handleItemCodeChange = (index: number, value: string) => {
    setRow(index, r => ({ ...r, itemCode: value }));
    if (value && value.length === 1) {
      setSearchRow(index);
      setSearchPrefix(value);
      setOpenSearch(true);
    }
  };

  const applyPickedToRow = (idx: number, picked: PickedRow) => {
    const mergedIdx = mergeIntoExistingRow(picked);
    if (mergedIdx !== null) {
      if (!items[idx].itemName && items.length > 1) {
        setItems(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, no: i + 1 })));
      }
      setOpenSearch(false);
      setTimeout(() => inputRefs.current[`${mergedIdx}-quantity`]?.focus(), 30);
      return;
    }
    const p = picked.product;
    setRow(idx, r => ({
      ...r,
      itemCode: p.itemCode || r.itemCode,
      itemName: p.itemName || r.itemName,
      hsnCode: p.hsnCode || '',
      batch: picked.batch || '',
      expiryDate: picked.expiryDate || '',
      pack: picked.pack || 1,
      mrp: picked.mrp || 0,
      rate: picked.rate || 0,
      cgstPercent: picked.cgstPercent ?? 0,
      sgstPercent: picked.sgstPercent ?? 0,
      quantity: picked.quantity || 1,
    }));
    setOpenSearch(false);
    setTimeout(() => inputRefs.current[`${idx}-quantity`] ?.focus(), 30);
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
        setTimeout(() => inputRefs.current[`${items.length}-${columns[0]}`]?.focus(), 20);
      } else {
        inputRefs.current[`${rowIdx + 1}-${columns[colIdx]}`]?.focus();
      }
    }
  };

  const addRow = () => {
    setItems(prev => [...prev, {
      no: prev.length + 1, itemCode: '', itemName: '', hsnCode: '', batch: '', expiryDate: '',
      quantity: 0, pack: 1, mrp: 0, rate: 0, grossAmt: 0,
      cgstPercent: 2.5, cgstAmt: 0, sgstPercent: 2.5, sgstAmt: 0, total: 0
    }]);
  };

  const removeRow = (index: number) => {
    setItems(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, no: i + 1 }));
    });
  };

  const clearAll = () => {
    if (!confirm('Clear all fields?')) return;
    setCustomerName('');
    setContactNo('');
    setDoctorName('');
    setItems([{
      no: 1, itemCode: '', itemName: '', hsnCode: '', batch: '', expiryDate: '',
      quantity: 0, pack: 1, mrp: 0, rate: 0, grossAmt: 0,
      cgstPercent: 2.5, cgstAmt: 0, sgstPercent: 2.5, sgstAmt: 0, total: 0
    }]);
    setInvoiceNo(nextInvoiceNo());
  };

  /***** Totals *****/
  const totals = useMemo(() => {
    const totalQty = items.reduce((s, r) => s + (r.quantity || 0), 0);
    const grossTotal = items.reduce((s, r) => s + (r.grossAmt || 0), 0);
    const totalCgst = items.reduce((s, r) => s + (r.cgstAmt || 0), 0);
    const totalSgst = items.reduce((s, r) => s + (r.sgstAmt || 0), 0);
    const billAmount = items.reduce((s, r) => s + (r.total || 0), 0);
    const savedFromMrp = items.reduce((s, r) => s + Math.max(0, (r.mrp - r.rate)) * (r.quantity || 0), 0);
    return {
      totalQty,
      grossTotal: Number(grossTotal.toFixed(2)),
      totalCgst: Number(totalCgst.toFixed(2)),
      totalSgst: Number(totalSgst.toFixed(2)),
      totalTax: Number((totalCgst + totalSgst).toFixed(2)),
      billAmount: Number(billAmount.toFixed(2)),
      roundOff: Number((Math.round(billAmount) - billAmount).toFixed(2)),
      finalAmount: Math.round(billAmount),
      savedFromMrp: Number(savedFromMrp.toFixed(2))
    };
  }, [items]);

  const gstSummary = useMemo(() => {
    const map = new Map<number, { taxable: number; taxAmt: number }>();
    for (const r of items) {
      const gst = Number((r.cgstPercent || 0) + (r.sgstPercent || 0));
      const row = map.get(gst) || { taxable: 0, taxAmt: 0 };
      row.taxable += (r.grossAmt || 0);
      row.taxAmt += (r.cgstAmt || 0) + (r.sgstAmt || 0);
      map.set(gst, row);
    }
    const rates = [5, 12, 18, 28];
    return rates.map(rate => ({
      rate,
      taxable: Number((map.get(rate)?.taxable || 0).toFixed(2)),
      taxAmt: Number((map.get(rate)?.taxAmt || 0).toFixed(2)),
    }));
  }, [items]);

  /***** Printing (A4, 7 rows/page, single copy) *****/
  const PAGE_ROWS = 7;

  const splitPages = (rows: InvoiceItem[], pageSize = PAGE_ROWS) => {
    const pages: InvoiceItem[][] = [];
    for (let i = 0; i < rows.length; i += pageSize) pages.push(rows.slice(i, i + pageSize));
    return pages.length ? pages : [[]];
  };

  const buildPrintHTML = (pages: InvoiceItem[][]) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const stateCode = '32';

    const tableHead = `
      <tr>
        <th style="width:28px;">No</th>
        <th style="width:240px;">Name of Product / Service</th>
        <th style="width:70px;">HSN Code</th>
        <th style="width:40px;">Qty</th>
        <th style="width:80px;">Batch</th>
        <th style="width:60px;">Expiry</th>
        <th style="width:55px;">Rate</th>
        <th style="width:55px;">MRP</th>
        <th style="width:75px;">Taxable Value</th>
        <th style="width:40px;">CGST%</th>
        <th style="width:60px;">CGST Amt</th>
        <th style="width:40px;">SGST%</th>
        <th style="width:60px;">SGST Amt</th>
        <th style="width:70px;">Total</th>
      </tr>
    `;

    const css = `
      @page { size: A4; margin: 8mm 10mm; }
      body { font-family: Arial, sans-serif; color:#000; }
      .page { width:100%; }
      .header { border:1px solid #000; padding:8px; }
      .brand { text-align:center; font-weight:bold; font-size:18px; }
      .sub { text-align:center; font-size:10px; margin-top:2px; }
      .meta { display:flex; justify-content:space-between; font-size:10px; margin-top:6px; }
      .meta .left p, .meta .right p{ margin:2px 0; }
      .bar { font-size:10px; margin-top:6px; display:flex; justify-content:space-between; }
      .billline { border:1px solid #000; border-top:none; }
      table { width:100%; border-collapse:collapse; font-size:10px; }
      th, td { border:1px solid #000; padding:4px 3px; }
      th { text-align:center; }
      td.right { text-align:right; }
      td.center { text-align:center; }
      .gstbox { width:100%; border:1px solid #000; border-top:none; padding:6px; }
      .row { display:flex; justify-content:space-between; }
      .small { font-size:9px; }
      .saved { font-weight:bold; }
      .signature { text-align:right; margin-top:10px; font-size:10px; }
      .pb { page-break-after: always; }
    `;

    const gstTable = `
      <table class="small" style="width:60%; margin-top:6px;">
        <thead>
          <tr>
            <th style="width:70px;">GST %</th>
            <th>Taxable</th>
            <th>GST AMT</th>
          </tr>
        </thead>
        <tbody>
          ${gstSummary.map(g => `
            <tr>
              <td>${g.rate}%</td>
              <td class="right">${g.taxable.toFixed(2)}</td>
              <td class="right">${g.taxAmt.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    const pagesHTML = pages.map((rows, pi) => {
      const blanks = Array(Math.max(0, PAGE_ROWS - rows.length)).fill(null);
      const tableRows = rows.map(r => `
        <tr>
          <td class="center">${r.no}</td>
          <td>${r.itemName || ''}</td>
          <td class="center">${r.hsnCode || ''}</td>
          <td class="center">${r.quantity || 0}</td>
          <td class="center" style="font-family:monospace">${r.batch || '-'}</td>
          <td class="center" style="color:#6B21A8;font-weight:bold">${r.expiryDate || ''}</td>
          <td class="right">${r.rate.toFixed(2)}</td>
          <td class="right">${r.mrp.toFixed(2)}</td>
          <td class="right">${r.grossAmt.toFixed(2)}</td>
          <td class="center">${(r.cgstPercent || 0).toFixed(1)}</td>
          <td class="right">${r.cgstAmt.toFixed(2)}</td>
          <td class="center">${(r.sgstPercent || 0).toFixed(1)}</td>
          <td class="right">${r.sgstAmt.toFixed(2)}</td>
          <td class="right" style="font-weight:bold">${r.total.toFixed(2)}</td>
        </tr>
      `).join('') + blanks.map(() => `
        <tr>
          <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td>
          <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
      `).join('');

      const lastPage = pi === pages.length - 1;

      return `
        <div class="page ${pi < pages.length - 1 ? 'pb' : ''}">
          <div class="header">
            <div class="brand">PENCOS MEDICALS</div>
            <div class="sub">MELEPANDIYIL BUILDING, CHENGANNUR • Ph: 0479 2454670</div>
            <div class="meta">
              <div class="left">
                <p>DL No : 6-193/20/2005</p>
                <p>DL No : 6-194/21/2005</p>
              </div>
              <div class="right" style="text-align:right">
                <p>GSTIN : 32AABAT4432F1ZX</p>
              </div>
            </div>
            <div class="bar">
              <div>Customer : ${customerName || ''}</div>
              <div>Invoice No. : ${invoiceNo}</div>
              <div>Invoice Date : ${new Date(invoiceDate).toLocaleDateString('en-IN')}</div>
            </div>
            <div class="bar">
              <div>PH : ${contactNo || ''}</div>
              <div>Time : ${timeStr}</div>
              <div>State Code : ${stateCode}</div>
              <div>Pay Mode : ${paymentMode}</div>
            </div>
          </div>

          <div class="billline">
            <table>
              <thead>${tableHead}</thead>
              <tbody>${tableRows}</tbody>
              ${lastPage ? `
              <tfoot>
                <tr>
                  <td colspan="8" class="right" style="font-weight:bold">TOTAL</td>
                  <td class="right" style="font-weight:bold">${totals.grossTotal.toFixed(2)}</td>
                  <td></td>
                  <td class="right" style="font-weight:bold">${totals.totalCgst.toFixed(2)}</td>
                  <td></td>
                  <td class="right" style="font-weight:bold">${totals.totalSgst.toFixed(2)}</td>
                  <td class="right" style="font-weight:bold">${(totals.finalAmount - totals.roundOff).toFixed(2)}</td>
                </tr>
              </tfoot>
              ` : ''}
            </table>
          </div>

          ${lastPage ? `
          <div class="gstbox">
            ${gstTable}
            <div class="row" style="margin-top:6px;">
              <div class="small">Amount in words as per need</div>
              <div class="small">
                <div>Sub Total : <strong>₹${(totals.billAmount).toFixed(2)}</strong></div>
                <div>Round Off : ${totals.roundOff >= 0 ? '' : '-'}<strong>₹${Math.abs(totals.roundOff).toFixed(2)}</strong></div>
                <div class="saved">You Have saved : <strong>₹${totals.savedFromMrp.toFixed(2)}</strong></div>
                <div style="font-size:14px; font-weight:bold; margin-top:4px;">Bill Amount : <span>₹${totals.finalAmount.toFixed(2)}</span></div>
              </div>
            </div>
            <div class="signature">Authorised Signature</div>
          </div>
          ` : ''}
        </div>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Invoice ${invoiceNo}</title>
          <style>${css}</style>
        </head>
        <body>${pagesHTML}</body>
      </html>
    `;
  };

  /***** Save & Print *****/
  const handleSave = async () => {
    const pickedItems = items.filter(i => i.itemName && i.quantity > 0);
    if (pickedItems.length === 0) {
      alert('Add at least one item');
      return;
    }

    let saved: { id: number; invoiceNo: string } | null = null;
    try {
      saved = await saveInvoice({
        header: {
          invoiceNo, invoiceDate, timeISO: new Date().toISOString(),
          saleType, patientName: customerName, contactNo, doctorName, paymentMode
        },
        items: pickedItems,
        totals,
        createdAt: new Date().toISOString(),
      } as any);
    } catch (e) {
      console.error('Save error:', e);
      alert('Failed to save invoice');
      return;
    }

    // Decrement stock and refresh inventory
    const stockMessages: string[] = [];
    try {
      if (window.inventory?.decrementStockByCodeBatch) {
        for (const r of pickedItems) {
          const resp = await window.inventory.decrementStockByCodeBatch(
            r.itemCode, r.batch, Number(r.quantity || 0)
          );
          if (resp.success) {
            stockMessages.push(`✓ ${r.quantity} reduced from ${resp.itemName} [${r.batch}] → ${resp.newStock}`);
          } else {
            stockMessages.push(`⚠ Not found: ${r.itemCode}/${r.batch}`);
          }
        }
      }
    } catch (e) {
      console.error('Stock decrement failed', e);
    }
    await loadInventory();

    // Build single-copy paginated print (7 rows/page)
    const pages = splitPages(pickedItems.map((r, i) => ({ ...r, no: i + 1 })), PAGE_ROWS);
    const html = buildPrintHTML(pages);

    setPreviewHTML(html);
    setShowPreview(true);
    setTimeout(() => {
      const iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
      iframe?.contentWindow?.print();
    }, 500);

    showSaved(['✅ Saved Invoice #' + (saved?.invoiceNo || invoiceNo), ...stockMessages].join('\n'));

    // Reset for next bill
    setItems([{
      no: 1, itemCode: '', itemName: '', hsnCode: '', batch: '', expiryDate: '',
      quantity: 0, pack: 1, mrp: 0, rate: 0, grossAmt: 0,
      cgstPercent: 2.5, cgstAmt: 0, sgstPercent: 2.5, sgstAmt: 0, total: 0
    }]);
    setInvoiceNo(nextInvoiceNo());
  };

  /***** UI *****/
  return (
    <>
      <div className="fixed inset-0 bg-white z-50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-4 py-2 flex items-center justify-between shadow">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-bold">Sales Invoice</h2>
            <p className="text-[10px] text-white/80">F3: Search • Arrows/Tab: Navigate • Enter: Add Row</p>
          </div>
          <button onClick={onClose} className="px-3 py-1 bg-white/20 rounded text-xs hover:bg-white/30">✕ Close</button>
        </div>

        {/* Compact Form */}
        <div className="px-4 py-2 bg-slate-50 border-b">
          <div className="grid grid-cols-8 gap-2 text-[11px]">
            <div>
              <label className="block text-[10px] font-bold mb-0.5">Invoice No</label>
              <input value={invoiceNo} readOnly className="w-full px-2 py-1 border rounded text-[10px] bg-gray-100 font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-0.5">Date</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="w-full px-2 py-1 border rounded text-[10px]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-0.5">Sale Type</label>
              <select value={saleType} onChange={e => setSaleType(e.target.value)} className="w-full px-2 py-1 border rounded text-[10px]">
                <option>B2C</option><option>B2B</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold mb-0.5">Customer</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full px-2 py-1 border rounded text-[10px]" placeholder="Optional" />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-0.5">Contact</label>
              <input value={contactNo} onChange={e => setContactNo(e.target.value)} className="w-full px-2 py-1 border rounded text-[10px]" placeholder="Optional" />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-0.5">Doctor</label>
              <input value={doctorName} onChange={e => setDoctorName(e.target.value)} className="w-full px-2 py-1 border rounded text-[10px]" placeholder="Optional" />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-0.5">Payment</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="w-full px-2 py-1 border rounded text-[10px]">
                <option>Cash</option><option>Card</option><option>UPI</option><option>Credit</option>
              </select>
            </div>
          </div>
        </div>

        {/* Items table (unlimited rows in UI) */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[10px] border-collapse">
            <thead className="bg-slate-700 text-white sticky top-0">
              <tr>
                <th className="px-1 py-1.5 border text-center" style={{width:'30px'}}>#</th>
                <th className="px-1 py-1.5 border text-left" style={{width:'90px'}}>Item Code</th>
                <th className="px-1 py-1.5 border text-left">Item Name</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'80px'}}>Batch</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'60px'}}>Expiry</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'50px'}}>Qty</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'45px'}}>Pack</th>
                <th className="px-1 py-1.5 border text-right" style={{width:'65px'}}>MRP</th>
                <th className="px-1 py-1.5 border text-right" style={{width:'65px'}}>Rate</th>
                <th className="px-1 py-1.5 border text-right" style={{width:'75px'}}>Gross</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'50px'}}>CGST%</th>
                <th className="px-1 py-1.5 border text-right" style={{width:'65px'}}>CGST</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'50px'}}>SGST%</th>
                <th className="px-1 py-1.5 border text-right" style={{width:'65px'}}>SGST</th>
                <th className="px-1 py-1.5 border text-right" style={{width:'80px'}}>Total</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'40px'}}>Del</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b hover:bg-blue-50">
                  <td className="px-1 py-0.5 border text-center text-[9px] font-bold">{item.no}</td>
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-itemCode`] = el}
                      value={item.itemCode}
                      onChange={e => handleItemCodeChange(idx, e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 0)}
                      className="w-full px-1 py-0.5 text-[10px] font-mono border-0 outline-none focus:bg-yellow-50"
                      placeholder="Code (F3 search)"
                    />
                  </td>
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-itemName`] = el}
                      value={item.itemName}
                      onChange={e => setRow(idx, r => ({ ...r, itemName: e.target.value }))}
                      onKeyDown={e => handleKeyDown(e, idx, 1)}
                      className="w-full px-1 py-0.5 text-[10px] border-0 outline-none focus:bg-yellow-50"
                    />
                  </td>
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-batch`] = el}
                      value={item.batch}
                      onChange={e => setRow(idx, r => ({ ...r, batch: e.target.value }))}
                      onKeyDown={e => handleKeyDown(e, idx, 2)}
                      className="w-full px-1 py-0.5 text-[10px] font-mono text-center border-0 outline-none focus:bg-yellow-50"
                    />
                  </td>
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-expiryDate`] = el}
                      value={item.expiryDate}
                      onChange={e => setRow(idx, r => ({ ...r, expiryDate: e.target.value }))}
                      onKeyDown={e => handleKeyDown(e, idx, 3)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50"
                      placeholder="MM/YY"
                    />
                  </td>
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-quantity`] = el}
                      type="number"
                      value={item.quantity || ''}
                      onChange={e => setRow(idx, r => ({ ...r, quantity: Number(e.target.value || 0) }))}
                      onKeyDown={e => handleKeyDown(e, idx, 4)}
                      className="w-full px-1 py-0.5 text-[10px] text-center font-bold border-0 outline-none focus:bg-yellow-50"
                    />
                  </td>
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-pack`] = el}
                      type="number"
                      value={item.pack}
                      onChange={e => setRow(idx, r => ({ ...r, pack: Number(e.target.value || 1) }))}
                      onKeyDown={e => handleKeyDown(e, idx, 5)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50"
                    />
                  </td>
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-mrp`] = el}
                      type="number" step="0.01"
                      value={item.mrp || ''}
                      onChange={e => setRow(idx, r => ({ ...r, mrp: Number(e.target.value || 0) }))}
                      onKeyDown={e => handleKeyDown(e, idx, 6)}
                      className="w-full px-1 py-0.5 text-[10px] text-right border-0 outline-none focus:bg-yellow-50"
                    />
                  </td>
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-rate`] = el}
                      type="number" step="0.01"
                      value={item.rate || ''}
                      onChange={e => setRow(idx, r => ({ ...r, rate: Number(e.target.value || 0) }))}
                      onKeyDown={e => handleKeyDown(e, idx, 7)}
                      className="w-full px-1 py-0.5 text-[10px] text-right font-bold text-green-700 border-0 outline-none focus:bg-yellow-50"
                    />
                  </td>
                  <td className="px-1 py-0.5 border text-right">₹{item.grossAmt.toFixed(2)}</td>
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-cgstPercent`] = el}
                      type="number" step="0.1"
                      value={item.cgstPercent}
                      onChange={e => setRow(idx, r => ({ ...r, cgstPercent: Number(e.target.value || 0) }))}
                      onKeyDown={e => handleKeyDown(e, idx, 8)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50"
                    />
                  </td>
                  <td className="px-1 py-0.5 border text-right text-blue-700">₹{item.cgstAmt.toFixed(2)}</td>
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-sgstPercent`] = el}
                      type="number" step="0.1"
                      value={item.sgstPercent}
                      onChange={e => setRow(idx, r => ({ ...r, sgstPercent: Number(e.target.value || 0) }))}
                      onKeyDown={e => handleKeyDown(e, idx, 9)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50"
                    />
                  </td>
                  <td className="px-1 py-0.5 border text-right text-blue-700">₹{item.sgstAmt.toFixed(2)}</td>
                  <td className="px-1 py-0.5 border text-right font-bold text-purple-700">₹{item.total.toFixed(2)}</td>
                  <td className="px-1 py-0.5 border text-center">
                    <button onClick={() => removeRow(idx)} className="text-red-600 hover:bg-red-100 px-1 rounded text-xs">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom bar */}
        <div className="bg-white border-t px-4 py-2 flex items-center justify-between">
          <button onClick={addRow} className="px-3 py-1.5 bg-slate-600 text-white rounded text-[11px] font-semibold hover:bg-slate-700">+ Add Row (Enter)</button>

          <div className="flex items-center space-x-4 text-[11px]">
            <div><span className="text-slate-600">Total Qty:</span> <span className="font-bold text-sm">{totals.totalQty}</span></div>
            <div><span className="text-slate-600">CGST:</span> <span className="font-semibold text-blue-700">₹{totals.totalCgst.toFixed(2)}</span></div>
            <div><span className="text-slate-600">SGST:</span> <span className="font-semibold text-blue-700">₹{totals.totalSgst.toFixed(2)}</span></div>
            <div><span className="text-slate-600">Saved:</span> <span className="font-semibold text-emerald-700">₹{totals.savedFromMrp.toFixed(2)}</span></div>
            <div><span className="text-slate-600">Round:</span> <span className="font-semibold">{totals.roundOff >= 0 ? '+' : ''}₹{totals.roundOff.toFixed(2)}</span></div>
            <div className="bg-indigo-50 px-3 py-1.5 rounded">
              <span className="text-slate-600 font-bold mr-2">BILL AMOUNT</span>
              <span className="font-bold text-indigo-700 text-lg">₹{totals.finalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button onClick={clearAll} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-[11px] font-semibold hover:bg-gray-300">Clear</button>
            <button onClick={handleSave} className="px-4 py-1.5 bg-green-600 text-white rounded text-[11px] font-semibold hover:bg-green-700">Save & Print</button>
          </div>
        </div>
      </div>

      {/* Product Search */}
      {openSearch && searchRow !== null && (
        <ProductSearchModal
          open={openSearch}
          prefix={searchPrefix}
          products={inv}
          pendingQty={pendingQty}
          onClose={() => setOpenSearch(false)}
          onSelect={(picked) => { applyPickedToRow(searchRow, picked); setSearchRow(null); }}
        />
      )}

      {/* Toast */}
      {savedToast.show && (
        <div className="fixed top-4 right-4 z-[100] bg-green-600 text-white px-4 py-3 rounded-lg shadow-2xl max-w-md">
          <pre className="text-[10px] font-mono whitespace-pre-wrap">{savedToast.text}</pre>
        </div>
      )}

      {/* Print preview */}
      {showPreview && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-lg overflow-hidden shadow-2xl">
            <div className="bg-slate-800 text-white px-4 py-2 flex justify-between items-center">
              <h3 className="font-bold text-sm">Print Preview</h3>
              <button onClick={() => setShowPreview(false)} className="px-3 py-1 bg-red-500 rounded text-xs hover:bg-red-600">Close</button>
            </div>
            <iframe id="print-iframe" srcDoc={previewHTML} className="w-full h-full border-0" />
          </div>
        </div>
      )}
    </>
  );
}
