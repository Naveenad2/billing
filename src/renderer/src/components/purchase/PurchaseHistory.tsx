// src/components/purchase/PurchaseHistory.tsx
// 🔥 COMPLETE PURCHASE HISTORY WITH RETURNS, SEARCH, AND PDF REPORTS

import { useState, useEffect } from 'react';

/********************** TYPES **********************/
interface PurchaseItem {
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
  returnedQty?: number;
}

interface PurchaseInvoice {
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
  returns?: PurchaseReturn[];
}

interface PurchaseReturn {
  id: string;
  returnNo: string;
  originalInvoiceNo: string;
  returnDate: string;
  reason: string;
  items: ReturnItem[];
  totalReturnAmount: number;
  refundMethod: string;
  status: string;
  createdAt: string;
}

interface ReturnItem {
  productName: string;
  batch: string;
  qty: number;
  rate: number;
  amount: number;
}

declare global {
  interface Window {
    purchase?: {
      getAll: () => Promise<PurchaseInvoice[]>;
      getById: (id: string) => Promise<PurchaseInvoice | null>;
      search: (query: string) => Promise<PurchaseInvoice[]>;
      delete: (id: string) => Promise<{ success: boolean }>;
    };
    returns?: {
      getAll: () => Promise<PurchaseReturn[]>;
      create: (record: any) => Promise<{ success: boolean; id: string }>;
      getByInvoice: (invoiceNo: string) => Promise<PurchaseReturn[]>;
    };
    inventory?: {
      decrementStock: (code: string, batch: string, qty: number) => Promise<any>;
      getByCodeBatch: (code: string, batch: string) => Promise<any>;
    };
  }
}

