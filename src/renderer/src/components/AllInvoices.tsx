// src/pages/AllInvoices.tsx
// COMPLETE ALL INVOICES SYSTEM WITH INTEGRATED EXCEL VIEW, PRODUCT SEARCH & BILL PREVIEW
// ALL FEATURES IN ONE PAGE - NO LAZY CODE!

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

  // Generate Bill Preview HTML
  const generateBillPreviewHTML = (header: InvoiceHeader, items: InvoiceLine[]) => {
    const totalGross = items.reduce((s, i) => s + i.grossAmt, 0);
    const totalCgst = items.reduce((s, i) => s + i.cgstAmt, 0);
    const totalSgst = items.reduce((s, i) => s + i.sgstAmt, 0);
    const grandTotal = items.reduce((s, i) => s + i.total, 0);

    return `
      <div style="font-family:Arial; padding:30px; max-width:900px; margin:0 auto;">
        <div style="text-align:center; border-bottom:3px solid #000; padding-bottom:20px; margin-bottom:25px;">
          <h1 style="margin:0; font-size:32px; color:#000;">TAX INVOICE</h1>
          <div style="font-size:22px; font-weight:bold; margin-top:12px; color:#1a1a1a;">PENCOS MEDICALS</div>
          <div style="font-size:13px; margin-top:6px; color:#333;">MELEPANDIYIL BUILDING, CHENGANNUR</div>
          <div style="font-size:12px; margin-top:4px; color:#555;">Ph: 0479 2454670 | GSTIN: 32AABAT4432F1ZX</div>
          <div style="font-size:11px; margin-top:3px; color:#666;">State: Kerala (Code: 32)</div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:25px; margin-bottom:25px;">
          <div style="background:#f8f9fa; padding:15px; border-radius:8px;">
            <div style="font-weight:bold; font-size:12px; color:#495057; margin-bottom:8px; border-bottom:2px solid #dee2e6; padding-bottom:5px;">BILL TO</div>
            <div style="margin-top:8px;">
              <div style="font-size:14px; font-weight:bold; color:#212529;">${header.patientName || 'Cash Customer'}</div>
              ${header.contactNo ? `<div style="font-size:12px; color:#6c757d; margin-top:3px;">Ph: ${header.contactNo}</div>` : ''}
              ${header.doctorName ? `<div style="font-size:12px; color:#6c757d; margin-top:3px;">Dr. ${header.doctorName}</div>` : ''}
            </div>
          </div>
          <div style="background:#f8f9fa; padding:15px; border-radius:8px; text-align:right;">
            <div style="font-weight:bold; font-size:12px; color:#495057; margin-bottom:8px; border-bottom:2px solid #dee2e6; padding-bottom:5px;">INVOICE DETAILS</div>
            <div style="margin-top:8px;">
              <div style="font-size:13px; color:#6c757d; margin-bottom:4px;">
                <span>Invoice No:</span> <span style="font-weight:bold; color:#000; font-size:16px;">#${header.invoiceNo}</span>
              </div>
              <div style="font-size:13px; color:#6c757d; margin-bottom:4px;">
                <span>Date:</span> <span style="font-weight:600; color:#212529;">${toDisplayDate(header.invoiceDate)}</span>
              </div>
              <div style="font-size:13px; color:#6c757d; margin-bottom:4px;">
                <span>Payment:</span> <span style="font-weight:600; color:#212529;">${header.paymentMode || 'Cash'}</span>
              </div>
            </div>
          </div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:25px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
          <thead style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white;">
            <tr>
              <th style="border:1px solid #ddd; padding:12px 8px; text-align:left; font-size:11px;">ITEM</th>
              <th style="border:1px solid #ddd; padding:12px 8px; text-align:center; font-size:11px;">HSN</th>
              <th style="border:1px solid #ddd; padding:12px 8px; text-align:center; font-size:11px;">BATCH</th>
              <th style="border:1px solid #ddd; padding:12px 8px; text-align:center; font-size:11px;">QTY</th>
              <th style="border:1px solid #ddd; padding:12px 8px; text-align:right; font-size:11px;">RATE</th>
              <th style="border:1px solid #ddd; padding:12px 8px; text-align:right; font-size:11px;">TAXABLE</th>
              <th style="border:1px solid #ddd; padding:12px 8px; text-align:right; font-size:11px;">CGST</th>
              <th style="border:1px solid #ddd; padding:12px 8px; text-align:right; font-size:11px;">SGST</th>
              <th style="border:1px solid #ddd; padding:12px 8px; text-align:right; font-size:11px;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => `
              <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
                <td style="border:1px solid #dee2e6; padding:10px 8px; font-size:11px;">${item.itemName}</td>
                <td style="border:1px solid #dee2e6; padding:10px 8px; text-align:center; font-size:10px;">${item.hsnCode || '-'}</td>
                <td style="border:1px solid #dee2e6; padding:10px 8px; text-align:center; font-size:10px; font-weight:600;">${item.batch}</td>
                <td style="border:1px solid #dee2e6; padding:10px 8px; text-align:center; font-size:11px; font-weight:bold;">${item.quantity}</td>
                <td style="border:1px solid #dee2e6; padding:10px 8px; text-align:right; font-size:11px;">₹${item.rate.toFixed(2)}</td>
                <td style="border:1px solid #dee2e6; padding:10px 8px; text-align:right; font-size:11px; font-weight:600;">₹${item.grossAmt.toFixed(2)}</td>
                <td style="border:1px solid #dee2e6; padding:10px 8px; text-align:right; font-size:10px; color:#dc3545;">₹${item.cgstAmt.toFixed(2)}</td>
                <td style="border:1px solid #dee2e6; padding:10px 8px; text-align:right; font-size:10px; color:#dc3545;">₹${item.sgstAmt.toFixed(2)}</td>
                <td style="border:1px solid #dee2e6; padding:10px 8px; text-align:right; font-size:12px; font-weight:bold; color:#28a745;">₹${item.total.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#e9ecef;">
              <td colspan="5" style="border:1px solid #adb5bd; padding:12px 8px; text-align:right; font-weight:bold; font-size:12px;">SUBTOTAL</td>
              <td style="border:1px solid #adb5bd; padding:12px 8px; text-align:right; font-weight:bold; font-size:12px;">₹${totalGross.toFixed(2)}</td>
              <td style="border:1px solid #adb5bd; padding:12px 8px; text-align:right; font-weight:bold; font-size:12px; color:#dc3545;">₹${totalCgst.toFixed(2)}</td>
              <td style="border:1px solid #adb5bd; padding:12px 8px; text-align:right; font-weight:bold; font-size:12px; color:#dc3545;">₹${totalSgst.toFixed(2)}</td>
              <td style="border:1px solid #adb5bd; padding:12px 8px; text-align:right; font-weight:bold; font-size:12px; color:#28a745;">₹${grandTotal.toFixed(2)}</td>
            </tr>
            <tr style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white;">
              <td colspan="8" style="border:1px solid #6c757d; padding:14px 8px; text-align:right; font-weight:bold; font-size:14px;">GRAND TOTAL</td>
              <td style="border:1px solid #6c757d; padding:14px 8px; text-align:right; font-weight:bold; font-size:16px;">₹${Math.round(grandTotal).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="display:grid; grid-template-columns:2fr 1fr; gap:25px; margin-top:30px;">
          <div style="background:#f8f9fa; padding:15px; border-radius:8px;">
            <div style="font-weight:bold; font-size:11px; color:#495057; margin-bottom:8px;">TERMS & CONDITIONS</div>
            <ul style="margin:0; padding-left:20px; font-size:10px; color:#6c757d; line-height:1.6;">
              <li>Goods once sold will not be taken back</li>
              <li>All disputes subject to Chengannur jurisdiction</li>
            </ul>
          </div>
          <div style="text-align:right; padding-top:20px;">
            <div style="font-size:11px; font-weight:600; color:#495057; margin-bottom:40px;">FOR PENCOS MEDICALS</div>
            <div style="border-top:2px solid #6c757d; padding-top:8px; font-size:11px; font-weight:bold;">Authorised Signatory</div>
          </div>
        </div>

        <div style="text-align:center; margin-top:35px; padding-top:20px; border-top:2px solid #dee2e6;">
          <div style="font-size:10px; color:#6c757d;">Computer Generated - No Signature Required</div>
        </div>
      </div>
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

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice #${billPreviewInvoice.header.invoiceNo}</title>
        <style>@media print { @page { margin: 10mm; } body { margin: 0; } }</style>
      </head>
      <body>${billPreviewHTML}</body>
      </html>
    `);
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
          margin: [10, 10, 10, 10],
          filename: `Invoice_${billPreviewInvoice.header.invoiceNo}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .save();

      showToast('PDF downloaded');
    } catch (error) {
      showToast('PDF download failed', 'error');
    }
  };

  // Search bills by product
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
  // ============ CONTINUATION FROM PART 1 ============

  // Export Multi-Sheet Excel
  const exportMultiSheetExcel = async () => {
    setExporting(true);
    try {
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Summary
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

      // Sheet 2: Detailed Items
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

  // Open Return Modal
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

  // Update Return Quantity
  const updateReturnQty = (lineId: number, qty: number) => {
    if (!returnData) return;
    const updated = returnData.items.map(item => 
      item.lineId === lineId 
        ? { ...item, returnQty: Math.max(0, Math.min(qty, item.soldQty)) }
        : item
    );
    setReturnData({ ...returnData, items: updated });
  };

  // Process Returns
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

      await updateInvoiceAfterReturn(returnData.header.id);
      await reload();

      setReturnModal(false);
      setReturnData(null);
      showToast(`Returns processed: ${itemsToReturn.length} items`);
    } catch (error) {
      showToast('Failed to process returns', 'error');
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        exportMultiSheetExcel();
      }
      if (e.key === 'Escape') {
        setExcelViewModal(false);
        setReturnModal(false);
        setShowBillPreview(false);
        setShowProductSearch(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-6 right-6 z-[200] px-6 py-4 rounded-xl shadow-2xl ${toast.type === 'success' ? 'bg-gradient-to-r from-emerald-500 to-green-600' : 'bg-gradient-to-r from-rose-500 to-red-600'} text-white`}>
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
            <div className="bg-white/10 p-3 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold">All Invoices & Sales Reports</h1>
              <p className="text-xs text-white/70 mt-0.5">Double-click for Excel view • Product search • Bill preview</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowProductSearch(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-semibold flex items-center space-x-2"
            >
              <span>🔍</span>
              <span>Search Product</span>
            </button>
            <button
              onClick={exportMultiSheetExcel}
              disabled={exporting || loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg text-sm font-semibold"
            >
              {exporting ? '⏳' : '📊'} Excel
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 bg-white border-b shadow-sm">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">From Date</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">To Date</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Quick Select</label>
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => applyDatePreset(preset)}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 rounded-md text-[11px] font-medium"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice No</label>
            <input
              value={searchInvoice}
              onChange={e => setSearchInvoice(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Customer</label>
            <input
              value={searchCustomer}
              onChange={e => setSearchCustomer(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-slate-700 mb-1">&nbsp;</label>
            <button
              onClick={reload}
              disabled={loading}
              className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm"
            >
              {loading ? '⏳' : '🔍'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-7 gap-3">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-3 rounded-lg border">
            <div className="text-[10px] font-semibold text-slate-600">BILLS</div>
            <div className="text-xl font-bold">{analytics.total.bills}</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-green-100 p-3 rounded-lg border">
            <div className="text-[10px] font-semibold text-emerald-700">SALES</div>
            <div className="text-xl font-bold text-emerald-700">{fmtINR(analytics.total.final)}</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-yellow-100 p-3 rounded-lg border">
            <div className="text-[10px] font-semibold text-amber-700">TAX</div>
            <div className="text-xl font-bold text-amber-700">{fmtINR(analytics.total.tax)}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-3 rounded-lg border">
            <div className="text-[10px] font-semibold text-blue-700">PROFIT</div>
            <div className="text-xl font-bold text-blue-700">{fmtINR(analytics.total.profit)}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-violet-100 p-3 rounded-lg border">
            <div className="text-[10px] font-semibold text-purple-700">TAXABLE</div>
            <div className="text-sm font-bold text-purple-700">{analytics.taxable.bills}</div>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-pink-100 p-3 rounded-lg border">
            <div className="text-[10px] font-semibold text-rose-700">NON-TAX</div>
            <div className="text-sm font-bold text-rose-700">{analytics.nonTaxable.bills}</div>
          </div>
          <div className="bg-gradient-to-br from-cyan-50 to-teal-100 p-3 rounded-lg border">
            <div className="text-[10px] font-semibold text-cyan-700">QTY</div>
            <div className="text-xl font-bold text-cyan-700">{analytics.total.qty}</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse bg-white">
          <thead className="bg-gradient-to-r from-slate-100 to-slate-200 sticky top-0 z-10">
            <tr>
              <th className="border px-3 py-2.5 text-center font-bold">Invoice</th>
              <th className="border px-3 py-2.5 text-center font-bold">Date</th>
              <th className="border px-3 py-2.5 text-left font-bold">Customer</th>
              <th className="border px-3 py-2.5 text-center font-bold">Items</th>
              <th className="border px-3 py-2.5 text-center font-bold">Qty</th>
              <th className="border px-3 py-2.5 text-right font-bold">Gross</th>
              <th className="border px-3 py-2.5 text-right font-bold">Tax</th>
              <th className="border px-3 py-2.5 text-right font-bold">Final</th>
              <th className="border px-3 py-2.5 text-right font-bold">Profit</th>
              <th className="border px-3 py-2.5 text-center font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.id}
                onDoubleClick={() => handleDoubleClick(r.id)}
                className="hover:bg-indigo-50 cursor-pointer"
              >
                <td className="border px-3 py-2 text-center font-mono font-bold text-indigo-600">{r.invoiceNo}</td>
                <td className="border px-3 py-2 text-center">{toDisplayDate(r.invoiceDate)}</td>
                <td className="border px-3 py-2">{r.customer || '-'}</td>
                <td className="border px-3 py-2 text-center">{r.itemsCount}</td>
                <td className="border px-3 py-2 text-center font-semibold">{r.qtyTotal}</td>
                <td className="border px-3 py-2 text-right">{fmtINR(r.gross)}</td>
                <td className="border px-3 py-2 text-right text-amber-600">{fmtINR(r.cgst + r.sgst)}</td>
                <td className="border px-3 py-2 text-right font-bold text-purple-700">{fmtINR(r.finalAmount)}</td>
                <td className="border px-3 py-2 text-right font-bold text-emerald-700">{fmtINR(r.profit)}</td>
                <td className="border px-3 py-2 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openReturnModal(r.id);
                    }}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold"
                  >
                    ↩️ Return
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="border px-3 py-12 text-center text-slate-500" colSpan={10}>
                  <div className="text-4xl mb-3">📭</div>
                  <div className="font-semibold">No invoices found</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 bg-white border-t flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, allRows.length)} of {allRows.length}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 rounded text-sm font-semibold"
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let page: number;
              if (totalPages <= 7) page = i + 1;
              else if (currentPage <= 4) page = i + 1;
              else if (currentPage >= totalPages - 3) page = totalPages - 6 + i;
              else page = currentPage - 3 + i;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded text-sm font-semibold ${
                    page === currentPage ? 'bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-slate-200'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 rounded text-sm font-semibold"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* EXCEL VIEW MODAL - COMPLETE SPREADSHEET VIEW */}
      {excelViewModal && excelViewData && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* Excel View Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-indigo-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Invoice #{excelViewData.header.invoiceNo}</h3>
                <p className="text-xs text-white/70">{toDisplayDate(excelViewData.header.invoiceDate)} • {excelViewData.header.patientName || 'Cash'}</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={showBillPreviewModal}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-semibold"
                >
                  👁️ Preview
                </button>
                <button
                  onClick={() => {
                    showBillPreviewModal();
                    setTimeout(printBill, 500);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold"
                >
                  🖨️ Print
                </button>
                <button
                  onClick={() => setExcelViewModal(false)}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Excel Summary Cards */}
            <div className="px-6 py-4 bg-slate-50 border-b">
              <div className="grid grid-cols-5 gap-3">
                <div className="bg-white p-3 rounded-lg border">
                  <div className="text-xs font-semibold text-slate-600">ITEMS</div>
                  <div className="text-xl font-bold text-slate-900">{excelViewData.items.length}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border">
                  <div className="text-xs font-semibold text-purple-600">QTY</div>
                  <div className="text-xl font-bold text-purple-700">{excelViewData.items.reduce((s, i) => s + i.quantity, 0)}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border">
                  <div className="text-xs font-semibold text-emerald-600">TAXABLE</div>
                  <div className="text-xl font-bold text-emerald-700">{fmtINR(excelViewData.items.reduce((s, i) => s + i.grossAmt, 0))}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border">
                  <div className="text-xs font-semibold text-amber-600">TAX</div>
                  <div className="text-xl font-bold text-amber-700">{fmtINR(excelViewData.items.reduce((s, i) => s + i.cgstAmt + i.sgstAmt, 0))}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border">
                  <div className="text-xs font-semibold text-indigo-600">TOTAL</div>
                  <div className="text-xl font-bold text-indigo-700">{fmtINR(excelViewData.items.reduce((s, i) => s + i.total, 0))}</div>
                </div>
              </div>
            </div>

            {/* Excel-like Table */}
            <div className="flex-1 overflow-auto p-6 bg-slate-50">
              <div className="bg-white rounded-xl shadow-xl overflow-hidden">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-gradient-to-r from-slate-700 to-slate-800 text-white sticky top-0">
                    <tr>
                      <th className="border border-slate-600 px-3 py-3 text-left font-bold">#</th>
                      <th className="border border-slate-600 px-3 py-3 text-left font-bold">CODE</th>
                      <th className="border border-slate-600 px-3 py-3 text-left font-bold">ITEM NAME</th>
                      <th className="border border-slate-600 px-3 py-3 text-center font-bold">HSN</th>
                      <th className="border border-slate-600 px-3 py-3 text-center font-bold">BATCH</th>
                      <th className="border border-slate-600 px-3 py-3 text-center font-bold">EXPIRY</th>
                      <th className="border border-slate-600 px-3 py-3 text-center font-bold">QTY</th>
                      <th className="border border-slate-600 px-3 py-3 text-right font-bold">MRP</th>
                      <th className="border border-slate-600 px-3 py-3 text-right font-bold">RATE</th>
                      <th className="border border-slate-600 px-3 py-3 text-right font-bold">TAXABLE</th>
                      <th className="border border-slate-600 px-3 py-3 text-center font-bold">CGST%</th>
                      <th className="border border-slate-600 px-3 py-3 text-right font-bold">CGST</th>
                      <th className="border border-slate-600 px-3 py-3 text-center font-bold">SGST%</th>
                      <th className="border border-slate-600 px-3 py-3 text-right font-bold">SGST</th>
                      <th className="border border-slate-600 px-3 py-3 text-right font-bold">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excelViewData.items.map((item, idx) => (
                      <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-indigo-50`}>
                        <td className="border border-slate-200 px-3 py-2 text-center font-bold text-slate-700">{idx + 1}</td>
                        <td className="border border-slate-200 px-3 py-2 font-mono text-indigo-600 font-semibold">{item.itemCode}</td>
                        <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-800">{item.itemName}</td>
                        <td className="border border-slate-200 px-3 py-2 text-center text-slate-600">{item.hsnCode || '-'}</td>
                        <td className="border border-slate-200 px-3 py-2 text-center font-mono font-semibold text-purple-700">{item.batch}</td>
                        <td className="border border-slate-200 px-3 py-2 text-center text-slate-600">{item.expiryDate || '-'}</td>
                        <td className="border border-slate-200 px-3 py-2 text-center font-bold text-slate-900">{item.quantity}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right text-slate-700">₹{item.mrp.toFixed(2)}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-semibold text-slate-900">₹{item.rate.toFixed(2)}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-bold text-emerald-700">₹{item.grossAmt.toFixed(2)}</td>
                        <td className="border border-slate-200 px-3 py-2 text-center text-slate-600">{item.cgstPercent}%</td>
                        <td className="border border-slate-200 px-3 py-2 text-right text-amber-700">₹{item.cgstAmt.toFixed(2)}</td>
                        <td className="border border-slate-200 px-3 py-2 text-center text-slate-600">{item.sgstPercent}%</td>
                        <td className="border border-slate-200 px-3 py-2 text-right text-amber-700">₹{item.sgstAmt.toFixed(2)}</td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-bold text-indigo-700 text-sm">₹{item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gradient-to-r from-slate-100 to-slate-200 sticky bottom-0">
                    <tr className="font-bold">
                      <td className="border border-slate-400 px-3 py-3 text-right text-slate-900" colSpan={9}>TOTALS</td>
                      <td className="border border-slate-400 px-3 py-3 text-right text-emerald-700">{fmtINR(excelViewData.items.reduce((s, i) => s + i.grossAmt, 0))}</td>
                      <td className="border border-slate-400 px-3 py-3"></td>
                      <td className="border border-slate-400 px-3 py-3 text-right text-amber-700">{fmtINR(excelViewData.items.reduce((s, i) => s + i.cgstAmt, 0))}</td>
                      <td className="border border-slate-400 px-3 py-3"></td>
                      <td className="border border-slate-400 px-3 py-3 text-right text-amber-700">{fmtINR(excelViewData.items.reduce((s, i) => s + i.sgstAmt, 0))}</td>
                      <td className="border border-slate-400 px-3 py-3 text-right text-indigo-700 text-base">{fmtINR(excelViewData.items.reduce((s, i) => s + i.total, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BILL PREVIEW MODAL */}
      {showBillPreview && billPreviewHTML && (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-indigo-900 text-white flex items-center justify-between">
              <h3 className="text-lg font-bold">Bill Preview</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={printBill}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-semibold"
                >
                  🖨️ Print
                </button>
                <button
                  onClick={downloadInvoicePDF}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-semibold"
                >
                  📄 PDF
                </button>
                <button
                  onClick={() => setShowBillPreview(false)}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold"
                >
                  ✕ Close
                </button>
              </div>
            </div>
            <div className="p-6 max-h-[75vh] overflow-auto bg-slate-50">
              <div dangerouslySetInnerHTML={{ __html: billPreviewHTML }} />
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT SEARCH MODAL */}
      {showProductSearch && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-7xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-purple-800 to-purple-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Product Search & Bills History</h3>
                <p className="text-xs text-white/70 mt-0.5">Search products and view all bills</p>
              </div>
              <button
                onClick={() => setShowProductSearch(false)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-6">
              {/* Search Bar & Date Filter */}
              <div className="flex items-end space-x-3 mb-6">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Search Product</label>
                  <input
                    value={productQuery}
                    onChange={e => setProductQuery(e.target.value)}
                    placeholder="Search by Item Code, Name, or Batch..."
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">From</label>
                  <input
                    type="date"
                    value={productSearchFrom}
                    onChange={e => setProductSearchFrom(e.target.value)}
                    className="px-3 py-3 border-2 border-slate-300 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">To</label>
                  <input
                    type="date"
                    value={productSearchTo}
                    onChange={e => setProductSearchTo(e.target.value)}
                    className="px-3 py-3 border-2 border-slate-300 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Products List */}
                <div className="border-2 border-purple-200 rounded-xl bg-purple-50 overflow-hidden">
                  <div className="px-4 py-3 bg-purple-100 border-b-2 border-purple-200 font-semibold text-sm text-purple-900">
                    📦 Products ({filteredProducts.length})
                  </div>
                  <div className="max-h-[500px] overflow-auto bg-white">
                    {filteredProducts.map((product, idx) => (
                      <div
                        key={idx}
                        onClick={() => searchProductBills(product)}
                        className={`p-4 border-b border-slate-100 cursor-pointer transition-colors ${
                          selectedProduct?.itemCode === product.itemCode && selectedProduct?.batch === product.batch
                            ? 'bg-purple-100 border-l-4 border-purple-600'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-bold text-slate-900">{product.itemName}</div>
                            <div className="text-xs text-slate-600 mt-1">Code: {product.itemCode}</div>
                            <div className="flex items-center space-x-3 mt-2 text-xs">
                              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded font-mono font-semibold">{product.batch}</span>
                              <span className="text-slate-500">Exp: {product.expiryDate}</span>
                              <span className="text-emerald-600 font-semibold">MRP: ₹{product.mrp.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Stock</div>
                            <div className="text-lg font-bold text-indigo-700">{product.stockQty}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredProducts.length === 0 && productQuery && (
                      <div className="p-12 text-center text-slate-500">
                        <div className="text-4xl mb-3">🔍</div>
                        <div className="text-sm font-semibold">No products found</div>
                      </div>
                    )}
                    {!productQuery && (
                      <div className="p-12 text-center text-slate-400">
                        <div className="text-4xl mb-3">📦</div>
                        <div className="text-sm">Start typing to search</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bills History */}
                <div className="border-2 border-indigo-200 rounded-xl bg-indigo-50 overflow-hidden">
                  <div className="px-4 py-3 bg-indigo-100 border-b-2 border-indigo-200 font-semibold text-sm text-indigo-900">
                    📋 Bills ({productBills.length})
                  </div>
                  <div className="max-h-[500px] overflow-auto bg-white">
                    {productBills.map((bill, idx) => (
                      <div key={idx} className="p-4 border-b border-slate-100 hover:bg-slate-50">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-sm font-bold text-indigo-700">Invoice #{bill.invoiceNo}</span>
                            <span className="text-xs text-slate-600 ml-3">{toDisplayDate(bill.invoiceDate)}</span>
                          </div>
                          <div className="text-sm font-bold text-emerald-700">{fmtINR(bill.total)}</div>
                        </div>
                        <div className="text-xs text-slate-600 mb-2">Customer: {bill.customer}</div>
                        <div className="space-y-1">
                          {bill.items.map((item: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs bg-slate-50 px-2 py-1 rounded">
                              <span className="text-slate-700">Qty: <span className="font-bold">{item.quantity}</span> × ₹{item.rate.toFixed(2)}</span>
                              <span className="font-semibold text-slate-900">= ₹{item.total.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {productBills.length === 0 && selectedProduct && (
                      <div className="p-12 text-center text-slate-500">
                        <div className="text-4xl mb-3">📭</div>
                        <div className="text-sm font-semibold">No bills found</div>
                      </div>
                    )}
                    {!selectedProduct && (
                      <div className="p-12 text-center text-slate-400">
                        <div className="text-4xl mb-3">📋</div>
                        <div className="text-sm">Select a product</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RETURN MODAL */}
      {returnModal && returnData && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-rose-800 to-red-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Process Returns - Invoice #{returnData.header.invoiceNo}</h3>
                <p className="text-xs text-white/70">Select items and quantities to return</p>
              </div>
              <button
                onClick={() => setReturnModal(false)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-rose-100">
                  <tr>
                    <th className="border px-2 py-2">Item</th>
                    <th className="border px-2 py-2">Batch</th>
                    <th className="border px-2 py-2">Sold Qty</th>
                    <th className="border px-2 py-2">Return Qty</th>
                    <th className="border px-2 py-2">Rate</th>
                    <th className="border px-2 py-2">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {returnData.items.map(item => (
                    <tr key={item.lineId} className="hover:bg-rose-50">
                      <td className="border px-2 py-2">{item.itemName}</td>
                      <td className="border px-2 py-2 text-center">{item.batch}</td>
                      <td className="border px-2 py-2 text-center font-bold">{item.soldQty}</td>
                      <td className="border px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          max={item.soldQty}
                          value={item.returnQty}
                          onChange={e => updateReturnQty(item.lineId, Number(e.target.value))}
                          className="w-full px-2 py-1 border rounded text-center font-bold"
                        />
                      </td>
                      <td className="border px-2 py-2 text-right">{fmtINR(item.rate)}</td>
                      <td className="border px-2 py-2 text-right font-bold text-rose-700">{fmtINR(item.returnQty * item.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex items-center justify-between">
              <div className="text-sm">
                <span className="font-semibold">Total Refund:</span>
                <span className="ml-2 text-lg font-bold text-rose-700">
                  {fmtINR(returnData.items.reduce((s, i) => s + (i.returnQty * i.rate), 0))}
                </span>
              </div>
              <button
                onClick={processReturns}
                className="px-6 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-lg font-bold"
              >
                ✅ Process Returns
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

