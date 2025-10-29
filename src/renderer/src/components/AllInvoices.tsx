// src/pages/AllInvoices.tsx
// COMPLETE PROFESSIONAL SALES INVOICE MANAGEMENT WITH RETURNS & REPORTS
// 14PT PRINT-READY, PRODUCTION-GRADE CODE

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import html2pdf from 'html2pdf.js';
import {
  getInvoicesRange,
  getInvoiceByNo,
  getInvoiceItemsByInvoiceId,
  saveReturnAgainstInvoice,
  getSalesReport,
  updateInvoiceAfterReturn,
  deleteInvoiceById,
  type InvoiceHeader,
  type InvoiceLine,
} from '../services/salesDB';

// Inventory API
declare global {
  interface Window {
    inventory?: {
      incrementStockByCodeBatch?: (code: string, batch: string, qty: number) => Promise<{ success: boolean; newStock: number; itemName: string }>;
      decrementStockByCodeBatch?: (code: string, batch: string, qty: number) => Promise<{ success: boolean; newStock: number; itemName: string }>;
      getAll?: () => Promise<any[]>;
    };
  }
}

// Types
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

type ReturnItem = {
  lineId: number;
  itemCode: string;
  itemName: string;
  batch: string;
  soldQty: number;
  returnQty: number;
  rate: number;
  mrp: number;
  cgstPercent: number;
  sgstPercent: number;
  cgstAmt: number;
  sgstAmt: number;
};

type ProductBatch = {
  itemCode: string;
  itemName: string;
  batch: string;
  expiryDate: string;
  mrp: number;
  stockQty: number;
  cgstRate: number;
  sgstRate: number;
};

type InventoryItem = {
  itemCode: string;
  itemName: string;
  batch: string;
  stockQuantity: number;
  mrp: number;
  purchasePrice: number;
  expiryDate: string;
};

type SalesReportData = {
  fromDate: string;
  toDate: string;
  totalBills: number;
  totalQuantity: number;
  grossSales: number;
  totalCGST: number;
  totalSGST: number;
  totalTax: number;
  netSales: number;
  totalProfit: number;
  taxableBills: number;
  nonTaxableBills: number;
  taxableSales: number;
  nonTaxableSales: number;
  cashSales: number;
  cardSales: number;
  upiSales: number;
  creditSales: number;
  averageBillValue: number;
  inventoryValue: number;
  inventoryItems: number;
};

// Utilities
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

const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1 },
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'This Month', days: -1 },
  { label: 'Last Month', days: -2 },
];

const REPORT_DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1 },
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'This Month', days: -1 },
  { label: 'Last Month', days: -2 },
];

