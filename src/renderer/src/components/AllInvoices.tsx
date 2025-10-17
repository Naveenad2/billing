// src/pages/AllInvoices.tsx
// ADVANCED All Invoices with Returns, Professional PDF Reports, Excel Export, Multi-Filter Search
// Features: Taxable/Non-Taxable breakdown, Return tracking, Inventory sync, Date range presets

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getInvoicesRange,
  getInvoiceByNo,
  getInvoiceItemsByInvoiceId,
  saveReturnAgainstInvoice,
  getSalesReport,
  type InvoiceHeader,
  type InvoiceLine,
} from '../services/salesDB';
import html2pdf from 'html2pdf.js';

// Inventory API interface
type InvApi = {
  incrementStockByCodeBatch?: (code: string, batch: string, qty: number) => Promise<{ success: boolean; newStock: number; itemName: string }>;
  decrementStockByCodeBatch?: (code: string, batch: string, qty: number) => Promise<{ success: boolean; newStock: number; itemName: string }>;
};

declare global {
  interface Window {
    inventory?: InvApi;
  }
}

type Row = {
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
};

// Utility functions
function fmtINR(n: number) {
  return `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toDisplayDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function csvEscape(v: any) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadFile(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

// Date range presets
const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1 },
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'This Month', days: -1 }, // Special: current month
  { label: 'Last Month', days: -2 }, // Special: previous month
];

export default function AllInvoices() {
  // Filter states
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Data states
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });

  // Return modal states
  const [openReturn, setOpenReturn] = useState(false);
  const [searchInReturn, setSearchInReturn] = useState('');
  const [returnMatches, setReturnMatches] = useState<{ header: InvoiceHeader; items: InvoiceLine[] }[]>([]);
  const [pickedReturn, setPickedReturn] = useState<{ header: InvoiceHeader; item: InvoiceLine } | null>(null);
  const [returnQty, setReturnQty] = useState<number>(1);
  const [savingReturn, setSavingReturn] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Load data
  const reload = async () => {
    setLoading(true);
    try {
      const list = await getInvoicesRange(from, to, q);
      setRows(list);
    } catch (error) {
      console.error('Failed to load invoices:', error);
      showToast('Failed to load invoices', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  // Computed totals with taxable/non-taxable breakdown
  const analytics = useMemo(() => {
    const taxableRows = rows.filter(r => r.cgst > 0 || r.sgst > 0);
    const nonTaxableRows = rows.filter(r => r.cgst === 0 && r.sgst === 0);
    
    return {
      total: {
        bills: rows.length,
        qty: rows.reduce((s, r) => s + r.qtyTotal, 0),
        gross: rows.reduce((s, r) => s + r.gross, 0),
        cgst: rows.reduce((s, r) => s + r.cgst, 0),
        sgst: rows.reduce((s, r) => s + r.sgst, 0),
        tax: rows.reduce((s, r) => s + r.cgst + r.sgst, 0),
        final: rows.reduce((s, r) => s + r.finalAmount, 0),
        profit: rows.reduce((s, r) => s + r.profit, 0),
      },
      taxable: {
        bills: taxableRows.length,
        gross: taxableRows.reduce((s, r) => s + r.gross, 0),
        cgst: taxableRows.reduce((s, r) => s + r.cgst, 0),
        sgst: taxableRows.reduce((s, r) => s + r.sgst, 0),
        total: taxableRows.reduce((s, r) => s + r.finalAmount, 0),
      },
      nonTaxable: {
        bills: nonTaxableRows.length,
        gross: nonTaxableRows.reduce((s, r) => s + r.gross, 0),
        total: nonTaxableRows.reduce((s, r) => s + r.finalAmount, 0),
      },
    };
  }, [rows]);

  // Toast notification
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // Date preset handler
  const applyDatePreset = (preset: typeof DATE_PRESETS[0]) => {
    const today = new Date();
    let fromDate = new Date();
    let toDate = new Date();

    if (preset.days === 0) {
      // Today
      fromDate = today;
      toDate = today;
    } else if (preset.days === 1) {
      // Yesterday
      fromDate.setDate(today.getDate() - 1);
      toDate.setDate(today.getDate() - 1);
    } else if (preset.days === -1) {
      // This Month
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
      toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (preset.days === -2) {
      // Last Month
      fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      toDate = new Date(today.getFullYear(), today.getMonth(), 0);
    } else {
      // Last N days
      fromDate.setDate(today.getDate() - preset.days);
      toDate = today;
    }

    setFrom(fromDate.toISOString().split('T')[0]);
    setTo(toDate.toISOString().split('T')[0]);
  };

  // Return search
  const runReturnSearch = async () => {
    const term = searchInReturn.trim();
    if (!term) {
      setReturnMatches([]);
      return;
    }

    try {
      const matches: { header: InvoiceHeader; items: InvoiceLine[] }[] = [];

      // Try invoice number first
      if (/^\d+$/.test(term)) {
        const inv = await getInvoiceByNo(term);
        if (inv) {
          const items = await getInvoiceItemsByInvoiceId(inv.id);
          matches.push({
            header: inv,
            items: items.map((it: any, idx: number) => ({
              ...it,
              id: it.id || it.lineId || idx,
              lineId: it.lineId || idx,
            })),
          });
        }
      }

      // Fallback: search products
      if (matches.length === 0) {
        const list = await getSalesReport(from, to, term);
        const byInv = new Map<number, { header: InvoiceHeader; items: InvoiceLine[] }>();
        for (const r of list) {
          const h = byInv.get(r.header.id) || {
            header: {
              id: r.header.id,
              invoiceNo: r.header.invoiceNo,
              invoiceDate: r.header.invoiceDate,
              patientName: r.header.patientName,
              contactNo: '',
              doctorName: '',
              paymentMode: '',
              saleType: '',
            },
            items: [],
          };
          h.items.push({
            ...r.item,
            id: r.item.id || r.item.lineId || h.items.length,
            lineId: r.item.lineId || h.items.length,
          } as InvoiceLine);
          byInv.set(r.header.id, h);
        }
        setReturnMatches(Array.from(byInv.values()));
        return;
      }

      setReturnMatches(matches);
    } catch (error) {
      console.error('Return search failed:', error);
      showToast('Search failed', 'error');
    }
  };

  useEffect(() => {
    if (!openReturn) return;
    const id = setTimeout(runReturnSearch, 300);
    return () => clearTimeout(id);
  }, [searchInReturn, openReturn]);

  // Save return with inventory update
  const saveReturn = async () => {
    if (!pickedReturn) return;

    const { header, item } = pickedReturn;
    const qty = Math.max(1, Math.min(returnQty, item.quantity));

    setSavingReturn(true);
    try {
      // Save return to IndexedDB
      const result = await saveReturnAgainstInvoice(header.id, item.lineId, qty);

      if (!result.ok) {
        throw new Error('Failed to save return');
      }

      // Update inventory
      if (window.inventory?.incrementStockByCodeBatch) {
        try {
          const invResult = await window.inventory.incrementStockByCodeBatch(
            item.itemCode,
            item.batch,
            qty
          );
          console.log('✅ Inventory updated:', invResult);
        } catch (invError) {
          console.warn('⚠️ Inventory update failed:', invError);
        }
      }

      // Refresh list
      await reload();

      // Close modal
      setOpenReturn(false);
      setPickedReturn(null);
      setReturnQty(1);
      setReturnMatches([]);
      setSearchInReturn('');

      showToast(`✅ Return saved: ${qty} × ${item.itemName} | Invoice #${header.invoiceNo}`, 'success');
    } catch (error) {
      console.error('Return save failed:', error);
      showToast('Failed to save return', 'error');
    } finally {
      setSavingReturn(false);
    }
  };

  // Export Excel (CSV)
  const exportExcel = async () => {
    setExporting(true);
    try {
      const list = await getSalesReport(from, to, q);
      const headers = [
        'Invoice No',
        'Date',
        'Customer',
        'Item Code',
        'Item Name',
        'Batch',
        'Qty',
        'Rate',
        'MRP',
        'Gross',
        'CGST%',
        'CGST',
        'SGST%',
        'SGST',
        'Total',
        'Profit',
      ];
      const lines = [headers.join(',')];

      for (const r of list) {
        const cols = [
          r.header.invoiceNo,
          toDisplayDate(r.header.invoiceDate),
          r.header.patientName || '',
          r.item.itemCode,
          r.item.itemName,
          r.item.batch,
          r.item.quantity,
          r.item.rate.toFixed(2),
          r.item.mrp.toFixed(2),
          r.item.grossAmt.toFixed(2),
          (r.item.cgstPercent || 0).toFixed(1),
          r.item.cgstAmt.toFixed(2),
          (r.item.sgstPercent || 0).toFixed(1),
          r.item.sgstAmt.toFixed(2),
          r.item.total.toFixed(2),
          ((r.item.profit ?? (r.item.rate - (r.item.purchasePrice ?? 0)) * r.item.quantity) || 0).toFixed(2),
        ].map(csvEscape);
        lines.push(cols.join(','));
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      downloadFile(`Sales_Report_${from}_to_${to}.csv`, blob);
      showToast('Excel exported successfully', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Export Professional PDF Sales Report
  const exportPDF = async () => {
    setExporting(true);
    try {
      const list = await getSalesReport(from, to, q);

      // Calculate comprehensive totals
      const totalQty = list.reduce((s, r) => s + r.item.quantity, 0);
      const totalGross = list.reduce((s, r) => s + r.item.grossAmt, 0);
      const totalCgst = list.reduce((s, r) => s + r.item.cgstAmt, 0);
      const totalSgst = list.reduce((s, r) => s + r.item.sgstAmt, 0);
      const totalTax = totalCgst + totalSgst;
      const totalAmount = list.reduce((s, r) => s + r.item.total, 0);
      const totalProfit = list.reduce(
        (s, r) => s + ((r.item.profit ?? (r.item.rate - (r.item.purchasePrice ?? 0)) * r.item.quantity) || 0),
        0
      );

      // Taxable vs Non-Taxable
      const taxableItems = list.filter(r => r.item.cgstAmt > 0 || r.item.sgstAmt > 0);
      const nonTaxableItems = list.filter(r => r.item.cgstAmt === 0 && r.item.sgstAmt === 0);
      
      const taxableGross = taxableItems.reduce((s, r) => s + r.item.grossAmt, 0);
      const taxableCgst = taxableItems.reduce((s, r) => s + r.item.cgstAmt, 0);
      const taxableSgst = taxableItems.reduce((s, r) => s + r.item.sgstAmt, 0);
      const taxableTotal = taxableItems.reduce((s, r) => s + r.item.total, 0);
      
      const nonTaxableGross = nonTaxableItems.reduce((s, r) => s + r.item.grossAmt, 0);
      const nonTaxableTotal = nonTaxableItems.reduce((s, r) => s + r.item.total, 0);

      const doc = document.createElement('div');
      doc.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding:24px; max-width:900px; margin:0 auto;">
          <!-- Header -->
          <div style="text-align:center; border-bottom:3px solid #1e40af; padding-bottom:16px; margin-bottom:20px;">
            <div style="font-size:24px; font-weight:bold; color:#1e40af;">SALES REPORT</div>
            <div style="font-size:13px; color:#64748b; margin-top:8px;">
              Period: <b>${toDisplayDate(from)}</b> to <b>${toDisplayDate(to)}</b>
            </div>
            ${q ? `<div style="font-size:12px; color:#475569; margin-top:4px;">Filter: "${q}"</div>` : ''}
            <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
              Generated on ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          </div>

          <!-- Summary Cards -->
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-bottom:20px;">
            <div style="background:#f1f5f9; padding:12px; border-radius:8px; text-align:center;">
              <div style="font-size:11px; color:#64748b; font-weight:600;">TOTAL INVOICES</div>
              <div style="font-size:20px; font-weight:bold; color:#0f172a; margin-top:4px;">${analytics.total.bills}</div>
            </div>
            <div style="background:#ecfdf5; padding:12px; border-radius:8px; text-align:center;">
              <div style="font-size:11px; color:#065f46; font-weight:600;">TOTAL SALES</div>
              <div style="font-size:20px; font-weight:bold; color:#065f46; margin-top:4px;">${fmtINR(totalAmount)}</div>
            </div>
            <div style="background:#fef3c7; padding:12px; border-radius:8px; text-align:center;">
              <div style="font-size:11px; color:#92400e; font-weight:600;">TOTAL TAX</div>
              <div style="font-size:20px; font-weight:bold; color:#92400e; margin-top:4px;">${fmtINR(totalTax)}</div>
            </div>
            <div style="background:#dbeafe; padding:12px; border-radius:8px; text-align:center;">
              <div style="font-size:11px; color:#1e40af; font-weight:600;">NET PROFIT</div>
              <div style="font-size:20px; font-weight:bold; color:#1e40af; margin-top:4px;">${fmtINR(totalProfit)}</div>
            </div>
          </div>

          <!-- Tax Breakdown Table -->
          <div style="margin-bottom:20px;">
            <div style="font-size:14px; font-weight:bold; color:#0f172a; margin-bottom:8px; border-bottom:2px solid #e2e8f0; padding-bottom:6px;">
              TAX BREAKDOWN
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:11px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="border:1px solid #cbd5e1; padding:8px; text-align:left; font-weight:600;">Category</th>
                  <th style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:600;">Invoices</th>
                  <th style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:600;">Taxable Value</th>
                  <th style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:600;">CGST</th>
                  <th style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:600;">SGST</th>
                  <th style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:600;">Total Tax</th>
                  <th style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:600;">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="border:1px solid #cbd5e1; padding:8px;">Taxable Sales</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${analytics.taxable.bills}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${fmtINR(taxableGross)}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${fmtINR(taxableCgst)}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${fmtINR(taxableSgst)}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:600;">${fmtINR(taxableCgst + taxableSgst)}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold; color:#065f46;">${fmtINR(taxableTotal)}</td>
                </tr>
                <tr>
                  <td style="border:1px solid #cbd5e1; padding:8px;">Non-Taxable Sales</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${analytics.nonTaxable.bills}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${fmtINR(nonTaxableGross)}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">-</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">-</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">-</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold; color:#065f46;">${fmtINR(nonTaxableTotal)}</td>
                </tr>
                <tr style="background:#f1f5f9; font-weight:bold;">
                  <td style="border:1px solid #cbd5e1; padding:8px;">TOTAL</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${analytics.total.bills}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${fmtINR(totalGross)}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${fmtINR(totalCgst)}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">${fmtINR(totalSgst)}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; color:#dc2626;">${fmtINR(totalTax)}</td>
                  <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; color:#065f46;">${fmtINR(totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Summary Metrics -->
          <div style="margin-bottom:20px;">
            <div style="font-size:14px; font-weight:bold; color:#0f172a; margin-bottom:8px; border-bottom:2px solid #e2e8f0; padding-bottom:6px;">
              KEY METRICS
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:11px;">
              <tr>
                <td style="border:1px solid #cbd5e1; padding:8px; background:#f8fafc; font-weight:600;">Total Quantity Sold</td>
                <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${totalQty.toLocaleString()}</td>
                <td style="border:1px solid #cbd5e1; padding:8px; background:#f8fafc; font-weight:600;">Average Bill Value</td>
                <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${fmtINR(analytics.total.bills > 0 ? totalAmount / analytics.total.bills : 0)}</td>
              </tr>
              <tr>
                <td style="border:1px solid #cbd5e1; padding:8px; background:#f8fafc; font-weight:600;">Gross Sales</td>
                <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${fmtINR(totalGross)}</td>
                <td style="border:1px solid #cbd5e1; padding:8px; background:#f8fafc; font-weight:600;">Profit Margin</td>
                <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold; color:#065f46;">${totalAmount > 0 ? ((totalProfit / totalAmount) * 100).toFixed(2) : '0.00'}%</td>
              </tr>
              <tr>
                <td style="border:1px solid #cbd5e1; padding:8px; background:#f8fafc; font-weight:600;">Total Tax Collected</td>
                <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold; color:#dc2626;">${fmtINR(totalTax)}</td>
                <td style="border:1px solid #cbd5e1; padding:8px; background:#f8fafc; font-weight:600;">Net Profit</td>
                <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold; color:#1e40af;">${fmtINR(totalProfit)}</td>
              </tr>
            </table>
          </div>

          <!-- Footer -->
          <div style="text-align:center; margin-top:32px; padding-top:16px; border-top:2px solid #e2e8f0; font-size:10px; color:#94a3b8;">
            <div>This is a computer-generated report. No signature required.</div>
            <div style="margin-top:4px; font-weight:600; color:#64748b;">WhiteHillsIntl Billing System</div>
          </div>
        </div>
      `;

      await html2pdf()
        .from(doc)
        .set({
          margin: [10, 10, 10, 10],
          filename: `Sales_Report_${from}_to_${to}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .save();

      showToast('PDF exported successfully', 'success');
    } catch (error) {
      console.error('PDF export failed:', error);
      showToast('PDF export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openReturn) {
        setOpenReturn(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e' && !openReturn) {
        e.preventDefault();
        exportExcel();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !openReturn) {
        e.preventDefault();
        exportPDF();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [openReturn, from, to, q]);

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Toast Notification */}
      {toast.show && (
        <div
          className={`fixed top-6 right-6 z-[200] px-6 py-4 rounded-xl shadow-2xl animate-slideIn ${
            toast.type === 'success'
              ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white'
              : 'bg-gradient-to-r from-rose-500 to-red-600 text-white'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className="text-2xl">{toast.type === 'success' ? '✅' : '❌'}</div>
            <div className="font-semibold">{toast.message}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-slate-800 via-slate-900 to-indigo-900 text-white shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold">All Invoices & Sales Reports</h1>
              <p className="text-xs text-white/70 mt-0.5">Advanced filtering, returns, and professional exports</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={exportExcel}
              disabled={exporting || loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold shadow-lg transition-all flex items-center space-x-2"
            >
              <span>{exporting ? '⏳ Exporting...' : '📊 Export Excel'}</span>
              <kbd className="hidden lg:inline px-2 py-0.5 bg-white/20 rounded text-[10px]">Ctrl+E</kbd>
            </button>
            <button
              onClick={exportPDF}
              disabled={exporting || loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold shadow-lg transition-all flex items-center space-x-2"
            >
              <span>{exporting ? '⏳ Exporting...' : '📄 Export PDF'}</span>
              <kbd className="hidden lg:inline px-2 py-0.5 bg-white/20 rounded text-[10px]">Ctrl+P</kbd>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 bg-white border-b shadow-sm">
        <div className="grid grid-cols-12 gap-3 items-end">
          {/* Date Range */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">From Date</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">To Date</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Quick Date Presets */}
          <div className="col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Quick Select</label>
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => applyDatePreset(preset)}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 rounded-md text-[11px] font-medium transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Search (Invoice / Customer / Product)</label>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Type keyword..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Apply Button */}
          <div className="col-span-1">
            <button
              onClick={reload}
              disabled={loading}
              className="w-full px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-lg font-semibold text-sm shadow-lg disabled:opacity-50 transition-all"
            >
              {loading ? '⏳' : '🔍 Apply'}
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-7 gap-3">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-3 rounded-lg border border-slate-200">
            <div className="text-[10px] font-semibold text-slate-600 uppercase">Total Bills</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{analytics.total.bills}</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-green-100 p-3 rounded-lg border border-emerald-200">
            <div className="text-[10px] font-semibold text-emerald-700 uppercase">Total Sales</div>
            <div className="text-xl font-bold text-emerald-700 mt-1">{fmtINR(analytics.total.final)}</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-yellow-100 p-3 rounded-lg border border-amber-200">
            <div className="text-[10px] font-semibold text-amber-700 uppercase">Total Tax</div>
            <div className="text-xl font-bold text-amber-700 mt-1">{fmtINR(analytics.total.tax)}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-3 rounded-lg border border-blue-200">
            <div className="text-[10px] font-semibold text-blue-700 uppercase">Net Profit</div>
            <div className="text-xl font-bold text-blue-700 mt-1">{fmtINR(analytics.total.profit)}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-violet-100 p-3 rounded-lg border border-purple-200">
            <div className="text-[10px] font-semibold text-purple-700 uppercase">Taxable</div>
            <div className="text-sm font-bold text-purple-700 mt-1">{analytics.taxable.bills} bills</div>
            <div className="text-xs text-purple-600">{fmtINR(analytics.taxable.total)}</div>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-pink-100 p-3 rounded-lg border border-rose-200">
            <div className="text-[10px] font-semibold text-rose-700 uppercase">Non-Taxable</div>
            <div className="text-sm font-bold text-rose-700 mt-1">{analytics.nonTaxable.bills} bills</div>
            <div className="text-xs text-rose-600">{fmtINR(analytics.nonTaxable.total)}</div>
          </div>
          <div className="bg-gradient-to-br from-cyan-50 to-teal-100 p-3 rounded-lg border border-cyan-200">
            <div className="text-[10px] font-semibold text-cyan-700 uppercase">Qty Sold</div>
            <div className="text-xl font-bold text-cyan-700 mt-1">{analytics.total.qty.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse bg-white">
          <thead className="bg-gradient-to-r from-slate-100 to-slate-200 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="border border-slate-300 px-3 py-2.5 text-center font-bold text-slate-700">Invoice No</th>
              <th className="border border-slate-300 px-3 py-2.5 text-center font-bold text-slate-700">Date</th>
              <th className="border border-slate-300 px-3 py-2.5 text-left font-bold text-slate-700">Customer</th>
              <th className="border border-slate-300 px-3 py-2.5 text-center font-bold text-slate-700">Items</th>
              <th className="border border-slate-300 px-3 py-2.5 text-center font-bold text-slate-700">Qty</th>
              <th className="border border-slate-300 px-3 py-2.5 text-right font-bold text-slate-700">Gross</th>
              <th className="border border-slate-300 px-3 py-2.5 text-right font-bold text-slate-700">CGST</th>
              <th className="border border-slate-300 px-3 py-2.5 text-right font-bold text-slate-700">SGST</th>
              <th className="border border-slate-300 px-3 py-2.5 text-right font-bold text-slate-700">Final</th>
              <th className="border border-slate-300 px-3 py-2.5 text-right font-bold text-slate-700">Profit</th>
              <th className="border border-slate-300 px-3 py-2.5 text-center font-bold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.id}
                className={`hover:bg-indigo-50 transition-colors ${selectedId === r.id ? 'bg-indigo-100' : ''}`}
              >
                <td className="border border-slate-200 px-3 py-2 text-center font-mono font-bold text-indigo-600">
                  {r.invoiceNo}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-center text-slate-700">{toDisplayDate(r.invoiceDate)}</td>
                <td className="border border-slate-200 px-3 py-2 text-slate-700">{r.customer || '-'}</td>
                <td className="border border-slate-200 px-3 py-2 text-center text-slate-700">{r.itemsCount}</td>
                <td className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">{r.qtyTotal}</td>
                <td className="border border-slate-200 px-3 py-2 text-right text-slate-700">{fmtINR(r.gross)}</td>
                <td className="border border-slate-200 px-3 py-2 text-right text-amber-600">{fmtINR(r.cgst)}</td>
                <td className="border border-slate-200 px-3 py-2 text-right text-amber-600">{fmtINR(r.sgst)}</td>
                <td className="border border-slate-200 px-3 py-2 text-right font-bold text-purple-700">
                  {fmtINR(r.finalAmount)}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-right font-bold text-emerald-700">
                  {fmtINR(r.profit)}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-center">
                  <div className="flex items-center justify-center space-x-2">
                    <button
                      onClick={() => {
                        setSelectedId(r.id);
                        setOpenReturn(true);
                        setSearchInReturn(r.invoiceNo);
                        setTimeout(() => searchRef.current?.focus(), 50);
                      }}
                      className="px-3 py-1.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-lg text-xs font-semibold hover:shadow-lg transition-all"
                    >
                      ↩️ Return
                    </button>
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className="px-3 py-1.5 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg text-xs font-semibold hover:shadow-lg transition-all"
                    >
                      👁️ View
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  className="border border-slate-200 px-3 py-12 text-center text-slate-500"
                  colSpan={11}
                >
                  <div className="text-4xl mb-3">📭</div>
                  <div className="font-semibold">No invoices found</div>
                  <div className="text-xs mt-1">Try adjusting your filters</div>
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gradient-to-r from-slate-100 to-slate-200 sticky bottom-0 shadow-sm">
              <tr className="font-bold">
                <td className="border border-slate-300 px-3 py-2.5 text-right text-slate-700" colSpan={4}>
                  TOTALS
                </td>
                <td className="border border-slate-300 px-3 py-2.5 text-center text-slate-900">{analytics.total.qty}</td>
                <td className="border border-slate-300 px-3 py-2.5 text-right text-slate-900">
                  {fmtINR(analytics.total.gross)}
                </td>
                <td className="border border-slate-300 px-3 py-2.5 text-right text-amber-700">
                  {fmtINR(analytics.total.cgst)}
                </td>
                <td className="border border-slate-300 px-3 py-2.5 text-right text-amber-700">
                  {fmtINR(analytics.total.sgst)}
                </td>
                <td className="border border-slate-300 px-3 py-2.5 text-right text-purple-700">
                  {fmtINR(analytics.total.final)}
                </td>
                <td className="border border-slate-300 px-3 py-2.5 text-right text-emerald-700">
                  {fmtINR(analytics.total.profit)}
                </td>
                <td className="border border-slate-300 px-3 py-2.5"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Return Modal */}
      {openReturn && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden animate-slideIn">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-white/10 p-2 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-sm">Process Return</div>
                  <div className="text-xs text-white/70">Search invoice and select item to return</div>
                </div>
              </div>
              <button
                onClick={() => setOpenReturn(false)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold transition-all"
              >
                ✕ Close (ESC)
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Search Box */}
              <div className="flex items-center space-x-3">
                <input
                  ref={searchRef}
                  value={searchInReturn}
                  onChange={e => setSearchInReturn(e.target.value)}
                  placeholder="🔍 Search by Invoice No or Product Code/Name..."
                  className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  onClick={runReturnSearch}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-semibold text-sm shadow-lg hover:shadow-xl transition-all"
                >
                  Search
                </button>
              </div>

              {/* Results Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Invoices List */}
                <div className="border-2 border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-slate-100 to-slate-200 font-bold text-sm text-slate-700">
                    📋 Matching Invoices
                  </div>
                  <div className="max-h-[320px] overflow-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-700 font-semibold">Invoice</th>
                          <th className="px-3 py-2 text-left text-slate-700 font-semibold">Date</th>
                          <th className="px-3 py-2 text-left text-slate-700 font-semibold">Customer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {returnMatches.map((m, i) => (
                          <tr
                            key={i}
                            className="hover:bg-indigo-50 cursor-pointer transition-colors"
                            onClick={() => setPickedReturn({ header: m.header, item: m.items[0] })}
                          >
                            <td className="px-3 py-2 font-mono font-bold text-indigo-600">{m.header.invoiceNo}</td>
                            <td className="px-3 py-2 text-slate-700">{toDisplayDate(m.header.invoiceDate)}</td>
                            <td className="px-3 py-2 text-slate-700">{m.header.patientName || '-'}</td>
                          </tr>
                        ))}
                        {returnMatches.length === 0 && (
                          <tr>
                            <td className="px-3 py-8 text-center text-slate-500 text-sm" colSpan={3}>
                              <div className="text-2xl mb-2">🔍</div>
                              <div>No matches found</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Items List */}
                <div className="border-2 border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-slate-100 to-slate-200 font-bold text-sm text-slate-700">
                    🛒 Invoice Items
                  </div>
                  <div className="max-h-[320px] overflow-auto">
                    {pickedReturn ? (
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-slate-700 font-semibold">Code</th>
                            <th className="px-3 py-2 text-left text-slate-700 font-semibold">Name</th>
                            <th className="px-3 py-2 text-center text-slate-700 font-semibold">Batch</th>
                            <th className="px-3 py-2 text-center text-slate-700 font-semibold">Qty</th>
                            <th className="px-3 py-2 text-center text-slate-700 font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {returnMatches
                            .find(x => x.header.id === pickedReturn.header.id)
                            ?.items.map(it => (
                              <tr
                                key={it.id}
                                className={`hover:bg-indigo-50 transition-colors ${
                                  pickedReturn.item.id === it.id ? 'bg-indigo-100' : ''
                                }`}
                              >
                                <td className="px-3 py-2 font-mono text-slate-700">{it.itemCode}</td>
                                <td className="px-3 py-2 text-slate-700">{it.itemName}</td>
                                <td className="px-3 py-2 text-center text-slate-700">{it.batch}</td>
                                <td className="px-3 py-2 text-center font-bold text-slate-900">{it.quantity}</td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    onClick={() => setPickedReturn({ header: pickedReturn.header, item: it })}
                                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                                      pickedReturn.item.id === it.id
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-200 text-slate-700 hover:bg-indigo-100'
                                    }`}
                                  >
                                    {pickedReturn.item.id === it.id ? '✓ Selected' : 'Select'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="px-4 py-12 text-center text-slate-500 text-sm">
                        <div className="text-3xl mb-3">👈</div>
                        <div>Select an invoice from the left</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Return Confirmation */}
              {pickedReturn && (
                <div className="border-2 border-indigo-200 rounded-xl p-5 bg-gradient-to-br from-indigo-50 to-blue-50">
                  <div className="text-sm font-bold text-indigo-900 mb-4">📦 Return Details</div>
                  <div className="grid grid-cols-6 gap-4 text-sm">
                    <div>
                      <div className="text-[10px] text-slate-600 font-semibold uppercase mb-1">Invoice</div>
                      <div className="font-mono font-bold text-indigo-600">{pickedReturn.header.invoiceNo}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-600 font-semibold uppercase mb-1">Code</div>
                      <div className="font-mono font-bold text-slate-900">{pickedReturn.item.itemCode}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[10px] text-slate-600 font-semibold uppercase mb-1">Product Name</div>
                      <div className="font-bold text-slate-900">{pickedReturn.item.itemName}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-600 font-semibold uppercase mb-1">Sold Qty</div>
                      <div className="font-bold text-slate-900 text-lg">{pickedReturn.item.quantity}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-600 font-semibold uppercase mb-1">Return Qty</div>
                      <input
                        type="number"
                        min={1}
                        max={pickedReturn.item.quantity}
                        value={returnQty}
                        onChange={e =>
                          setReturnQty(Math.max(1, Math.min(Number(e.target.value || 1), pickedReturn.item.quantity)))
                        }
                        className="w-full px-3 py-2 border-2 border-indigo-300 rounded-lg text-sm font-bold text-center focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-end space-x-3">
                    <button
                      onClick={() => setPickedReturn(null)}
                      className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-semibold text-sm transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={savingReturn}
                      onClick={saveReturn}
                      className="px-8 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-lg hover:shadow-xl transition-all"
                    >
                      {savingReturn ? '⏳ Processing...' : '✓ Confirm Return'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