/********************** MAIN COMPONENT **********************/
export default function PurchaseHistory({ onClose }: { onClose: () => void }) {
  // ========== STATE ==========
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<PurchaseInvoice[]>([]);
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [loading, setLoading] = useState(true);

  // ========== MODALS ==========
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);

  // ========== TOAST ==========
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success',
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  /********************** LOAD DATA **********************/
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      if (window.purchase?.getAll) {
        const data = await window.purchase.getAll();
        setInvoices(data);
        setFilteredInvoices(data);
      }
      
      if (window.returns?.getAll) {
        const returnData = await window.returns.getAll();
        setReturns(returnData);
      }
    } catch (error) {
      console.error('Failed to load ', error);
      showToast('Failed to load purchase data', 'error');
    } finally {
      setLoading(false);
    }
  };

  /********************** SEARCH & FILTER **********************/
  useEffect(() => {
    applyFilters();
  }, [searchQuery, dateFrom, dateTo, selectedSupplier, invoices]);

  const applyFilters = () => {
    let filtered = [...invoices];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(inv =>
        inv.invoiceNo.toLowerCase().includes(q) ||
        inv.party.name.toLowerCase().includes(q) ||
        inv.items.some(item => 
          item.productName.toLowerCase().includes(q) ||
          item.batch.toLowerCase().includes(q)
        )
      );
    }

    if (dateFrom) {
      filtered = filtered.filter(inv => inv.header.invoiceDate >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(inv => inv.header.invoiceDate <= dateTo);
    }

    if (selectedSupplier) {
      filtered = filtered.filter(inv => inv.party.name === selectedSupplier);
    }

    setFilteredInvoices(filtered);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setSelectedSupplier('');
  };

  /********************** GET UNIQUE SUPPLIERS **********************/
  const suppliers = Array.from(new Set(invoices.map(inv => inv.party.name))).sort();

  /********************** VIEW INVOICE **********************/
  const viewInvoice = (invoice: PurchaseInvoice) => {
    setSelectedInvoice(invoice);
    const html = generateInvoicePDF(invoice);
    setPreviewHTML(html);
    setShowInvoicePreview(true);
  };

  /********************** OPEN RETURN MODAL **********************/
  const openReturnModal = (invoice: PurchaseInvoice) => {
    setSelectedInvoice(invoice);
    setShowReturnModal(true);
  };

  /********************** DELETE INVOICE **********************/
  const deleteInvoice = async (id: number | undefined, invoiceNo: string) => {
    if (!id) return;
    if (!confirm(`Delete purchase invoice ${invoiceNo}? This cannot be undone.`)) return;

    try {
      if (window.purchase?.delete) {
        await window.purchase.delete(String(id));
        showToast('Invoice deleted successfully', 'success');
        await loadData();
      }
    } catch (error) {
      console.error('Failed to delete invoice:', error);
      showToast('Failed to delete invoice', 'error');
    }
  };

  /********************** CONTINUE TO PART 2 **********************/
  /********************** GENERATE INVOICE PDF **********************/
  const generateInvoicePDF = (invoice: PurchaseInvoice) => {
    const invoiceReturns = returns.filter(r => r.originalInvoiceNo === invoice.invoiceNo);
    
    const returnedQtyMap = new Map<string, number>();
    invoiceReturns.forEach(ret => {
      ret.items.forEach(item => {
        const key = `${item.productName}_${item.batch}`;
        returnedQtyMap.set(key, (returnedQtyMap.get(key) || 0) + item.qty);
      });
    });

    const activeItems = invoice.items.map(item => {
      const key = `${item.productName}_${item.batch}`;
      const returned = returnedQtyMap.get(key) || 0;
      const remainingQty = item.qty - returned;
      return { ...item, returnedQty: returned, remainingQty };
    }).filter(item => item.remainingQty > 0);

    const recalculatedTotals = activeItems.reduce((acc, item) => {
      const grossAmount = item.remainingQty * item.rate;
      const discountAmount = (grossAmount * item.dis) / 100;
      const taxableAmount = grossAmount - discountAmount;
      const cgstAmt = (taxableAmount * item.cgst) / 100;
      const sgstAmt = (taxableAmount * item.sgst) / 100;
      const amount = taxableAmount + cgstAmt + sgstAmt;

      return {
        totalQty: acc.totalQty + item.remainingQty,
        totalFree: acc.totalFree + item.free,
        taxable: acc.taxable + taxableAmount,
        cgst: acc.cgst + cgstAmt,
        sgst: acc.sgst + sgstAmt,
        totalGST: acc.totalGST + cgstAmt + sgstAmt,
        grandTotal: acc.grandTotal + amount,
      };
    }, { totalQty: 0, totalFree: 0, taxable: 0, cgst: 0, sgst: 0, totalGST: 0, grandTotal: 0 });

    const totalRefunded = invoiceReturns.reduce((sum, ret) => sum + ret.totalReturnAmount, 0);

    const ITEMS_PER_PAGE = 15;
    const pages: typeof activeItems[] = [];
    for (let i = 0; i < activeItems.length; i += ITEMS_PER_PAGE) {
      pages.push(activeItems.slice(i, i + ITEMS_PER_PAGE));
    }

    if (activeItems.length === 0) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>Purchase Invoice ${invoice.invoiceNo} - FULLY REFUNDED</title>
            <style>
              @page { size: A4; margin: 15mm; }
              body { font-family: Arial, sans-serif; font-size: 14px; }
              .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
              .header h1 { font-size: 20px; margin-bottom: 5px; }
              .fully-refunded { text-align: center; padding: 50px; border: 3px solid #000; margin: 50px 0; }
              .fully-refunded h2 { font-size: 24px; margin-bottom: 20px; }
              .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 0; }
              .info-item { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dotted #ccc; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>PURCHASE INVOICE - FULLY REFUNDED</h1>
              <p><strong>Invoice No:</strong> ${invoice.invoiceNo}</p>
              <p><strong>Date:</strong> ${new Date(invoice.header.invoiceDate).toLocaleDateString('en-IN')}</p>
            </div>
            <div class="fully-refunded">
              <h2>⚠️ ALL ITEMS RETURNED</h2>
              <p style="font-size: 16px;">This invoice has been fully refunded.</p>
              <p style="font-size: 18px; margin-top: 20px;"><strong>Total Refunded: ₹${totalRefunded.toFixed(2)}</strong></p>
            </div>
            <div class="info-grid">
              <div class="info-item"><span><strong>Supplier:</strong></span><span>${invoice.party.name}</span></div>
              <div class="info-item"><span><strong>Original Amount:</strong></span><span>₹${invoice.totals.total.toFixed(2)}</span></div>
              <div class="info-item"><span><strong>Refunded Amount:</strong></span><span>₹${totalRefunded.toFixed(2)}</span></div>
              <div class="info-item"><span><strong>Returns Count:</strong></span><span>${invoiceReturns.length}</span></div>
            </div>
          </body>
        </html>
      `;
    }

    const renderPage = (pageItems: typeof activeItems, pageNum: number, isLastPage: boolean) => `
      <div class="page">
        <div class="header">
          <h1>PURCHASE INVOICE</h1>
          <div class="header-grid">
            <div><strong>Invoice No:</strong> ${invoice.invoiceNo}</div>
            <div><strong>Date:</strong> ${new Date(invoice.header.invoiceDate).toLocaleDateString('en-IN')}</div>
            <div><strong>Due Date:</strong> ${invoice.header.dueDate ? new Date(invoice.header.dueDate).toLocaleDateString('en-IN') : '-'}</div>
            <div><strong>LR No:</strong> ${invoice.header.lrNo || '-'}</div>
          </div>
        </div>
        <div class="supplier-box">
          <strong>SUPPLIER:</strong> ${invoice.party.name}<br/>
          ${invoice.party.address}<br/>
          <strong>GSTIN:</strong> ${invoice.party.gstin} | <strong>Phone:</strong> ${invoice.party.phone}
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:20px;">#</th>
              <th style="width:200px;">Product Name</th>
              <th style="width:70px;">Batch</th>
              <th style="width:50px;">Exp</th>
              <th style="width:60px;">HSN</th>
              <th style="width:40px;">Qty</th>
              ${pageItems.some(i => i.returnedQty && i.returnedQty > 0) ? '<th style="width:40px;">Ret</th>' : ''}
              <th style="width:35px;">Free</th>
              <th style="width:60px;">Rate</th>
              <th style="width:60px;">MRP</th>
              <th style="width:40px;">Dis%</th>
              <th style="width:70px;">Taxable</th>
              <th style="width:50px;">GST</th>
              <th style="width:80px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${pageItems.map((item, idx) => {
              const taxable = (item.remainingQty * item.rate) * (1 - item.dis / 100);
              const gstAmt = (taxable * (item.cgst + item.sgst)) / 100;
              const amount = taxable + gstAmt;
              return `
              <tr>
                <td class="center">${idx + 1}</td>
                <td>${item.productName}</td>
                <td class="center">${item.batch}</td>
                <td class="center">${item.exp}</td>
                <td class="center">${item.hsn}</td>
                <td class="center">${item.remainingQty}</td>
                ${item.returnedQty && item.returnedQty > 0 ? `<td class="center" style="color:#666;">(${item.returnedQty})</td>` : ''}
                <td class="center">${item.free}</td>
                <td class="right">${item.rate.toFixed(2)}</td>
                <td class="right">${item.mrp.toFixed(2)}</td>
                <td class="center">${item.dis}%</td>
                <td class="right">${taxable.toFixed(2)}</td>
                <td class="right">${gstAmt.toFixed(2)}</td>
                <td class="right"><strong>${amount.toFixed(2)}</strong></td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${isLastPage ? `
        <div class="totals-box">
          <div class="totals-row"><span>Total Quantity:</span><strong>${recalculatedTotals.totalQty}</strong></div>
          <div class="totals-row"><span>Total Free:</span><strong>${recalculatedTotals.totalFree}</strong></div>
          <div class="totals-row"><span>Taxable Amount:</span><strong>₹${recalculatedTotals.taxable.toFixed(2)}</strong></div>
          <div class="totals-row"><span>CGST:</span><strong>₹${recalculatedTotals.cgst.toFixed(2)}</strong></div>
          <div class="totals-row"><span>SGST:</span><strong>₹${recalculatedTotals.sgst.toFixed(2)}</strong></div>
          <div class="totals-row"><span>Total GST:</span><strong>₹${recalculatedTotals.totalGST.toFixed(2)}</strong></div>
          ${totalRefunded > 0 ? `
          <div class="totals-row" style="border-top:2px solid #000;margin-top:5px;padding-top:5px;">
            <span>Refunded Amount:</span><strong style="color:#666;">- ₹${totalRefunded.toFixed(2)}</strong>
          </div>
          ` : ''}
          <div class="totals-row grand">
            <span>NET PAYABLE:</span><strong>₹${(recalculatedTotals.grandTotal).toFixed(2)}</strong>
          </div>
        </div>
        ${invoiceReturns.length > 0 ? `
        <div class="returns-summary">
          <strong>Returns (${invoiceReturns.length}):</strong>
          ${invoiceReturns.map(ret => `
            <div style="margin:3px 0;">${ret.returnNo} - ${new Date(ret.returnDate).toLocaleDateString('en-IN')} - ₹${ret.totalReturnAmount.toFixed(2)}</div>
          `).join('')}
        </div>
        ` : ''}
        ` : ''}
        <div class="page-number">Page ${pageNum} of ${pages.length}</div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Purchase Invoice ${invoice.invoiceNo}</title>
          <style>
            @page { size: A4; margin: 10mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
            .page { page-break-after: always; position: relative; padding: 8mm; height: 277mm; }
            .page:last-child { page-break-after: auto; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
            .header h1 { font-size: 18px; margin-bottom: 6px; }
            .header-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 5px; text-align: left; font-size: 9px; }
            .supplier-box { border: 1px solid #000; padding: 6px; margin-bottom: 8px; font-size: 9px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #000; padding: 3px 2px; font-size: 9px; }
            th { background: #f0f0f0; font-weight: bold; text-align: center; }
            td.center { text-align: center; }
            td.right { text-align: right; }
            .totals-box { border: 2px solid #000; padding: 8px; margin-top: 10px; }
            .totals-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #ccc; }
            .totals-row.grand { border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 12px; padding: 5px 0; margin-top: 5px; }
            .returns-summary { border: 1px solid #ccc; padding: 6px; margin-top: 10px; font-size: 9px; background: #f9f9f9; }
            .page-number { position: absolute; bottom: 5mm; right: 8mm; font-size: 8px; color: #666; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${pages.map((pageItems, i) => renderPage(pageItems, i + 1, i === pages.length - 1)).join('')}
        </body>
      </html>
    `;
  };

  /********************** PRINT HANDLER **********************/
  const handlePrint = () => {
    const iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
    iframe?.contentWindow?.print();
  };

  /********************** CONTINUE TO PART 3 FOR RETURN MODAL & REPORT **********************/
  /********************** RETURN MODAL COMPONENT **********************/
  const ReturnModal = () => {
    if (!showReturnModal || !selectedInvoice) return null;

    const [returnItems, setReturnItems] = useState<Map<string, { qty: number; maxQty: number; item: PurchaseItem }>>(new Map());
    const [returnReason, setReturnReason] = useState('Damaged');
    const [refundMethod, setRefundMethod] = useState('Cash');
    const [submitting, setSubmitting] = useState(false);

    const invoiceReturns = returns.filter(r => r.originalInvoiceNo === selectedInvoice.invoiceNo);
    const returnedQtyMap = new Map<string, number>();
    invoiceReturns.forEach(ret => {
      ret.items.forEach(item => {
        const key = `${item.productName}_${item.batch}`;
        returnedQtyMap.set(key, (returnedQtyMap.get(key) || 0) + item.qty);
      });
    });

    const toggleItem = (item: PurchaseItem) => {
      const key = `${item.productName}_${item.batch}`;
      const alreadyReturned = returnedQtyMap.get(key) || 0;
      const maxQty = item.qty - alreadyReturned;

      if (maxQty <= 0) return;

      const newMap = new Map(returnItems);
      if (newMap.has(key)) {
        newMap.delete(key);
      } else {
        newMap.set(key, { qty: maxQty, maxQty, item });
      }
      setReturnItems(newMap);
    };

    const updateQty = (key: string, qty: number) => {
      const item = returnItems.get(key);
      if (!item) return;
      const newMap = new Map(returnItems);
      newMap.set(key, { ...item, qty: Math.min(Math.max(1, qty), item.maxQty) });
      setReturnItems(newMap);
    };

    const submitReturn = async () => {
      if (returnItems.size === 0) {
        showToast('Select at least one item to return', 'error');
        return;
      }

      setSubmitting(true);
      try {
        let totalReturnAmount = 0;
        const returnItemsArray: ReturnItem[] = [];

        returnItems.forEach(({ qty, item }) => {
          const grossAmount = qty * item.rate;
          const discountAmount = (grossAmount * item.dis) / 100;
          const taxableAmount = grossAmount - discountAmount;
          const cgstAmt = (taxableAmount * item.cgst) / 100;
          const sgstAmt = (taxableAmount * item.sgst) / 100;
          const amount = taxableAmount + cgstAmt + sgstAmt;

          totalReturnAmount += amount;
          returnItemsArray.push({
            productName: item.productName,
            batch: item.batch,
            qty,
            rate: item.rate,
            amount,
          });
        });

        const returnNo = `RET-${selectedInvoice.invoiceNo}-${Date.now()}`;

        const returnRecord: Omit<PurchaseReturn, 'id'> = {
          returnNo,
          originalInvoiceNo: selectedInvoice.invoiceNo,
          returnDate: new Date().toISOString().split('T')[0],
          reason: returnReason,
          items: returnItemsArray,
          totalReturnAmount,
          refundMethod,
          status: 'Completed',
          createdAt: new Date().toISOString(),
        };

        if (window.returns?.create) {
          await window.returns.create(returnRecord);
          showToast('Return processed successfully', 'success');
        }

        if (window.inventory?.decrementStock) {
          for (const [, { qty, item }] of returnItems) {
            await window.inventory.decrementStock(item.productName, item.batch, qty);
          }
        }

        await loadData();
        setShowReturnModal(false);
        setSelectedInvoice(null);
      } catch (error) {
        console.error('Failed to process return:', error);
        showToast('Failed to process return', 'error');
      } finally {
        setSubmitting(false);
      }
    };

    const totalReturnValue = Array.from(returnItems.values()).reduce((sum, { qty, item }) => {
      const grossAmount = qty * item.rate;
      const discountAmount = (grossAmount * item.dis) / 100;
      const taxableAmount = grossAmount - discountAmount;
      const cgstAmt = (taxableAmount * item.cgst) / 100;
      const sgstAmt = (taxableAmount * item.sgst) / 100;
      return sum + taxableAmount + cgstAmt + sgstAmt;
    }, 0);

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-red-600 to-orange-600 text-white px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Process Return</h2>
              <p className="text-sm opacity-90">Invoice: {selectedInvoice.invoiceNo}</p>
            </div>
            <button onClick={() => setShowReturnModal(false)} className="text-white hover:bg-white/20 rounded-full p-2 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Return Reason *</label>
                <select value={returnReason} onChange={e => setReturnReason(e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none">
                  <option>Damaged</option>
                  <option>Expired</option>
                  <option>Wrong Item</option>
                  <option>Quality Issue</option>
                  <option>Excess Stock</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Refund Method *</label>
                <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none">
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Credit Note</option>
                  <option>Adjustment</option>
                </select>
              </div>
            </div>

            <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-4 py-2 border-b-2 border-gray-200">
                <h3 className="font-bold text-gray-700">Select Items to Return</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {selectedInvoice.items.map(item => {
                  const key = `${item.productName}_${item.batch}`;
                  const alreadyReturned = returnedQtyMap.get(key) || 0;
                  const maxQty = item.qty - alreadyReturned;
                  const isSelected = returnItems.has(key);
                  const returnData = returnItems.get(key);

                  if (maxQty <= 0) {
                    return (
                      <div key={key} className="px-4 py-3 border-b bg-gray-50 text-gray-400">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-semibold">{item.productName}</p>
                            <p className="text-xs">Batch: {item.batch} | Fully Returned</p>
                          </div>
                          <span className="text-xs font-bold">RETURNED</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={key} className={`px-4 py-3 border-b hover:bg-blue-50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 border-l-4 border-l-blue-500' : ''}`} onClick={() => toggleItem(item)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center flex-1">
                          <input type="checkbox" checked={isSelected} onChange={() => {}} className="mr-3 w-5 h-5" />
                          <div className="flex-1">
                            <p className="font-semibold">{item.productName}</p>
                            <p className="text-xs text-gray-600">Batch: {item.batch} | HSN: {item.hsn} | Rate: ₹{item.rate}</p>
                            <p className="text-xs text-gray-500">Available: {maxQty} {alreadyReturned > 0 && `(${alreadyReturned} already returned)`}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="flex items-center space-x-2" onClick={e => e.stopPropagation()}>
                            <label className="text-xs font-bold text-gray-600">Qty:</label>
                            <input type="number" min="1" max={maxQty} value={returnData?.qty || 1} onChange={e => updateQty(key, Number(e.target.value))} className="w-16 px-2 py-1 border-2 border-blue-500 rounded text-center font-bold" />
                            <span className="text-xs text-gray-600">/ {maxQty}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {returnItems.size > 0 && (
              <div className="mt-6 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-lg p-4">
                <h3 className="font-bold text-red-800 mb-3">Return Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Items Selected:</span>
                    <span className="font-bold">{returnItems.size}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Total Quantity:</span>
                    <span className="font-bold">{Array.from(returnItems.values()).reduce((sum, { qty }) => sum + qty, 0)}</span>
                  </div>
                  <div className="flex justify-between text-lg pt-2 border-t-2 border-red-200">
                    <span className="font-bold text-red-800">Refund Amount:</span>
                    <span className="font-bold text-red-800">₹{totalReturnValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t-2 border-gray-200">
            <button onClick={() => setShowReturnModal(false)} className="px-6 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-100 font-bold transition-colors">Cancel</button>
            <button onClick={submitReturn} disabled={returnItems.size === 0 || submitting} className="px-6 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {submitting ? 'Processing...' : `Process Return (₹${totalReturnValue.toFixed(2)})`}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /********************** GENERATE PURCHASE REPORT **********************/
  const generatePurchaseReport = () => {
    const reportData = filteredInvoices;
    
    if (reportData.length === 0) {
      showToast('No data to generate report', 'error');
      return;
    }

    const totalInvoices = reportData.length;
    const totalAmount = reportData.reduce((sum, inv) => sum + inv.totals.total, 0);
    const totalQty = reportData.reduce((sum, inv) => sum + inv.totals.totalQty, 0);
    const totalGST = reportData.reduce((sum, inv) => sum + inv.totals.totalGST, 0);
    const totalReturns = returns.filter(ret => reportData.some(inv => inv.invoiceNo === ret.originalInvoiceNo)).length;
    const totalReturnAmount = returns.filter(ret => reportData.some(inv => inv.invoiceNo === ret.originalInvoiceNo)).reduce((sum, ret) => sum + ret.totalReturnAmount, 0);

    const supplierMap = new Map<string, { invoices: number; amount: number; qty: number }>();
    reportData.forEach(inv => {
      const existing = supplierMap.get(inv.party.name) || { invoices: 0, amount: 0, qty: 0 };
      existing.invoices += 1;
      existing.amount += inv.totals.total;
      existing.qty += inv.totals.totalQty;
      supplierMap.set(inv.party.name, existing);
    });
    const topSuppliers = Array.from(supplierMap.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 10);

    const ITEMS_PER_PAGE = 20;
    const pages: typeof reportData[] = [];
    for (let i = 0; i < reportData.length; i += ITEMS_PER_PAGE) {
      pages.push(reportData.slice(i, i + ITEMS_PER_PAGE));
    }

    const renderPage = (pageInvoices: typeof reportData, pageNum: number, isLastPage: boolean) => `
      <div class="page">
        ${pageNum === 1 ? `
        <div class="report-header">
          <h1>PURCHASE REPORT</h1>
          <div class="report-meta">
            <div><strong>Generated:</strong> ${new Date().toLocaleString('en-IN')}</div>
            <div><strong>Period:</strong> ${dateFrom || 'All Time'} to ${dateTo || 'Present'}</div>
            ${searchQuery ? `<div><strong>Search:</strong> ${searchQuery}</div>` : ''}
            ${selectedSupplier ? `<div><strong>Supplier:</strong> ${selectedSupplier}</div>` : ''}
          </div>
        </div>
        <div class="analytics-grid">
          <div class="analytics-card">
            <div class="analytics-label">Total Invoices</div>
            <div class="analytics-value">${totalInvoices}</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-label">Total Purchase Value</div>
            <div class="analytics-value">₹${totalAmount.toFixed(2)}</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-label">Total Quantity</div>
            <div class="analytics-value">${totalQty}</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-label">Total GST</div>
            <div class="analytics-value">₹${totalGST.toFixed(2)}</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-label">Total Returns</div>
            <div class="analytics-value">${totalReturns}</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-label">Return Amount</div>
            <div class="analytics-value">₹${totalReturnAmount.toFixed(2)}</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-label">Net Purchase</div>
            <div class="analytics-value">₹${(totalAmount - totalReturnAmount).toFixed(2)}</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-label">Avg Invoice Value</div>
            <div class="analytics-value">₹${(totalAmount / totalInvoices).toFixed(2)}</div>
          </div>
        </div>
        <div class="section-title">Top Suppliers by Purchase Value</div>
        <table class="compact-table">
          <thead>
            <tr>
              <th style="width:30px;">#</th>
              <th>Supplier Name</th>
              <th style="width:80px;">Invoices</th>
              <th style="width:80px;">Quantity</th>
              <th style="width:100px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${topSuppliers.map(([name, data], idx) => `
            <tr>
              <td class="center">${idx + 1}</td>
              <td>${name}</td>
              <td class="center">${data.invoices}</td>
              <td class="center">${data.qty}</td>
              <td class="right"><strong>₹${data.amount.toFixed(2)}</strong></td>
            </tr>
            `).join('')}
          </tbody>
        </table>
        ` : ''}
        <div class="section-title">${pageNum === 1 ? 'Detailed Invoice List' : `Invoice List (Continued)`}</div>
        <table>
          <thead>
            <tr>
              <th style="width:30px;">#</th>
              <th style="width:100px;">Invoice No</th>
              <th style="width:80px;">Date</th>
              <th>Supplier</th>
              <th style="width:60px;">Items</th>
              <th style="width:60px;">Qty</th>
              <th style="width:80px;">GST</th>
              <th style="width:100px;">Amount</th>
              <th style="width:60px;">Returns</th>
            </tr>
          </thead>
          <tbody>
            ${pageInvoices.map((inv, idx) => {
              const invoiceReturns = returns.filter(r => r.originalInvoiceNo === inv.invoiceNo);
              const returnAmount = invoiceReturns.reduce((sum, ret) => sum + ret.totalReturnAmount, 0);
              const globalIdx = reportData.findIndex(i => i.invoiceNo === inv.invoiceNo) + 1;
              return `
              <tr>
                <td class="center">${globalIdx}</td>
                <td class="center">${inv.invoiceNo}</td>
                <td class="center">${new Date(inv.header.invoiceDate).toLocaleDateString('en-IN')}</td>
                <td>${inv.party.name}</td>
                <td class="center">${inv.items.length}</td>
                <td class="center">${inv.totals.totalQty}</td>
                <td class="right">₹${inv.totals.totalGST.toFixed(2)}</td>
                <td class="right"><strong>₹${inv.totals.total.toFixed(2)}</strong></td>
                <td class="center">${returnAmount > 0 ? `₹${returnAmount.toFixed(2)}` : '-'}</td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div class="page-number">Page ${pageNum} of ${pages.length}</div>
      </div>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Purchase Report - ${new Date().toLocaleDateString('en-IN')}</title>
          <style>
            @page { size: A4; margin: 10mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
            .page { page-break-after: always; padding: 8mm; min-height: 277mm; position: relative; }
            .page:last-child { page-break-after: auto; }
            .report-header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
            .report-header h1 { font-size: 22px; margin-bottom: 8px; }
            .report-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; text-align: left; font-size: 9px; margin-top: 8px; }
            .analytics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 15px; }
            .analytics-card { border: 2px solid #000; padding: 8px; text-align: center; }
            .analytics-label { font-size: 8px; color: #666; margin-bottom: 4px; }
            .analytics-value { font-size: 14px; font-weight: bold; }
            .section-title { font-size: 12px; font-weight: bold; border-bottom: 2px solid #000; padding: 6px 0; margin: 12px 0 8px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #000; padding: 4px 3px; font-size: 9px; }
            th { background: #f0f0f0; font-weight: bold; text-align: center; }
            td.center { text-align: center; }
            td.right { text-align: right; }
            .compact-table th, .compact-table td { padding: 3px 2px; font-size: 8px; }
            .page-number { position: absolute; bottom: 5mm; right: 8mm; font-size: 8px; color: #666; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${pages.map((pageInvoices, i) => renderPage(pageInvoices, i + 1, i === pages.length - 1)).join('')}
        </body>
      </html>
    `;

    setPreviewHTML(html);
    setShowReportModal(true);
  };

  /********************** MAIN COMPONENT UI RETURN **********************/
  return (
    <>
      <div className="fixed inset-0 bg-gradient-to-br from-gray-50 to-gray-100 z-50 overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-bold">Purchase History & Returns</h2>
            <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-semibold">
              {filteredInvoices.length} Invoices | ₹{filteredInvoices.reduce((sum, inv) => sum + inv.totals.total, 0).toFixed(2)}
            </div>
          </div>
          <button onClick={onClose} className="px-4 py-2 bg-white/20 rounded-lg text-sm hover:bg-white/30 font-bold transition-colors">
            ✕ Close
          </button>
        </div>

        <div className="bg-white border-b-2 border-gray-200 px-4 py-3">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-4">
              <div className="relative">
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍 Search by invoice, supplier, product, batch..." className="w-full px-4 py-2 pl-10 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm" />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <div className="col-span-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm" placeholder="From Date" />
            </div>
            <div className="col-span-2">
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm" placeholder="To Date" />
            </div>
            <div className="col-span-2">
              <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm">
                <option value="">All Suppliers</option>
                {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex items-center space-x-2">
              <button onClick={clearFilters} className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-bold transition-colors">Clear</button>
              <button onClick={generatePurchaseReport} className="flex-1 px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 text-sm font-bold transition-colors">📊 Report</button>
            </div>
          </div>

          {(searchQuery || dateFrom || dateTo || selectedSupplier) && (
            <div className="mt-2 flex items-center space-x-2 text-xs">
              <span className="text-gray-600 font-semibold">Active Filters:</span>
              {searchQuery && <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">Search: {searchQuery}</span>}
              {dateFrom && <span className="bg-green-100 text-green-800 px-2 py-1 rounded">From: {new Date(dateFrom).toLocaleDateString('en-IN')}</span>}
              {dateTo && <span className="bg-green-100 text-green-800 px-2 py-1 rounded">To: {new Date(dateTo).toLocaleDateString('en-IN')}</span>}
              {selectedSupplier && <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">Supplier: {selectedSupplier}</span>}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-white">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 font-semibold">Loading purchase data...</p>
              </div>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <svg className="w-24 h-24 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xl text-gray-600 font-bold mb-2">No Purchase Invoices Found</p>
                <p className="text-gray-500">Try adjusting your filters or create a new purchase invoice</p>
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gradient-to-r from-gray-700 to-gray-800 text-white sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 text-left border-r border-gray-600">#</th>
                  <th className="px-3 py-3 text-left border-r border-gray-600">Invoice No</th>
                  <th className="px-3 py-3 text-left border-r border-gray-600">Date</th>
                  <th className="px-3 py-3 text-left border-r border-gray-600">Supplier</th>
                  <th className="px-3 py-3 text-center border-r border-gray-600">Items</th>
                  <th className="px-3 py-3 text-right border-r border-gray-600">Qty</th>
                  <th className="px-3 py-3 text-right border-r border-gray-600">GST</th>
                  <th className="px-3 py-3 text-right border-r border-gray-600">Total</th>
                  <th className="px-3 py-3 text-center border-r border-gray-600">Returns</th>
                  <th className="px-3 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice, idx) => {
                  const invoiceReturns = returns.filter(r => r.originalInvoiceNo === invoice.invoiceNo);
                  const returnAmount = invoiceReturns.reduce((sum, ret) => sum + ret.totalReturnAmount, 0);
                  const hasReturns = invoiceReturns.length > 0;

                  return (
                    <tr key={invoice.id || idx} className={`border-b hover:bg-blue-50 transition-colors ${hasReturns ? 'bg-orange-50' : ''}`}>
                      <td className="px-3 py-2 border-r font-bold text-gray-600">{idx + 1}</td>
                      <td className="px-3 py-2 border-r">
                        <span className="font-mono font-bold text-blue-700">{invoice.invoiceNo}</span>
                      </td>
                      <td className="px-3 py-2 border-r text-gray-700">
                        {new Date(invoice.header.invoiceDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-3 py-2 border-r">
                        <div className="font-semibold text-gray-800">{invoice.party.name}</div>
                        {invoice.party.gstin && <div className="text-xs text-gray-500">{invoice.party.gstin}</div>}
                      </td>
                      <td className="px-3 py-2 border-r text-center font-semibold">{invoice.items.length}</td>
                      <td className="px-3 py-2 border-r text-right font-semibold">{invoice.totals.totalQty}</td>
                      <td className="px-3 py-2 border-r text-right text-gray-700">₹{invoice.totals.totalGST.toFixed(2)}</td>
                      <td className="px-3 py-2 border-r text-right font-bold text-green-700">
                        ₹{invoice.totals.total.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 border-r text-center">
                        {hasReturns ? (
                          <div>
                            <span className="bg-orange-200 text-orange-800 px-2 py-1 rounded text-xs font-bold">{invoiceReturns.length}</span>
                            <div className="text-xs text-red-600 font-semibold mt-1">-₹{returnAmount.toFixed(2)}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center space-x-1">
                          <button onClick={() => viewInvoice(invoice)} className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 font-bold transition-colors" title="View Invoice">
                            👁️
                          </button>
                          <button onClick={() => openReturnModal(invoice)} className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600 font-bold transition-colors" title="Process Return">
                            ↩️
                          </button>
                          <button onClick={() => deleteInvoice(invoice.id, invoice.invoiceNo)} className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 font-bold transition-colors" title="Delete Invoice">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-gradient-to-r from-gray-700 to-gray-800 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div>
              <span className="text-xs text-gray-300">Total Invoices:</span>
              <span className="ml-2 text-lg font-bold">{filteredInvoices.length}</span>
            </div>
            <div>
              <span className="text-xs text-gray-300">Total Quantity:</span>
              <span className="ml-2 text-lg font-bold">{filteredInvoices.reduce((sum, inv) => sum + inv.totals.totalQty, 0)}</span>
            </div>
            <div>
              <span className="text-xs text-gray-300">Total GST:</span>
              <span className="ml-2 text-lg font-bold">₹{filteredInvoices.reduce((sum, inv) => sum + inv.totals.totalGST, 0).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-xs text-gray-300">Total Amount:</span>
              <span className="ml-2 text-xl font-bold text-green-400">₹{filteredInvoices.reduce((sum, inv) => sum + inv.totals.total, 0).toFixed(2)}</span>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            Last updated: {new Date().toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {showReturnModal && <ReturnModal />}

      {showInvoicePreview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold">Invoice Preview</h2>
              <div className="flex items-center space-x-3">
                <button onClick={handlePrint} className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 font-bold transition-colors">
                  🖨️ Print
                </button>
                <button onClick={() => setShowInvoicePreview(false)} className="text-white hover:bg-white/20 rounded-full p-2 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe id="print-iframe" srcDoc={previewHTML} className="w-full h-full border-0" />
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-green-600 to-emerald-700 text-white px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold">Purchase Report</h2>
              <div className="flex items-center space-x-3">
                <button onClick={handlePrint} className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 font-bold transition-colors">
                  🖨️ Print Report
                </button>
                <button onClick={() => setShowReportModal(false)} className="text-white hover:bg-white/20 rounded-full p-2 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe id="print-iframe" srcDoc={previewHTML} className="w-full h-full border-0" />
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div className="fixed bottom-6 right-6 z-[70] animate-slide-up">
          <div className={`px-6 py-4 rounded-lg shadow-2xl flex items-center space-x-3 ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white`}>
            <span className="text-2xl">{toast.type === 'success' ? '✅' : '❌'}</span>
            <span className="font-semibold">{toast.message}</span>
          </div>
        </div>
      )}
    </>
  );
}