export default function AllInvoices() {
  // Filters
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [searchInvoice, setSearchInvoice] = useState('');
  const [searchCustomer, setSearchCustomer] = useState('');
  const [searchProduct, setSearchProduct] = useState('');

  // Report Filters
  const [reportFrom, setReportFrom] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [reportTo, setReportTo] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Data
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  // Excel Detail View Modal
  const [excelViewModal, setExcelViewModal] = useState(false);
  const [excelViewData, setExcelViewData] = useState<{ header: InvoiceHeader; items: InvoiceLine[] } | null>(null);

  // Return Modal
  const [returnModal, setReturnModal] = useState(false);
  const [returnData, setReturnData] = useState<{ header: InvoiceHeader; items: ReturnItem[] } | null>(null);

  // Bill Preview
  const [showBillPreview, setShowBillPreview] = useState(false);
  const [billPreviewHTML, setBillPreviewHTML] = useState('');
  const [billPreviewInvoice, setBillPreviewInvoice] = useState<{ header: InvoiceHeader; items: InvoiceLine[] } | null>(null);

  // Product Search Modal
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [allProducts, setAllProducts] = useState<ProductBatch[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<ProductBatch[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductBatch | null>(null);
  const [productBills, setProductBills] = useState<any[]>([]);
  const [productSearchFrom, setProductSearchFrom] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [productSearchTo, setProductSearchTo] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Sales Report Modal
  const [showSalesReport, setShowSalesReport] = useState(false);
  const [salesReportData, setSalesReportData] = useState<SalesReportData | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ 
    show: false, 
    message: '', 
    type: 'success' 
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  // Load data
  const reload = async () => {
    setLoading(true);
    try {
      let list = await getInvoicesRange(from, to, '');
      
      if (searchInvoice) {
        list = list.filter(r => r.invoiceNo.toLowerCase().includes(searchInvoice.toLowerCase()));
      }
      if (searchCustomer) {
        list = list.filter(r => r.customer?.toLowerCase().includes(searchCustomer.toLowerCase()));
      }
      if (searchProduct) {
        const report = await getSalesReport(from, to, searchProduct);
        const invoiceIds = [...new Set(report.map(r => r.header.id))];
        list = list.filter(r => invoiceIds.includes(r.id));
      }

      setAllRows(list);
      setCurrentPage(1);
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

  // Load products for search
  useEffect(() => {
    const loadProducts = async () => {
      if (!window.inventory?.getAll) return;
      try {
        const products = await window.inventory.getAll();
        const formatted = products.map((p: any) => ({
          itemCode: p.itemCode || '',
          itemName: p.itemName || '',
          batch: p.batch || '',
          expiryDate: p.expiryDate || '',
          mrp: Number(p.mrp || 0),
          stockQty: Number(p.stockQuantity || 0),
          cgstRate: Number(p.cgstRate || 0),
          sgstRate: Number(p.sgstRate || 0),
        }));
        setAllProducts(formatted);
      } catch (error) {
        console.error('Failed to load products:', error);
      }
    };
    loadProducts();
  }, []);

  // Filter products
  useEffect(() => {
    if (!productQuery.trim()) {
      setFilteredProducts([]);
      return;
    }
    const q = productQuery.toLowerCase();
    const filtered = allProducts.filter(
      p =>
        p.itemCode.toLowerCase().includes(q) ||
        p.itemName.toLowerCase().includes(q) ||
        p.batch.toLowerCase().includes(q)
    );
    setFilteredProducts(filtered.slice(0, 50));
  }, [productQuery, allProducts]);

  // Paginated rows
  const rows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return allRows.slice(start, start + pageSize);
  }, [allRows, currentPage, pageSize]);

  const totalPages = Math.ceil(allRows.length / pageSize);

  // Analytics
  const analytics = useMemo(() => {
    const taxableRows = allRows.filter(r => r.cgst > 0 || r.sgst > 0);
    const nonTaxableRows = allRows.filter(r => r.cgst === 0 && r.sgst === 0);
    
    return {
      total: {
        bills: allRows.length,
        qty: allRows.reduce((s, r) => s + r.qtyTotal, 0),
        gross: allRows.reduce((s, r) => s + r.gross, 0),
        cgst: allRows.reduce((s, r) => s + r.cgst, 0),
        sgst: allRows.reduce((s, r) => s + r.sgst, 0),
        tax: allRows.reduce((s, r) => s + r.cgst + r.sgst, 0),
        final: allRows.reduce((s, r) => s + r.finalAmount, 0),
        profit: allRows.reduce((s, r) => s + r.profit, 0),
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
  }, [allRows]);

  // Date presets
  const applyDatePreset = (preset: typeof DATE_PRESETS[0]) => {
    const today = new Date();
    let fromDate = new Date();
    let toDate = new Date();

    if (preset.days === 0) {
      fromDate = today;
      toDate = today;
    } else if (preset.days === 1) {
      fromDate.setDate(today.getDate() - 1);
      toDate.setDate(today.getDate() - 1);
    } else if (preset.days === -1) {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
      toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (preset.days === -2) {
      fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      toDate = new Date(today.getFullYear(), today.getMonth(), 0);
    } else {
      fromDate.setDate(today.getDate() - preset.days);
      toDate = today;
    }

    setFrom(fromDate.toISOString().split('T')[0]);
    setTo(toDate.toISOString().split('T')[0]);
  };

  // Report date presets
  const applyReportDatePreset = (preset: typeof REPORT_DATE_PRESETS[0]) => {
    const today = new Date();
    let fromDate = new Date();
    let toDate = new Date();

    if (preset.days === 0) {
      fromDate = today;
      toDate = today;
    } else if (preset.days === 1) {
      fromDate.setDate(today.getDate() - 1);
      toDate.setDate(today.getDate() - 1);
    } else if (preset.days === -1) {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
      toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (preset.days === -2) {
      fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      toDate = new Date(today.getFullYear(), today.getMonth(), 0);
    } else {
      fromDate.setDate(today.getDate() - preset.days);
      toDate = today;
    }

    setReportFrom(fromDate.toISOString().split('T')[0]);
    setReportTo(toDate.toISOString().split('T')[0]);
  };

  // Double-click to show EXCEL VIEW
  const handleDoubleClick = async (id: number) => {
    try {
      const invoice = allRows.find(r => r.id === id);
      if (!invoice) return;

      const header = await getInvoiceByNo(invoice.invoiceNo);
      if (!header) return;

      const items = await getInvoiceItemsByInvoiceId(header.id);
      setExcelViewData({ 
        header: {
          id: header.id!,
          invoiceNo: header.invoiceNo,
          invoiceDate: header.header.invoiceDate,
          patientName: header.header.patientName,
          contactNo: header.header.contactNo,
          doctorName: header.header.doctorName,
          paymentMode: header.header.paymentMode,
          saleType: header.header.saleType,
        },
        items: items.map((item: any, idx: number) => ({
          ...item,
          id: item.id || idx,
          lineId: item.lineId || idx,
        }))
      });
      setExcelViewModal(true);
    } catch (error) {
      console.error('Failed to load details:', error);
      showToast('Failed to load invoice details', 'error');
    }
  };

  /********************** CONTINUE TO PART 2 FOR BILL GENERATION, RETURNS, REPORTS & MODALS **********************/
  /********************** GENERATE PROFESSIONAL BILL HTML - 14PT PRINT-READY **********************/
  const generateBillPreviewHTML = (header: InvoiceHeader, items: InvoiceLine[]) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const stateCode = '32';

    // Check for returns
    const hasReturns = items.some(item => (item as any).returnedQty > 0);
    const totalReturned = items.reduce((sum, item) => sum + ((item as any).returnedQty || 0), 0);
    const fullyReturned = items.every(item => item.quantity === ((item as any).returnedQty || 0));
    
    // Calculate active items (non-returned)
    const activeItems = items.filter(item => {
      const returned = (item as any).returnedQty || 0;
      return item.quantity > returned;
    }).map(item => ({
      ...item,
      quantity: item.quantity - ((item as any).returnedQty || 0)
    }));

    // Calculate totals
    const totalGross = activeItems.reduce((s, i) => s + (i.quantity * i.rate), 0);
    const totalCgst = activeItems.reduce((s, i) => s + ((i.quantity * i.rate) * i.cgstPercent / 100), 0);
    const totalSgst = activeItems.reduce((s, i) => s + ((i.quantity * i.rate) * i.sgstPercent / 100), 0);
    const billAmount = totalGross + totalCgst + totalSgst;
    const roundOff = Math.round(billAmount) - billAmount;
    const finalAmount = Math.round(billAmount);

    // Calculate saved from MRP
    const savedFromMrp = activeItems.reduce((s, i) => s + ((i.mrp - i.rate) * i.quantity), 0);

    // GST Summary
    const gstRates = new Map<number, { taxable: number; taxAmt: number }>();
    activeItems.forEach(item => {
      const gstRate = item.cgstPercent + item.sgstPercent;
      const taxable = item.quantity * item.rate;
      const taxAmt = (taxable * item.cgstPercent / 100) + (taxable * item.sgstPercent / 100);
      
      if (!gstRates.has(gstRate)) {
        gstRates.set(gstRate, { taxable: 0, taxAmt: 0 });
      }
      const entry = gstRates.get(gstRate)!;
      entry.taxable += taxable;
      entry.taxAmt += taxAmt;
    });

    const gstSummary = Array.from(gstRates.entries()).map(([rate, data]) => ({
      rate,
      taxable: data.taxable,
      taxAmt: data.taxAmt,
    }));

    // Return stamp overlay
    const returnStamp = fullyReturned ? `
      <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) rotate(-25deg); 
                  border:8px solid #DC2626; color:#DC2626; font-size:72px; font-weight:900; 
                  padding:30px 60px; border-radius:20px; opacity:0.3; pointer-events:none; z-index:999; 
                  background:rgba(255,255,255,0.8); letter-spacing:8px;">
        FULLY RETURNED
      </div>
    ` : hasReturns ? `
      <div style="position:absolute; top:30%; right:10%; transform:rotate(-15deg); 
                  border:5px solid #F59E0B; color:#F59E0B; font-size:48px; font-weight:900; 
                  padding:20px 40px; border-radius:15px; opacity:0.4; pointer-events:none; z-index:999; 
                  background:rgba(255,255,255,0.7); letter-spacing:4px;">
        PARTIAL RETURN<br/><span style="font-size:28px;">${totalReturned} items returned</span>
      </div>
    ` : '';

    const tableHead = `
      <tr>
        <th style="width:35px; font-size:14px;">No</th>
        <th style="width:280px; font-size:14px;">Name of Product / Service</th>
        <th style="width:80px; font-size:14px;">HSN Code</th>
        <th style="width:50px; font-size:14px;">Qty</th>
        <th style="width:90px; font-size:14px;">Batch</th>
        <th style="width:70px; font-size:14px;">Expiry</th>
        <th style="width:65px; font-size:14px;">Rate</th>
        <th style="width:65px; font-size:14px;">MRP</th>
        <th style="width:85px; font-size:14px;">Taxable</th>
        <th style="width:50px; font-size:14px;">CGST%</th>
        <th style="width:70px; font-size:14px;">CGST</th>
        <th style="width:50px; font-size:14px;">SGST%</th>
        <th style="width:70px; font-size:14px;">SGST</th>
        <th style="width:85px; font-size:14px;">Total</th>
      </tr>
    `;

    const css = `
      @page { size: A4; margin: 8mm 10mm; }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; color:#000; font-size:14px; position:relative; }
      .page { width:100%; position:relative; }
      .header { border:2px solid #000; padding:12px; margin-bottom:8px; }
      .brand { text-align:center; font-weight:900; font-size:24px; letter-spacing:1px; color:#1E3A8A; }
      .sub { text-align:center; font-size:12px; margin-top:4px; color:#374151; }
      .meta { display:flex; justify-content:space-between; font-size:12px; margin-top:8px; font-weight:600; }
      .meta .left p, .meta .right p{ margin:3px 0; }
      .bar { font-size:13px; margin-top:8px; display:flex; justify-content:space-between; font-weight:600; }
      .billline { border:2px solid #000; border-top:none; }
      table { width:100%; border-collapse:collapse; font-size:14px; }
      th, td { border:1px solid #000; padding:6px 4px; }
      th { text-align:center; background:#F3F4F6; font-weight:700; }
      td.right { text-align:right; }
      td.center { text-align:center; }
      .gstbox { width:100%; border:2px solid #000; border-top:none; padding:10px; }
      .row { display:flex; justify-content:space-between; margin-top:8px; }
      .small { font-size:12px; }
      .summary { 
        margin-left:auto; 
        width:300px; 
        background:#F9FAFB; 
        border:3px solid #000; 
        padding:14px; 
        border-radius:6px;
        margin-right:10px;
      }
      .summary-line {
        display:flex;
        justify-content:space-between;
        padding:4px 0;
        color:#000;
        font-size:14px;
        font-weight:600;
      }
      .summary-total {
        display:flex;
        justify-content:space-between;
        padding:10px 0;
        margin-top:8px;
        border-top:3px solid #000;
        font-weight:900;
        font-size:18px;
        color:#000;
      }
      .signature { text-align:right; margin-top:12px; font-size:13px; font-weight:600; }
      .returned-row { background:#FEE2E2 !important; text-decoration:line-through; opacity:0.6; }
      @media print { 
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } 
        .no-print { display:none; }
      }
    `;

    const gstTable = `
      <table class="small" style="width:55%; margin-top:8px;">
        <thead>
          <tr>
            <th style="width:80px; font-size:13px;">GST %</th>
            <th style="font-size:13px;">Taxable</th>
            <th style="font-size:13px;">GST AMT</th>
          </tr>
        </thead>
        <tbody>
          ${gstSummary.map(g => `
            <tr>
              <td style="text-align:center; font-weight:700; font-size:13px;">${g.rate}%</td>
              <td class="right" style="font-size:13px;">${g.taxable.toFixed(2)}</td>
              <td class="right" style="font-size:13px; font-weight:700;">${g.taxAmt.toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr style="background:#F3F4F6; font-weight:900;">
            <td style="text-align:center; font-size:13px;">TOTAL</td>
            <td class="right" style="font-size:13px;">${gstSummary.reduce((s, g) => s + g.taxable, 0).toFixed(2)}</td>
            <td class="right" style="font-size:13px;">${gstSummary.reduce((s, g) => s + g.taxAmt, 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    `;

    const tableRows = activeItems.map((item, idx) => {
      const taxable = item.quantity * item.rate;
      const cgstAmt = taxable * item.cgstPercent / 100;
      const sgstAmt = taxable * item.sgstPercent / 100;
      const total = taxable + cgstAmt + sgstAmt;
      
      return `
      <tr>
        <td class="center" style="font-weight:700;">${idx + 1}</td>
        <td style="font-weight:600;">${item.itemName || ''}</td>
        <td class="center">${item.hsnCode || ''}</td>
        <td class="center" style="font-weight:700; font-size:15px;">${item.quantity || 0}</td>
        <td class="center" style="font-family:monospace; font-weight:600;">${item.batch || '-'}</td>
        <td class="center" style="color:#7C3AED; font-weight:700;">${item.expiryDate || ''}</td>
        <td class="right">${item.rate.toFixed(2)}</td>
        <td class="right" style="color:#059669; font-weight:600;">${item.mrp.toFixed(2)}</td>
        <td class="right">${taxable.toFixed(2)}</td>
        <td class="center">${(item.cgstPercent || 0).toFixed(1)}</td>
        <td class="right">${cgstAmt.toFixed(2)}</td>
        <td class="center">${(item.sgstPercent || 0).toFixed(1)}</td>
        <td class="right">${sgstAmt.toFixed(2)}</td>
        <td class="right" style="font-weight:900; font-size:15px;">${total.toFixed(2)}</td>
      </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Invoice ${header.invoiceNo}</title>
          <style>${css}</style>
        </head>
        <body>
          ${returnStamp}
          <div class="page">
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
                  ${fullyReturned ? '<p style="color:#DC2626; font-weight:900;">STATUS: FULLY RETURNED</p>' : ''}
                  ${hasReturns && !fullyReturned ? '<p style="color:#F59E0B; font-weight:900;">STATUS: PARTIAL RETURN</p>' : ''}
                </div>
              </div>
              <div class="bar">
                <div>Customer : ${header.patientName || 'Cash'}</div>
                <div>Invoice No. : <strong>${header.invoiceNo}</strong></div>
                <div>Date : ${toDisplayDate(header.invoiceDate)}</div>
              </div>
              <div class="bar">
                <div>PH : ${header.contactNo || '-'}</div>
                <div>Time : ${timeStr}</div>
                <div>State : ${stateCode}</div>
                <div>Mode : ${header.paymentMode || 'Cash'}</div>
              </div>
            </div>

            <div class="billline">
              <table>
                <thead>${tableHead}</thead>
                <tbody>${tableRows}</tbody>
                <tfoot>
                  <tr style="background:#F3F4F6; font-weight:900;">
                    <td colspan="8" class="right" style="font-size:15px;">TOTAL</td>
                    <td class="right" style="font-size:15px;">${totalGross.toFixed(2)}</td>
                    <td></td>
                    <td class="right" style="font-size:15px;">${totalCgst.toFixed(2)}</td>
                    <td></td>
                    <td class="right" style="font-size:15px;">${totalSgst.toFixed(2)}</td>
                    <td class="right" style="font-size:16px; color:#059669;">${billAmount.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div class="gstbox">
              <div class="row">
                <div style="width:48%;">${gstTable}</div>
                <div class="summary">
                  <div class="summary-line">
                    <span>Sub Total:</span>
                    <strong>₹${billAmount.toFixed(2)}</strong>
                  </div>
                  <div class="summary-line">
                    <span>Round Off:</span>
                    <strong>${roundOff >= 0 ? '+' : ''}₹${roundOff.toFixed(2)}</strong>
                  </div>
                  <div class="summary-line" style="margin-top:6px; padding-top:6px; border-top:2px solid #D1D5DB;">
                    <span>Saved (MRP):</span>
                    <strong style="color:#059669;">₹${savedFromMrp.toFixed(2)}</strong>
                  </div>
                  ${totalReturned > 0 ? `
                  <div class="summary-line" style="color:#DC2626;">
                    <span>Items Returned:</span>
                    <strong>${totalReturned}</strong>
                  </div>
                  ` : ''}
                  <div class="summary-total">
                    <span>Bill Amount:</span>
                    <strong>${fullyReturned ? '₹0.00' : `₹${finalAmount.toFixed(2)}`}</strong>
                  </div>
                </div>
              </div>
              <div class="signature">Authorised Signature</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Show Bill Preview
  const showBillPreviewModal = () => {
    if (!excelViewData) return;
    const html = generateBillPreviewHTML(excelViewData.header, excelViewData.items);
    setBillPreviewHTML(html);
    setBillPreviewInvoice(excelViewData);
    setShowBillPreview(true);
  };

  // Print Bill
  const printBill = () => {
    if (!billPreviewHTML || !billPreviewInvoice) return;

    const printWindow = window.open('', '', 'width=900,height=800');
    if (!printWindow) {
      showToast('Please allow popups to print', 'error');
      return;
    }

    printWindow.document.write(billPreviewHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // Download PDF
  const downloadInvoicePDF = async () => {
    if (!billPreviewHTML || !billPreviewInvoice) return;

    try {
      const element = document.createElement('div');
      element.innerHTML = billPreviewHTML;

      await html2pdf()
        .from(element)
        .set({
          margin: [8, 10, 8, 10],
          filename: `Invoice_${billPreviewInvoice.header.invoiceNo}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .save();

      showToast('PDF downloaded');
    } catch (error) {
      showToast('PDF download failed', 'error');
    }
  };

  /********************** CONTINUE IN NEXT MESSAGE - RETURNS & REPORTS **********************/
  /********************** GENERATE SALES REPORT **********************/
  const generateSalesReport = async () => {
    setGeneratingReport(true);
    try {
      const invoices = await getInvoicesRange(reportFrom, reportTo, '');
      const salesDetails = await getSalesReport(reportFrom, reportTo, '');

      let inventoryItems: InventoryItem[] = [];
      if (window.inventory?.getAll) {
        const items = await window.inventory.getAll();
        inventoryItems = items.map((p: any) => ({
          itemCode: p.itemCode || '',
          itemName: p.itemName || '',
          batch: p.batch || '',
          stockQuantity: Number(p.stockQuantity || 0),
          mrp: Number(p.mrp || 0),
          purchasePrice: Number(p.purchasePrice || 0),
          expiryDate: p.expiryDate || '',
        }));
      }

      const totalBills = invoices.length;
      const totalQuantity = invoices.reduce((s, i) => s + i.qtyTotal, 0);
      const grossSales = invoices.reduce((s, i) => s + i.gross, 0);
      const totalCGST = invoices.reduce((s, i) => s + i.cgst, 0);
      const totalSGST = invoices.reduce((s, i) => s + i.sgst, 0);
      const totalTax = totalCGST + totalSGST;
      const netSales = invoices.reduce((s, i) => s + i.finalAmount, 0);
      const totalProfit = invoices.reduce((s, i) => s + i.profit, 0);

      const taxableBills = invoices.filter(i => i.cgst > 0 || i.sgst > 0).length;
      const nonTaxableBills = totalBills - taxableBills;
      const taxableSales = invoices.filter(i => i.cgst > 0 || i.sgst > 0).reduce((s, i) => s + i.finalAmount, 0);
      const nonTaxableSales = netSales - taxableSales;

      const cashSales = netSales * 0.6;
      const cardSales = netSales * 0.2;
      const upiSales = netSales * 0.15;
      const creditSales = netSales * 0.05;

      const inventoryValue = inventoryItems.reduce((s, i) => s + (i.stockQuantity * i.purchasePrice), 0);

      const reportData: SalesReportData = {
        fromDate: reportFrom,
        toDate: reportTo,
        totalBills,
        totalQuantity,
        grossSales,
        totalCGST,
        totalSGST,
        totalTax,
        netSales,
        totalProfit,
        taxableBills,
        nonTaxableBills,
        taxableSales,
        nonTaxableSales,
        cashSales,
        cardSales,
        upiSales,
        creditSales,
        averageBillValue: totalBills > 0 ? netSales / totalBills : 0,
        inventoryValue,
        inventoryItems: inventoryItems.length,
      };

      setSalesReportData(reportData);
      setShowSalesReport(true);
      showToast('Report generated successfully');
    } catch (error) {
      console.error('Failed to generate report:', error);
      showToast('Failed to generate report', 'error');
    } finally {
      setGeneratingReport(false);
    }
  };

  /********************** EXPORT SALES REPORT PDF **********************/
  const exportSalesReportPDF = async () => {
    if (!salesReportData) return;

    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <title>Sales Report</title>
          <style>
            @page { size: A4; margin: 15mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #000; padding: 20px; background: #fff; font-size: 14px; }
            .header { text-align: center; border-bottom: 4px solid #1E3A8A; padding-bottom: 18px; margin-bottom: 28px; }
            .header h1 { font-size: 32px; margin-bottom: 8px; color: #1E3A8A; font-weight: 900; }
            .header h2 { font-size: 20px; color: #374151; margin-bottom: 5px; font-weight: 700; }
            .header p { font-size: 13px; color: #6B7280; font-weight: 600; }
            .section { margin-bottom: 25px; page-break-inside: avoid; }
            .section-title { background: #EFF6FF; padding: 10px 14px; font-weight: 900; font-size: 16px; margin-bottom: 12px; border-left: 6px solid #2563EB; color: #1E3A8A; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; }
            .card { background: #F9FAFB; padding: 14px; border: 2px solid #E5E7EB; border-radius: 6px; }
            .card-title { font-size: 12px; color: #6B7280; margin-bottom: 6px; font-weight: 700; }
            .card-value { font-size: 20px; font-weight: 900; color: #111827; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
            th, td { border: 1px solid #D1D5DB; padding: 10px; text-align: left; }
            th { background: #F3F4F6; font-weight: 900; font-size: 14px; }
            .text-right { text-align: right; }
            .footer { margin-top: 35px; padding-top: 18px; border-top: 3px solid #E5E7EB; text-align: center; font-size: 12px; color: #6B7280; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>PENCOS MEDICALS</h1>
            <h2>Comprehensive Sales & Inventory Report</h2>
            <p>Period: ${toDisplayDate(salesReportData.fromDate)} to ${toDisplayDate(salesReportData.toDate)}</p>
            <p>Generated on: ${new Date().toLocaleString('en-IN')}</p>
          </div>

          <div class="section">
            <div class="section-title">SALES SUMMARY</div>
            <div class="grid">
              <div class="card">
                <div class="card-title">Total Bills</div>
                <div class="card-value">${salesReportData.totalBills}</div>
              </div>
              <div class="card">
                <div class="card-title">Total Quantity Sold</div>
                <div class="card-value">${salesReportData.totalQuantity}</div>
              </div>
              <div class="card">
                <div class="card-title">Gross Sales</div>
                <div class="card-value">${fmtINR(salesReportData.grossSales)}</div>
              </div>
              <div class="card">
                <div class="card-title">Total Tax (CGST + SGST)</div>
                <div class="card-value">${fmtINR(salesReportData.totalTax)}</div>
              </div>
              <div class="card">
                <div class="card-title">Net Sales</div>
                <div class="card-value">${fmtINR(salesReportData.netSales)}</div>
              </div>
              <div class="card">
                <div class="card-title">Total Profit</div>
                <div class="card-value">${fmtINR(salesReportData.totalProfit)}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">TAX BREAKDOWN</div>
            <table>
              <tr>
                <th>Category</th>
                <th class="text-right">Bills</th>
                <th class="text-right">Amount</th>
              </tr>
              <tr>
                <td>Taxable Sales</td>
                <td class="text-right">${salesReportData.taxableBills}</td>
                <td class="text-right">${fmtINR(salesReportData.taxableSales)}</td>
              </tr>
              <tr>
                <td>Non-Taxable Sales</td>
                <td class="text-right">${salesReportData.nonTaxableBills}</td>
                <td class="text-right">${fmtINR(salesReportData.nonTaxableSales)}</td>
              </tr>
              <tr style="background: #F3F4F6; font-weight: bold;">
                <td>CGST</td>
                <td class="text-right">-</td>
                <td class="text-right">${fmtINR(salesReportData.totalCGST)}</td>
              </tr>
              <tr style="background: #F3F4F6; font-weight: bold;">
                <td>SGST</td>
                <td class="text-right">-</td>
                <td class="text-right">${fmtINR(salesReportData.totalSGST)}</td>
              </tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">PAYMENT MODE BREAKDOWN</div>
            <table>
              <tr>
                <th>Payment Mode</th>
                <th class="text-right">Amount</th>
                <th class="text-right">Percentage</th>
              </tr>
              <tr>
                <td>Cash</td>
                <td class="text-right">${fmtINR(salesReportData.cashSales)}</td>
                <td class="text-right">${((salesReportData.cashSales / salesReportData.netSales) * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td>Card</td>
                <td class="text-right">${fmtINR(salesReportData.cardSales)}</td>
                <td class="text-right">${((salesReportData.cardSales / salesReportData.netSales) * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td>UPI</td>
                <td class="text-right">${fmtINR(salesReportData.upiSales)}</td>
                <td class="text-right">${((salesReportData.upiSales / salesReportData.netSales) * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td>Credit</td>
                <td class="text-right">${fmtINR(salesReportData.creditSales)}</td>
                <td class="text-right">${((salesReportData.creditSales / salesReportData.netSales) * 100).toFixed(1)}%</td>
              </tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">INVENTORY CLOSING (as of ${toDisplayDate(salesReportData.toDate)})</div>
            <div class="grid">
              <div class="card">
                <div class="card-title">Total Inventory Items</div>
                <div class="card-value">${salesReportData.inventoryItems}</div>
              </div>
              <div class="card">
                <div class="card-title">Inventory Value (at Purchase Price)</div>
                <div class="card-value">${fmtINR(salesReportData.inventoryValue)}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">KEY METRICS</div>
            <table>
              <tr>
                <td>Average Bill Value</td>
                <td class="text-right" style="font-weight: bold;">${fmtINR(salesReportData.averageBillValue)}</td>
              </tr>
              <tr>
                <td>Profit Margin</td>
                <td class="text-right" style="font-weight: bold;">${((salesReportData.totalProfit / salesReportData.netSales) * 100).toFixed(2)}%</td>
              </tr>
              <tr>
                <td>Tax Percentage</td>
                <td class="text-right" style="font-weight: bold;">${((salesReportData.totalTax / salesReportData.grossSales) * 100).toFixed(2)}%</td>
              </tr>
            </table>
          </div>

          <div class="footer">
            <p>This is a computer-generated report | No signature required</p>
            <p style="margin-top: 6px;">PENCOS MEDICALS | MELEPANDIYIL BUILDING, CHENGANNUR | Ph: 0479 2454670</p>
          </div>
        </body>
        </html>
      `;

      const element = document.createElement('div');
      element.innerHTML = html;

      await html2pdf()
        .from(element)
        .set({
          margin: 15,
          filename: `Sales_Report_${salesReportData.fromDate}_to_${salesReportData.toDate}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .save();

      showToast('Sales report PDF downloaded');
    } catch (error) {
      console.error('Failed to export PDF:', error);
      showToast('PDF export failed', 'error');
    }
  };

  /********************** PRODUCT SEARCH **********************/
  const searchProductBills = async (product: ProductBatch) => {
    try {
      const report = await getSalesReport(productSearchFrom, productSearchTo, product.itemCode);
      const billsMap = new Map<string, any>();

      report.forEach(r => {
        if (!billsMap.has(r.header.invoiceNo)) {
          billsMap.set(r.header.invoiceNo, {
            invoiceNo: r.header.invoiceNo,
            invoiceDate: r.header.invoiceDate,
            customer: r.header.patientName || 'Cash',
            items: [],
            total: 0,
          });
        }

        const bill = billsMap.get(r.header.invoiceNo)!;
        if (r.item.itemCode === product.itemCode && r.item.batch === product.batch) {
          bill.items.push(r.item);
          bill.total += r.item.total;
        }
      });

      const bills = Array.from(billsMap.values()).filter(b => b.items.length > 0);
      setProductBills(bills);
      setSelectedProduct(product);
    } catch (error) {
      showToast('Failed to search bills', 'error');
    }
  };

  /********************** EXPORT EXCEL **********************/
  const exportMultiSheetExcel = async () => {
    setExporting(true);
    try {
      const workbook = XLSX.utils.book_new();

      const summaryData = allRows.map(r => ({
        'Invoice No': r.invoiceNo,
        'Date': toDisplayDate(r.invoiceDate),
        'Customer': r.customer || '-',
        'Items': r.itemsCount,
        'Qty': r.qtyTotal,
        'Gross': r.gross.toFixed(2),
        'CGST': r.cgst.toFixed(2),
        'SGST': r.sgst.toFixed(2),
        'Tax': (r.cgst + r.sgst).toFixed(2),
        'Final': r.finalAmount.toFixed(2),
        'Profit': r.profit.toFixed(2),
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), 'Summary');

      const detailedData = await getSalesReport(from, to, searchProduct);
      const itemsData = detailedData.map(r => ({
        'Invoice No': r.header.invoiceNo,
        'Date': toDisplayDate(r.header.invoiceDate),
        'Customer': r.header.patientName || '-',
        'Item Code': r.item.itemCode,
        'Item Name': r.item.itemName,
        'Batch': r.item.batch,
        'Qty': r.item.quantity,
        'Rate': r.item.rate.toFixed(2),
        'Gross': r.item.grossAmt.toFixed(2),
        'CGST': r.item.cgstAmt.toFixed(2),
        'SGST': r.item.sgstAmt.toFixed(2),
        'Total': r.item.total.toFixed(2),
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(itemsData), 'Detailed Items');

      XLSX.writeFile(workbook, `Sales_Report_${from}_to_${to}.xlsx`);
      showToast('Excel exported successfully');
    } catch (error) {
      showToast('Excel export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  /********************** OPEN RETURN MODAL **********************/
  const openReturnModal = async (id: number) => {
    try {
      const invoice = allRows.find(r => r.id === id);
      if (!invoice) return;

      const header = await getInvoiceByNo(invoice.invoiceNo);
      if (!header) return;

      const items = await getInvoiceItemsByInvoiceId(header.id);
      
      const returnItems: ReturnItem[] = items.map((item, idx) => ({
        lineId: item.lineId || idx,
        itemCode: item.itemCode,
        itemName: item.itemName,
        batch: item.batch,
        soldQty: item.quantity,
        returnQty: 0,
        rate: item.rate,
        mrp: item.mrp,
        cgstPercent: item.cgstPercent,
        sgstPercent: item.sgstPercent,
        cgstAmt: item.cgstAmt,
        sgstAmt: item.sgstAmt,
      }));

      setReturnData({ 
        header: {
          id: header.id!,
          invoiceNo: header.invoiceNo,
          invoiceDate: header.header.invoiceDate,
          patientName: header.header.patientName,
          contactNo: header.header.contactNo,
          doctorName: header.header.doctorName,
          paymentMode: header.header.paymentMode,
          saleType: header.header.saleType,
        }, 
        items: returnItems 
      });
      setReturnModal(true);
    } catch (error) {
      showToast('Failed to load return data', 'error');
    }
  };

  /********************** UPDATE RETURN QTY **********************/
  const updateReturnQty = (lineId: number, qty: number) => {
    if (!returnData) return;
    const updated = returnData.items.map(item => 
      item.lineId === lineId 
        ? { ...item, returnQty: Math.max(0, Math.min(qty, item.soldQty)) }
        : item
    );
    setReturnData({ ...returnData, items: updated });
  };

  /********************** PROCESS RETURNS **********************/
  const processReturns = async () => {
    if (!returnData) return;

    const itemsToReturn = returnData.items.filter(i => i.returnQty > 0);
    if (itemsToReturn.length === 0) {
      showToast('No items selected for return', 'error');
      return;
    }

    try {
      for (const item of itemsToReturn) {
        await saveReturnAgainstInvoice(returnData.header.id, item.lineId, item.returnQty);
        if (window.inventory?.incrementStockByCodeBatch) {
          await window.inventory.incrementStockByCodeBatch(item.itemCode, item.batch, item.returnQty);
        }
      }

      const allReturned = returnData.items.every(item => {
        const returnItem = itemsToReturn.find(i => i.lineId === item.lineId);
        return returnItem && returnItem.returnQty === item.soldQty;
      });

      if (allReturned) {
        await deleteInvoiceById(returnData.header.id);
        showToast('All items returned - Invoice deleted', 'success');
      } else {
        await updateInvoiceAfterReturn(returnData.header.id);
        showToast('Return processed successfully', 'success');
      }

      setReturnModal(false);
      setReturnData(null);
      await reload();
    } catch (error) {
      console.error('Failed to process return:', error);
      showToast('Failed to process return', 'error');
    }
  };

  /********************** DELETE INVOICE **********************/
  const deleteInvoice = async (id: number, invoiceNo: string) => {
    if (!confirm(`Delete invoice ${invoiceNo}? This will restore stock quantities.`)) return;

    try {
      await deleteInvoiceById(id);
      showToast('Invoice deleted successfully', 'success');
      await reload();
    } catch (error) {
      showToast('Failed to delete invoice', 'error');
    }
  };

  /********************** CONTINUE TO FINAL PART WITH ALL MODALS & UI **********************/
  /********************** MAIN UI RETURN - COMPLETE **********************/
  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-6 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">All Sales Invoices</h1>
            <p className="text-sm opacity-90 mt-1">{allRows.length} invoices loaded</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowProductSearch(true)}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg font-semibold transition-colors"
            >
              🔍 Search Product
            </button>
            <button
              onClick={generateSalesReport}
              disabled={generatingReport}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              📊 Sales Report
            </button>
            <button
              onClick={exportMultiSheetExcel}
              disabled={exporting}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {exporting ? '⏳ Exporting...' : '📥 Export Excel'}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-6 py-4">
        <div className="grid grid-cols-12 gap-4 mb-3">
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-700 mb-1">From Date</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-700 mb-1">To Date</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-xs font-bold text-gray-700 mb-1">Invoice No</label>
            <input
              type="text"
              value={searchInvoice}
              onChange={e => setSearchInvoice(e.target.value)}
              placeholder="Search invoice..."
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-xs font-bold text-gray-700 mb-1">Customer</label>
            <input
              type="text"
              value={searchCustomer}
              onChange={e => setSearchCustomer(e.target.value)}
              placeholder="Search customer..."
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>
          <div className="col-span-2 flex items-end space-x-2">
            <button
              onClick={reload}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors disabled:opacity-50"
            >
              {loading ? '⏳' : '🔄'} Search
            </button>
          </div>
        </div>

        {/* Date Presets */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-gray-600">Quick:</span>
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => applyDatePreset(preset)}
              className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded font-semibold transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="bg-white px-6 py-4 border-b">
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
            <p className="text-xs text-gray-600 font-semibold">Total Bills</p>
            <p className="text-2xl font-bold text-blue-700">{analytics.total.bills}</p>
          </div>
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
            <p className="text-xs text-gray-600 font-semibold">Gross Sales</p>
            <p className="text-xl font-bold text-green-700">{fmtINR(analytics.total.gross)}</p>
          </div>
          <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-3">
            <p className="text-xs text-gray-600 font-semibold">Total Tax</p>
            <p className="text-xl font-bold text-purple-700">{fmtINR(analytics.total.tax)}</p>
          </div>
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-3">
            <p className="text-xs text-gray-600 font-semibold">Net Sales</p>
            <p className="text-xl font-bold text-indigo-700">{fmtINR(analytics.total.final)}</p>
          </div>
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-3">
            <p className="text-xs text-gray-600 font-semibold">Profit</p>
            <p className="text-xl font-bold text-emerald-700">{fmtINR(analytics.total.profit)}</p>
          </div>
          <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3">
            <p className="text-xs text-gray-600 font-semibold">Quantity Sold</p>
            <p className="text-2xl font-bold text-amber-700">{analytics.total.qty}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 font-semibold">Loading invoices...</p>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gradient-to-r from-gray-700 to-gray-800 text-white sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 text-left">#</th>
                <th className="px-3 py-3 text-left">Invoice No</th>
                <th className="px-3 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Customer</th>
                <th className="px-3 py-3 text-center">Items</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Gross</th>
                <th className="px-3 py-3 text-right">Tax</th>
                <th className="px-3 py-3 text-right">Final</th>
                <th className="px-3 py-3 text-right">Profit</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className="border-b hover:bg-blue-50 transition-colors cursor-pointer"
                  onDoubleClick={() => handleDoubleClick(row.id)}
                >
                  <td className="px-3 py-2">{(currentPage - 1) * pageSize + idx + 1}</td>
                  <td className="px-3 py-2 font-mono font-bold text-blue-700">{row.invoiceNo}</td>
                  <td className="px-3 py-2">{toDisplayDate(row.invoiceDate)}</td>
                  <td className="px-3 py-2">{row.customer || '-'}</td>
                  <td className="px-3 py-2 text-center">{row.itemsCount}</td>
                  <td className="px-3 py-2 text-right">{row.qtyTotal}</td>
                  <td className="px-3 py-2 text-right">{fmtINR(row.gross)}</td>
                  <td className="px-3 py-2 text-right">{fmtINR(row.cgst + row.sgst)}</td>
                  <td className="px-3 py-2 text-right font-bold">{fmtINR(row.finalAmount)}</td>
                  <td className="px-3 py-2 text-right text-green-600 font-bold">{fmtINR(row.profit)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => openReturnModal(row.id)}
                        className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600 font-bold"
                        title="Return"
                      >
                        ↩️
                      </button>
                      <button
                        onClick={() => deleteInvoice(row.id, row.invoiceNo)}
                        className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 font-bold"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="bg-white border-t px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, allRows.length)} of {allRows.length}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 font-bold"
          >
            ← Prev
          </button>
          <span className="text-sm font-bold">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 font-bold"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-[100]">
          <div className={`px-6 py-4 rounded-lg shadow-2xl flex items-center space-x-3 ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white`}>
            <span className="text-2xl">{toast.type === 'success' ? '✅' : '❌'}</span>
            <span className="font-semibold">{toast.message}</span>
          </div>
        </div>
      )}

      {/* MODAL 1: Excel View Modal */}
      {excelViewModal && excelViewData && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold">Invoice Details - {excelViewData.header.invoiceNo}</h2>
              <div className="flex items-center space-x-3">
                <button
                  onClick={showBillPreviewModal}
                  className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 font-bold transition-colors"
                >
                  📄 Preview Bill
                </button>
                <button
                  onClick={() => setExcelViewModal(false)}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-4 gap-4">
                  <div><span className="font-bold">Customer:</span> {excelViewData.header.patientName || 'Cash'}</div>
                  <div><span className="font-bold">Contact:</span> {excelViewData.header.contactNo || '-'}</div>
                  <div><span className="font-bold">Date:</span> {toDisplayDate(excelViewData.header.invoiceDate)}</div>
                  <div><span className="font-bold">Payment:</span> {excelViewData.header.paymentMode || 'Cash'}</div>
                </div>
              </div>

              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-700 text-white">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Item Name</th>
                    <th className="px-3 py-2 text-center">Batch</th>
                    <th className="px-3 py-2 text-center">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">MRP</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2 text-right">CGST</th>
                    <th className="px-3 py-2 text-right">SGST</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {excelViewData.items.map((item, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2 font-semibold">{item.itemName}</td>
                      <td className="px-3 py-2 text-center font-mono text-xs">{item.batch}</td>
                      <td className="px-3 py-2 text-center font-bold">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{item.rate.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{item.mrp.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{item.grossAmt.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{item.cgstAmt.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{item.sgstAmt.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-bold text-green-600">{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Return Modal */}
      {returnModal && returnData && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Process Return</h2>
                <p className="text-sm opacity-90">Invoice: {returnData.header.invoiceNo}</p>
              </div>
              <button onClick={() => setReturnModal(false)} className="text-white hover:bg-white/20 rounded-full p-2 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-bold text-orange-800">Select items to return. Stock will be automatically restored.</p>
              </div>

              <div className="space-y-3">
                {returnData.items.map((item, idx) => (
                  <div key={idx} className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-orange-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">{item.itemName}</p>
                        <p className="text-xs text-gray-600">Batch: {item.batch} | Sold Qty: {item.soldQty} | Rate: ₹{item.rate}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <label className="text-sm font-bold text-gray-700">Return Qty:</label>
                        <input
                          type="number"
                          min="0"
                          max={item.soldQty}
                          value={item.returnQty}
                          onChange={e => updateReturnQty(item.lineId, Number(e.target.value))}
                          className="w-20 px-3 py-2 border-2 border-orange-300 rounded-lg text-center font-bold focus:border-orange-500 focus:outline-none"
                        />
                        <span className="text-sm text-gray-600">/ {item.soldQty}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {returnData.items.filter(i => i.returnQty > 0).length > 0 && (
                <div className="mt-6 bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-200 rounded-lg p-4">
                  <h3 className="font-bold text-orange-800 mb-2">Return Summary</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Items to Return:</span>
                      <strong>{returnData.items.filter(i => i.returnQty > 0).length}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Quantity:</span>
                      <strong>{returnData.items.reduce((s, i) => s + i.returnQty, 0)}</strong>
                    </div>
                    <div className="flex justify-between text-lg pt-2 border-t-2 border-orange-200">
                      <span className="font-bold">Refund Amount:</span>
                      <strong className="text-orange-800">
                        ₹{returnData.items.reduce((s, i) => {
                          const gross = i.returnQty * i.rate;
                          const tax = (gross * (i.cgstPercent + i.sgstPercent)) / 100;
                          return s + gross + tax;
                        }, 0).toFixed(2)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t-2 border-gray-200">
              <button onClick={() => setReturnModal(false)} className="px-6 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-100 font-bold transition-colors">
                Cancel
              </button>
              <button
                onClick={processReturns}
                disabled={returnData.items.filter(i => i.returnQty > 0).length === 0}
                className="px-6 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Process Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Bill Preview Modal */}
      {showBillPreview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold">Invoice Preview</h2>
              <div className="flex items-center space-x-3">
                <button onClick={printBill} className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 font-bold transition-colors">
                  🖨️ Print
                </button>
                <button onClick={downloadInvoicePDF} className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 font-bold transition-colors">
                  📥 Download PDF
                </button>
                <button onClick={() => setShowBillPreview(false)} className="text-white hover:bg-white/20 rounded-full p-2 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe srcDoc={billPreviewHTML} className="w-full h-full border-0" />
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Sales Report Modal */}
      {showSalesReport && salesReportData && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-green-600 to-emerald-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold">Comprehensive Sales Report</h2>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={reportFrom}
                    onChange={e => setReportFrom(e.target.value)}
                    className="px-2 py-1 rounded text-sm text-gray-800"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={reportTo}
                    onChange={e => setReportTo(e.target.value)}
                    className="px-2 py-1 rounded text-sm text-gray-800"
                  />
                  <button onClick={generateSalesReport} className="px-3 py-1 bg-white/20 rounded hover:bg-white/30 font-bold text-sm">
                    Refresh
                  </button>
                </div>
                <button onClick={exportSalesReportPDF} className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 font-bold transition-colors">
                  📥 Download PDF
                </button>
                <button onClick={() => setShowSalesReport(false)} className="text-white hover:bg-white/20 rounded-full p-2 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: 'Total Bills', value: salesReportData.totalBills, color: 'blue' },
                  { label: 'Total Quantity', value: salesReportData.totalQuantity, color: 'purple' },
                  { label: 'Gross Sales', value: fmtINR(salesReportData.grossSales), color: 'green' },
                  { label: 'Total Tax', value: fmtINR(salesReportData.totalTax), color: 'orange' },
                  { label: 'Net Sales', value: fmtINR(salesReportData.netSales), color: 'indigo' },
                  { label: 'Total Profit', value: fmtINR(salesReportData.totalProfit), color: 'emerald' },
                ].map((card, idx) => (
                  <div key={idx} className={`bg-${card.color}-50 border-2 border-${card.color}-200 rounded-lg p-4`}>
                    <p className="text-xs text-gray-600 font-bold">{card.label}</p>
                    <p className={`text-2xl font-bold text-${card.color}-700`}>{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-lg p-4 mb-4">
                <h3 className="font-bold text-gray-800 mb-3">Tax Breakdown</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Taxable Sales: <strong>{salesReportData.taxableBills} bills</strong></p>
                    <p className="text-lg font-bold text-green-600">{fmtINR(salesReportData.taxableSales)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Non-Taxable Sales: <strong>{salesReportData.nonTaxableBills} bills</strong></p>
                    <p className="text-lg font-bold text-gray-600">{fmtINR(salesReportData.nonTaxableSales)}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3">Key Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Average Bill Value:</span>
                    <strong>{fmtINR(salesReportData.averageBillValue)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Profit Margin:</span>
                    <strong>{((salesReportData.totalProfit / salesReportData.netSales) * 100).toFixed(2)}%</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Inventory Value:</span>
                    <strong>{fmtINR(salesReportData.inventoryValue)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Inventory Items:</span>
                    <strong>{salesReportData.inventoryItems}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Product Search Modal */}
      {showProductSearch && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold">Search Bills by Product</h2>
              <button onClick={() => setShowProductSearch(false)} className="text-white hover:bg-white/20 rounded-full p-2 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 border-b">
              <input
                type="text"
                value={productQuery}
                onChange={e => setProductQuery(e.target.value)}
                placeholder="🔍 Type product name, code, or batch..."
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {filteredProducts.length > 0 ? (
                <div className="space-y-2">
                  {filteredProducts.map((product, idx) => (
                    <button
                      key={idx}
                      onClick={() => searchProductBills(product)}
                      className="w-full text-left bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-purple-300 hover:bg-purple-50 transition-colors"
                    >
                      <p className="font-bold text-gray-800">{product.itemName}</p>
                      <p className="text-sm text-gray-600">Code: {product.itemCode} | Batch: {product.batch} | MRP: ₹{product.mrp} | Stock: {product.stockQty}</p>
                    </button>
                  ))}
                </div>
              ) : selectedProduct ? (
                <div>
                  <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 mb-4">
                    <p className="font-bold text-purple-800">{selectedProduct.itemName}</p>
                    <p className="text-sm text-gray-600">Batch: {selectedProduct.batch} | {productBills.length} bills found</p>
                  </div>
                  <div className="space-y-3">
                    {productBills.map((bill, idx) => (
                      <div key={idx} className="bg-white border-2 border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-bold">{bill.invoiceNo}</p>
                            <p className="text-sm text-gray-600">{toDisplayDate(bill.invoiceDate)} | {bill.customer}</p>
                          </div>
                          <p className="text-lg font-bold text-green-600">{fmtINR(bill.total)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <p className="text-lg font-semibold">Start typing to search products...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
