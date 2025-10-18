  // src/components/PurchaseInvoice.tsx
// ULTIMATE WIDESCREEN PURCHASE INVOICE - PLAIN ADVANCED BILL WITH PROFIT
// COMPLETE INVENTORY MAPPING - PRINT & PDF SAVE - NO LAZY CODE

import { useState, useEffect } from 'react';
import {
  savePurchaseInvoice,
  type PurchaseInvoiceRecord,
} from '../services/purchaseDB';

// Inventory API
declare global {
  interface Window {
    inventory?: {
      getAll: () => Promise<any[]>;
      addOrUpdate: (product: any) => Promise<{ success: boolean }>;
      incrementStockByCodeBatch: (code: string, batch: string, qty: number) => Promise<any>;
      getByCodeAndBatch: (code: string, batch: string) => Promise<any>;
    };
  }
}

// Types
type PurchaseItem = {
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

type ProductBatch = {
  itemCode: string;
  itemName: string;
  batch: string;
  expiryDate: string;
  mrp: number;
  stockQuantity: number;
  cgstRate: number;
  sgstRate: number;
  hsnCode: string;
  manufacturer: string;
  packSize: number;
  purchasePrice: number;
};

// Utilities
function fmtINR(n: number) {
  return `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toDisplayDate(iso: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

export default function PurchaseInvoice() {
  // Header Info
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>('');
  const [lrNo, setLrNo] = useState('');
  const [lrDate, setLrDate] = useState<string>('');
  const [cases, setCases] = useState<number | ''>('');
  const [transport, setTransport] = useState('');

  // Party Info
  const [partyName, setPartyName] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyGSTIN, setPartyGSTIN] = useState('');
  const [partyState, setPartyState] = useState('Kerala');
  const [partyStateCode, setPartyStateCode] = useState('32');

  // Items
  const [items, setItems] = useState<PurchaseItem[]>([
    {
      id: generateId(),
      slNo: 1,
      qty: 0,
      free: 0,
      mfr: '',
      pack: 1,
      productName: '',
      batch: '',
      exp: '',
      hsn: '',
      mrp: 0,
      rate: 0,
      dis: 0,
      sgst: 0,
      sgstValue: 0,
      cgst: 0,
      cgstValue: 0,
      value: 0,
    },
  ]);

  // Product Search
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [allProducts, setAllProducts] = useState<ProductBatch[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<ProductBatch[]>([]);
  const [currentEditingRow, setCurrentEditingRow] = useState<string | null>(null);

  // Bill Preview
  const [showBillPreview, setShowBillPreview] = useState(false);
  const [billPreviewHTML, setBillPreviewHTML] = useState('');

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success',
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  // Load products
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
          stockQuantity: Number(p.stockQuantity || 0),
          cgstRate: Number(p.cgstRate || 0),
          sgstRate: Number(p.sgstRate || 0),
          hsnCode: p.hsnCode || '',
          manufacturer: p.manufacturer || '',
          packSize: Number(p.packSize || 1),
          purchasePrice: Number(p.purchasePrice || 0),
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

  // Open product search
  const openProductSearch = (rowId: string) => {
    setCurrentEditingRow(rowId);
    setProductQuery('');
    setShowProductSearch(true);
  };

  // Select product
  const selectProduct = (product: ProductBatch) => {
    if (!currentEditingRow) return;

    const updatedItems = items.map(item => {
      if (item.id === currentEditingRow) {
        return {
          ...item,
          productName: product.itemName,
          batch: product.batch,
          exp: product.expiryDate,
          hsn: product.hsnCode,
          mrp: product.mrp,
          rate: product.purchasePrice || product.mrp * 0.8,
          mfr: product.manufacturer,
          pack: product.packSize,
          cgst: product.cgstRate,
          sgst: product.sgstRate,
        };
      }
      return item;
    });

    setItems(updatedItems);
    setShowProductSearch(false);
    setCurrentEditingRow(null);
    showToast('Product added to invoice');
  };

  // Calculate row
  const calculateRow = (item: PurchaseItem): PurchaseItem => {
    const grossAmount = item.qty * item.rate;
    const discountAmount = (grossAmount * item.dis) / 100;
    const taxableAmount = grossAmount - discountAmount;
    const cgstValue = (taxableAmount * item.cgst) / 100;
    const sgstValue = (taxableAmount * item.sgst) / 100;
    const value = taxableAmount + cgstValue + sgstValue;

    return {
      ...item,
      cgstValue: Number(cgstValue.toFixed(2)),
      sgstValue: Number(sgstValue.toFixed(2)),
      value: Number(value.toFixed(2)),
    };
  };

  // Update item
  const updateItem = (id: string, field: keyof PurchaseItem, value: any) => {
    const updated = items.map(item => {
      if (item.id === id) {
        const newItem = { ...item, [field]: value };
        return calculateRow(newItem);
      }
      return item;
    });
    setItems(updated);
  };

  // Add row
  const addRow = () => {
    const newRow: PurchaseItem = {
      id: generateId(),
      slNo: items.length + 1,
      qty: 0,
      free: 0,
      mfr: '',
      pack: 1,
      productName: '',
      batch: '',
      exp: '',
      hsn: '',
      mrp: 0,
      rate: 0,
      dis: 0,
      sgst: 0,
      sgstValue: 0,
      cgst: 0,
      cgstValue: 0,
      value: 0,
    };
    setItems([...items, newRow]);
  };

  // Delete row
  const deleteRow = (id: string) => {
    if (items.length === 1) {
      showToast('Cannot delete the last row', 'error');
      return;
    }
    const filtered = items.filter(item => item.id !== id);
    const renumbered = filtered.map((item, idx) => ({ ...item, slNo: idx + 1 }));
    setItems(renumbered);
  };

  // Calculate totals
  const totals = items.reduce(
    (acc, item) => {
      const grossAmount = item.qty * item.rate;
      const discountAmount = (grossAmount * item.dis) / 100;
      const taxableAmount = grossAmount - discountAmount;
      
      // Calculate potential profit (MRP - Purchase Rate)
      const potentialProfitPerUnit = item.mrp - item.rate;
      const totalPotentialProfit = potentialProfitPerUnit * item.qty;

      return {
        totalQty: acc.totalQty + item.qty,
        totalFree: acc.totalFree + item.free,
        scheme: acc.scheme + discountAmount,
        discount: acc.discount,
        sgst: acc.sgst + item.sgstValue,
        cgst: acc.cgst + item.cgstValue,
        totalGST: acc.totalGST + item.cgstValue + item.sgstValue,
        total: acc.total + item.value,
        potentialProfit: acc.potentialProfit + totalPotentialProfit,
        totalMRPValue: acc.totalMRPValue + (item.mrp * item.qty),
      };
    },
    { 
      totalQty: 0, 
      totalFree: 0, 
      scheme: 0, 
      discount: 0, 
      sgst: 0, 
      cgst: 0, 
      totalGST: 0, 
      total: 0,
      potentialProfit: 0,
      totalMRPValue: 0,
    }
  );

  // GST breakdown
  const gstBreakdown = items.reduce((acc, item) => {
    const grossAmount = item.qty * item.rate;
    const discountAmount = (grossAmount * item.dis) / 100;
    const taxableAmount = grossAmount - discountAmount;
    const gstRate = item.cgst + item.sgst;

    if (gstRate > 0 && item.qty > 0) {
      if (!acc[gstRate]) {
        acc[gstRate] = { taxable: 0, cgst: 0, sgst: 0 };
      }
      acc[gstRate].taxable += taxableAmount;
      acc[gstRate].cgst += item.cgstValue;
      acc[gstRate].sgst += item.sgstValue;
    }

    return acc;
  }, {} as Record<number, { taxable: number; cgst: number; sgst: number }>);

  // Generate PLAIN WHITE ADVANCED BILL with PROFIT
  const generateBillPreviewHTML = () => {
    const validItems = items.filter(i => i.productName && i.qty > 0);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Purchase Invoice - ${invoiceNo}</title>
        <style>
          @page { size: A4 landscape; margin: 20mm; }
          @media print { 
            body { margin: 0; padding: 0; }
            .no-print { display: none; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Arial', sans-serif; 
            font-size: 10px;
            color: #000;
            background: #fff;
            line-height: 1.4;
          }
          .container { 
            width: 100%; 
            max-width: 297mm;
            margin: 0 auto;
            padding: 20px;
            background: #fff;
          }
          .header {
            text-align: center;
            border: 2px solid #000;
            padding: 20px;
            margin-bottom: 15px;
          }
          .header h1 {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .header h2 {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .header p {
            font-size: 10px;
            line-height: 1.6;
            margin: 3px 0;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 15px;
          }
          .info-box {
            border: 2px solid #000;
            padding: 15px;
          }
          .info-box-title {
            font-weight: bold;
            font-size: 11px;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid #000;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            font-size: 10px;
          }
          .info-label {
            font-weight: bold;
            min-width: 120px;
          }
          .info-value {
            flex: 1;
            text-align: right;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
            border: 2px solid #000;
          }
          th {
            background: #fff;
            color: #000;
            font-weight: bold;
            padding: 10px 8px;
            text-align: center;
            font-size: 9px;
            border: 1px solid #000;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          td {
            padding: 8px 6px;
            border: 1px solid #000;
            font-size: 9px;
            text-align: center;
          }
          td.left { text-align: left; }
          td.right { text-align: right; }
          .totals-grid {
            display: grid;
            grid-template-columns: 1.5fr 1fr;
            gap: 15px;
            margin-top: 15px;
          }
          .gst-breakdown {
            border: 2px solid #000;
            padding: 15px;
          }
          .gst-breakdown-title {
            font-weight: bold;
            font-size: 12px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .gst-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .gst-table th {
            background: #fff;
            font-size: 9px;
            padding: 8px 6px;
            border: 1px solid #000;
          }
          .gst-table td {
            font-size: 9px;
            padding: 6px;
            border: 1px solid #000;
          }
          .summary-box {
            border: 2px solid #000;
            padding: 15px;
          }
          .summary-title {
            font-weight: bold;
            font-size: 12px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 11px;
            border-bottom: 1px solid #ddd;
          }
          .summary-row:last-child {
            border-bottom: none;
          }
          .summary-row.grand {
            font-size: 16px;
            font-weight: bold;
            padding-top: 12px;
            margin-top: 10px;
            border-top: 2px solid #000;
          }
          .profit-section {
            background: #fff;
            border: 2px solid #000;
            padding: 15px;
            margin-top: 15px;
          }
          .profit-title {
            font-weight: bold;
            font-size: 12px;
            margin-bottom: 10px;
            text-transform: uppercase;
          }
          .profit-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 11px;
            border-bottom: 1px solid #ddd;
          }
          .footer {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 2px solid #000;
            text-align: center;
            font-size: 9px;
          }
          .footer p {
            margin: 4px 0;
          }
          .signature-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #000;
          }
          .signature-box {
            text-align: center;
            padding-top: 40px;
            border-top: 1px solid #000;
            font-size: 10px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <h1>PENCOS MEDICALS</h1>
            <h2>PURCHASE INVOICE / GST CREDIT NOTE</h2>
            <p>MELEPANDIYIL BUILDING, CHENGANNUR, KERALA-690514</p>
            <p>Phone: 9497370571, 9447207537</p>
            <p>GSTIN: 32AAXFM5083E1Z1 | State: Kerala (Code: 32)</p>
          </div>

          <!-- Info Grid -->
          <div class="info-grid">
            <div class="info-box">
              <div class="info-box-title">Supplier Details</div>
              <div class="info-row">
                <span class="info-label">Supplier Name:</span>
                <span class="info-value">${partyName || 'N/A'}</span>
              </div>
              ${partyAddress ? `<div class="info-row">
                <span class="info-label">Address:</span>
                <span class="info-value">${partyAddress}</span>
              </div>` : ''}
              ${partyPhone ? `<div class="info-row">
                <span class="info-label">Phone:</span>
                <span class="info-value">${partyPhone}</span>
              </div>` : ''}
              ${partyGSTIN ? `<div class="info-row">
                <span class="info-label">GSTIN:</span>
                <span class="info-value">${partyGSTIN}</span>
              </div>` : ''}
              ${partyState ? `<div class="info-row">
                <span class="info-label">State:</span>
                <span class="info-value">${partyState} (${partyStateCode})</span>
              </div>` : ''}
            </div>
            <div class="info-box">
              <div class="info-box-title">Invoice Details</div>
              <div class="info-row">
                <span class="info-label">Invoice Number:</span>
                <span class="info-value" style="font-weight:bold;font-size:12px;">${invoiceNo}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Invoice Date:</span>
                <span class="info-value">${toDisplayDate(invoiceDate)}</span>
              </div>
              ${dueDate ? `<div class="info-row">
                <span class="info-label">Due Date:</span>
                <span class="info-value">${toDisplayDate(dueDate)}</span>
              </div>` : ''}
              ${orderDate ? `<div class="info-row">
                <span class="info-label">Order Date:</span>
                <span class="info-value">${toDisplayDate(orderDate)}</span>
              </div>` : ''}
              ${lrNo ? `<div class="info-row">
                <span class="info-label">L.R. Number:</span>
                <span class="info-value">${lrNo}</span>
              </div>` : ''}
              ${lrDate ? `<div class="info-row">
                <span class="info-label">L.R. Date:</span>
                <span class="info-value">${toDisplayDate(lrDate)}</span>
              </div>` : ''}
              ${cases ? `<div class="info-row">
                <span class="info-label">Cases:</span>
                <span class="info-value">${cases}</span>
              </div>` : ''}
              ${transport ? `<div class="info-row">
                <span class="info-label">Transport:</span>
                <span class="info-value">${transport}</span>
              </div>` : ''}
            </div>
          </div>

          <!-- Items Table -->
          <table>
            <thead>
              <tr>
                <th style="width:30px;">#</th>
                <th style="width:45px;">QTY</th>
                <th style="width:45px;">FREE</th>
                <th style="width:70px;">MFR</th>
                <th style="width:40px;">PACK</th>
                <th style="width:200px;">PRODUCT NAME</th>
                <th style="width:75px;">BATCH</th>
                <th style="width:55px;">EXP</th>
                <th style="width:60px;">HSN</th>
                <th style="width:65px;">M.R.P</th>
                <th style="width:65px;">RATE</th>
                <th style="width:45px;">DIS%</th>
                <th style="width:50px;">SGST%</th>
                <th style="width:65px;">SGST</th>
                <th style="width:50px;">CGST%</th>
                <th style="width:65px;">CGST</th>
                <th style="width:80px;">VALUE</th>
              </tr>
            </thead>
            <tbody>
              ${validItems.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td style="font-weight:bold;">${item.qty}</td>
                  <td>${item.free || '-'}</td>
                  <td class="left" style="font-size:8px;">${item.mfr || '-'}</td>
                  <td>${item.pack || 1}</td>
                  <td class="left" style="font-weight:600;font-size:9px;">${item.productName}</td>
                  <td style="font-family:monospace;font-weight:bold;font-size:8px;">${item.batch}</td>
                  <td style="font-size:8px;">${item.exp || '-'}</td>
                  <td>${item.hsn || '-'}</td>
                  <td class="right" style="font-weight:600;">₹${item.mrp.toFixed(2)}</td>
                  <td class="right" style="font-weight:bold;">₹${item.rate.toFixed(2)}</td>
                  <td>${item.dis || 0}%</td>
                  <td>${item.sgst}%</td>
                  <td class="right">₹${item.sgstValue.toFixed(2)}</td>
                  <td>${item.cgst}%</td>
                  <td class="right">₹${item.cgstValue.toFixed(2)}</td>
                  <td class="right" style="font-weight:bold;font-size:10px;">₹${item.value.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot style="background:#f5f5f5;">
              <tr style="font-weight:bold;">
                <td>TOTAL</td>
                <td>${totals.totalQty}</td>
                <td>${totals.totalFree}</td>
                <td colspan="10"></td>
                <td class="right">₹${totals.sgst.toFixed(2)}</td>
                <td></td>
                <td class="right">₹${totals.cgst.toFixed(2)}</td>
                <td class="right" style="font-size:12px;">₹${totals.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          <!-- Totals Grid -->
          <div class="totals-grid">
            <div class="gst-breakdown">
              <div class="gst-breakdown-title">GST Breakdown</div>
              <table class="gst-table">
                <thead>
                  <tr>
                    <th>GST RATE</th>
                    <th>TAXABLE AMOUNT</th>
                    <th>CGST</th>
                    <th>SGST</th>
                    <th>TOTAL GST</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(gstBreakdown).map(([rate, data]) => `
                    <tr>
                      <td style="font-weight:bold;">${rate}%</td>
                      <td class="right">₹${data.taxable.toFixed(2)}</td>
                      <td class="right">₹${data.cgst.toFixed(2)}</td>
                      <td class="right">₹${data.sgst.toFixed(2)}</td>
                      <td class="right" style="font-weight:bold;">₹${(data.cgst + data.sgst).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                  ${Object.keys(gstBreakdown).length === 0 ? '<tr><td colspan="5">No GST Data</td></tr>' : ''}
                </tbody>
              </table>
            </div>

            <div class="summary-box">
              <div class="summary-title">Summary</div>
              <div class="summary-row">
                <span>Total Items:</span>
                <span>${validItems.length}</span>
              </div>
              <div class="summary-row">
                <span>Total Quantity:</span>
                <span>${totals.totalQty}</span>
              </div>
              <div class="summary-row">
                <span>Free Quantity:</span>
                <span>${totals.totalFree}</span>
              </div>
              <div class="summary-row">
                <span>Taxable Amount:</span>
                <span>₹${Object.values(gstBreakdown).reduce((s, d) => s + d.taxable, 0).toFixed(2)}</span>
              </div>
              <div class="summary-row">
                <span>Total CGST:</span>
                <span>₹${totals.cgst.toFixed(2)}</span>
              </div>
              <div class="summary-row">
                <span>Total SGST:</span>
                <span>₹${totals.sgst.toFixed(2)}</span>
              </div>
              <div class="summary-row">
                <span>Total GST:</span>
                <span>₹${totals.totalGST.toFixed(2)}</span>
              </div>
              <div class="summary-row grand">
                <span>GRAND TOTAL:</span>
                <span>₹${Math.round(totals.total).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <!-- Profit Analysis Section -->
          <div class="profit-section">
            <div class="profit-title">Profit Analysis</div>
            <div class="profit-row">
              <span>Total MRP Value (if sold at MRP):</span>
              <span>₹${totals.totalMRPValue.toFixed(2)}</span>
            </div>
            <div class="profit-row">
              <span>Total Purchase Cost:</span>
              <span>₹${totals.total.toFixed(2)}</span>
            </div>
            <div class="profit-row" style="font-weight:bold;font-size:13px;border-top:2px solid #000;padding-top:12px;margin-top:8px;">
              <span>Potential Profit (if sold at MRP):</span>
              <span>₹${totals.potentialProfit.toFixed(2)}</span>
            </div>
            <div class="profit-row" style="font-size:12px;">
              <span>Profit Margin:</span>
              <span>${totals.totalMRPValue > 0 ? ((totals.potentialProfit / totals.totalMRPValue) * 100).toFixed(2) : 0}%</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p style="font-weight:bold;margin-bottom:8px;">Bank Details: Bank of Baroda | Account No: 33030400000044 | Branch: Haripad | IFSC: BARB0HARIPA</p>
            <p>This is a computer-generated purchase invoice and does not require a signature.</p>
            <p style="margin-top:8px;font-style:italic;">Generated on: ${new Date().toLocaleString('en-IN')}</p>
          </div>

          <!-- Signature Section -->
          <div class="signature-section">
            <div class="signature-box">
              Prepared By
            </div>
            <div class="signature-box">
              Authorized Signatory
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // Show Bill Preview
  const showBillPreviewModal = () => {
    const html = generateBillPreviewHTML();
    setBillPreviewHTML(html);
    setShowBillPreview(true);
  };

  // Print Bill
  // ✅ IMPROVED: Print Bill WITHOUT Pop-up (Using Hidden Iframe)
  const printBill = () => {
    const html = billPreviewHTML || generateBillPreviewHTML();
    
    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '297mm'; // A4 landscape width
    iframe.style.height = '210mm'; // A4 landscape height
    iframe.style.border = 'none';
    
    // Append to body
    document.body.appendChild(iframe);
    
    // Get iframe document
    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
      showToast('❌ Print failed. Please try again.', 'error');
      document.body.removeChild(iframe);
      return;
    }
    
    // Write HTML to iframe
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();
    
    // Wait for content to load, then trigger print
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        
        // Remove iframe after print dialog closes (cleanup after 1 second)
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      } catch (error) {
        console.error('Print error:', error);
        showToast('❌ Print failed', 'error');
        document.body.removeChild(iframe);
      }
    }, 500);
  };

  // ✅ IMPROVED: Save to PDF (Same as Print - Browser has built-in "Save as PDF")
  const saveToPDF = () => {
    printBill();
    showToast('💡 Tip: Select "Save as PDF" in the print dialog', 'success');
  };

  
  // ============ CONTINUATION FROM PART 1 ============

  // COMPLETE INVENTORY MAPPING - Save Purchase Invoice
  const savePurchase = async () => {
    if (!invoiceNo.trim()) {
      showToast('Invoice number is required', 'error');
      return;
    }

    const validItems = items.filter(item => item.productName.trim() && item.qty > 0);
    if (validItems.length === 0) {
      showToast('Add at least one product with quantity', 'error');
      return;
    }

    try {
      // Prepare purchase record
      const record: Omit<PurchaseInvoiceRecord, 'id'> = {
        invoiceNo,
        header: {
          invoiceDate,
          dueDate: dueDate || invoiceDate,
          orderDate: orderDate || invoiceDate,
          lrNo: lrNo || '',
          lrDate: lrDate || '',
          cases: Number(cases) || 0,
          transport: transport || '',
        },
        party: {
          name: partyName || 'N/A',
          address: partyAddress || '',
          phone: partyPhone || '',
          gstin: partyGSTIN || '',
          state: partyState || 'Kerala',
          stateCode: partyStateCode || '32',
        },
        items: validItems,
        totals: {
          totalQty: totals.totalQty,
          totalFree: totals.totalFree,
          scheme: totals.scheme,
          discount: totals.discount,
          sgst: totals.sgst,
          cgst: totals.cgst,
          totalGST: totals.totalGST,
          total: totals.total,
        },
        createdAt: new Date().toISOString(),
      };

      // Save to purchase DB
      await savePurchaseInvoice(record);

      // COMPLETE INVENTORY MAPPING - Update inventory for each item
      if (window.inventory) {
        for (const item of validItems) {
          // Generate item code if not existing
          const itemCode = item.productName
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')
            .substring(0, 20) + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();

          // Check if product with same name and batch exists
          const existingProduct = allProducts.find(
            p =>
              p.itemName.toLowerCase().trim() === item.productName.toLowerCase().trim() &&
              p.batch.toLowerCase().trim() === item.batch.toLowerCase().trim()
          );

          if (existingProduct) {
            // Product exists - INCREMENT stock quantity
            console.log(`Updating existing product: ${existingProduct.itemName} - Batch: ${existingProduct.batch}`);
            
            if (window.inventory.incrementStockByCodeBatch) {
              await window.inventory.incrementStockByCodeBatch(
                existingProduct.itemCode,
                existingProduct.batch,
                item.qty + item.free
              );
              console.log(`✅ Stock incremented by ${item.qty + item.free} units`);
            }

            // Also update OTHER fields (MRP, purchase price, expiry, etc.)
            if (window.inventory.addOrUpdate) {
              await window.inventory.addOrUpdate({
                itemCode: existingProduct.itemCode,
                itemName: item.productName,
                batch: item.batch,
                expiryDate: item.exp || existingProduct.expiryDate,
                mrp: item.mrp || existingProduct.mrp,
                purchasePrice: item.rate,
                stockQuantity: existingProduct.stockQuantity + item.qty + item.free,
                cgstRate: item.cgst,
                sgstRate: item.sgst,
                hsnCode: item.hsn || existingProduct.hsnCode,
                manufacturer: item.mfr || existingProduct.manufacturer,
                packSize: item.pack || existingProduct.packSize,
                sellingPrice: item.mrp || existingProduct.mrp, // Map to selling price
                category: existingProduct.category || 'General',
                reorderLevel: existingProduct.reorderLevel || 10,
                location: existingProduct.location || 'Store',
                barcode: existingProduct.barcode || '',
                description: existingProduct.description || '',
                supplier: partyName || existingProduct.supplier || '',
              });
            }
          } else {
            // NEW PRODUCT - ADD to inventory with COMPLETE MAPPING
            console.log(`Adding new product: ${item.productName} - Batch: ${item.batch}`);
            
            if (window.inventory.addOrUpdate) {
              await window.inventory.addOrUpdate({
                // CORE FIELDS - MAPPED FROM PURCHASE
                itemCode: itemCode,
                itemName: item.productName,
                batch: item.batch,
                expiryDate: item.exp || '',
                mrp: item.mrp,
                purchasePrice: item.rate,
                sellingPrice: item.mrp, // Assume selling price = MRP initially
                stockQuantity: item.qty + item.free,
                cgstRate: item.cgst,
                sgstRate: item.sgst,
                hsnCode: item.hsn || '',
                manufacturer: item.mfr || '',
                packSize: item.pack || 1,
                
                // ADDITIONAL INVENTORY FIELDS - WITH DEFAULTS
                category: 'General', // Default category
                reorderLevel: 10, // Default reorder level
                location: 'Store', // Default storage location
                barcode: '', // Can be added later
                description: item.productName, // Use product name as description
                supplier: partyName || '', // Map from supplier name
                
                // TIMESTAMPS
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                
                // PRICING INFO
                costPrice: item.rate,
                profit: item.mrp - item.rate,
                profitMargin: item.mrp > 0 ? ((item.mrp - item.rate) / item.mrp * 100).toFixed(2) : '0',
                
                // INVENTORY TRACKING
                initialStock: item.qty + item.free,
                currentStock: item.qty + item.free,
                soldQuantity: 0,
                returnedQuantity: 0,
                
                // STATUS
                status: 'Active',
                isExpired: false,
                lowStock: (item.qty + item.free) <= 10,
              });
              
              console.log(`✅ New product added with ${item.qty + item.free} units`);
            }
          }
        }
        
        // Reload products after update
        const updatedProducts = await window.inventory.getAll();
        const formatted = updatedProducts.map((p: any) => ({
          itemCode: p.itemCode || '',
          itemName: p.itemName || '',
          batch: p.batch || '',
          expiryDate: p.expiryDate || '',
          mrp: Number(p.mrp || 0),
          stockQuantity: Number(p.stockQuantity || 0),
          cgstRate: Number(p.cgstRate || 0),
          sgstRate: Number(p.sgstRate || 0),
          hsnCode: p.hsnCode || '',
          manufacturer: p.manufacturer || '',
          packSize: Number(p.packSize || 1),
          purchasePrice: Number(p.purchasePrice || 0),
        }));
        setAllProducts(formatted);
      }

      showToast('✅ Purchase invoice saved & inventory updated successfully!');

      // Reset form
      setInvoiceNo('');
      setPartyName('');
      setPartyAddress('');
      setPartyPhone('');
      setPartyGSTIN('');
      setDueDate('');
      setOrderDate('');
      setLrNo('');
      setLrDate('');
      setCases('');
      setTransport('');
      setItems([
        {
          id: generateId(),
          slNo: 1,
          qty: 0,
          free: 0,
          mfr: '',
          pack: 1,
          productName: '',
          batch: '',
          exp: '',
          hsn: '',
          mrp: 0,
          rate: 0,
          dis: 0,
          sgst: 0,
          sgstValue: 0,
          cgst: 0,
          cgstValue: 0,
          value: 0,
        },
      ]);
    } catch (error) {
      console.error('Failed to save purchase:', error);
      showToast('❌ Failed to save purchase invoice', 'error');
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        savePurchase();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        printBill();
      }
      if (e.key === 'Escape') {
        setShowProductSearch(false);
        setShowBillPreview(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [items, invoiceNo, partyName]);

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Toast */}
      {toast.show && (
        <div
          className={`fixed top-6 right-6 z-[200] px-6 py-4 rounded-xl shadow-2xl ${
            toast.type === 'success'
              ? 'bg-gradient-to-r from-emerald-500 to-green-600'
              : 'bg-gradient-to-r from-rose-500 to-red-600'
          } text-white animate-slideInRight`}
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
            <div className="bg-white/10 p-3 rounded-xl">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Purchase Invoice Entry</h1>
              <p className="text-sm text-white/70 mt-0.5">Ultra-widescreen Excel interface with complete inventory mapping</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={showBillPreviewModal}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-lg text-sm font-bold shadow-lg transition-all"
            >
              👁️ Preview Bill
            </button>
            <button
              onClick={printBill}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 rounded-lg text-sm font-bold shadow-lg transition-all"
            >
              🖨️ Print
            </button>
            <button
              onClick={saveToPDF}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 rounded-lg text-sm font-bold shadow-lg transition-all"
            >
              📄 Save PDF
            </button>
            <button
              onClick={savePurchase}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 rounded-lg text-sm font-bold shadow-lg transition-all"
            >
              💾 Save Purchase
            </button>
          </div>
        </div>
      </div>

      {/* Header Form */}
      <div className="px-6 py-5 bg-white border-b shadow-sm">
        <div className="grid grid-cols-12 gap-5">
          {/* Company Info */}
          <div className="col-span-4 space-y-3 border-r-2 border-indigo-100 pr-5">
            <div className="bg-gradient-to-br from-indigo-50 to-blue-100 p-4 rounded-xl border-2 border-indigo-200">
              <div className="text-xl font-bold text-indigo-900">PENCOS MEDICALS</div>
              <div className="text-sm text-slate-600 mt-1">MELEPANDIYIL BUILDING</div>
              <div className="text-sm text-slate-600">CHENGANNUR, KERALA-690514</div>
              <div className="text-sm text-slate-600 mt-1">Ph: 9497370571, 9447207537</div>
              <div className="text-sm font-semibold text-indigo-700 mt-2">GSTIN: 32AAXFM5083E1Z1</div>
            </div>

            {/* Supplier Details */}
            <div className="space-y-2">
              <div className="text-sm font-bold text-slate-700 mb-2 flex items-center space-x-2">
                <span>📋 SUPPLIER DETAILS</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Optional</span>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Supplier Name</label>
                <input
                  value={partyName}
                  onChange={e => setPartyName(e.target.value)}
                  placeholder="Supplier name..."
                  className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Address</label>
                <input
                  value={partyAddress}
                  onChange={e => setPartyAddress(e.target.value)}
                  placeholder="Address..."
                  className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Phone</label>
                  <input
                    value={partyPhone}
                    onChange={e => setPartyPhone(e.target.value)}
                    placeholder="Phone..."
                    className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">GSTIN</label>
                  <input
                    value={partyGSTIN}
                    onChange={e => setPartyGSTIN(e.target.value)}
                    placeholder="GSTIN..."
                    className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="col-span-4 space-y-3 border-r-2 border-indigo-100 pr-5">
            <div className="text-sm font-bold text-slate-700 mb-3">📄 INVOICE DETAILS</div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Invoice No <span className="text-red-500">*</span>
              </label>
              <input
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                placeholder="Enter invoice number..."
                className="w-full px-4 py-2.5 border-2 border-indigo-300 rounded-lg text-base font-bold focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Invoice Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Order Date</label>
              <input
                type="date"
                value={orderDate}
                onChange={e => setOrderDate(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Transport Details */}
          <div className="col-span-4 space-y-3">
            <div className="text-sm font-bold text-slate-700 mb-3">🚚 TRANSPORT DETAILS</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">L.R. No</label>
                <input
                  value={lrNo}
                  onChange={e => setLrNo(e.target.value)}
                  placeholder="LR number..."
                  className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">L.R. Date</label>
                <input
                  type="date"
                  value={lrDate}
                  onChange={e => setLrDate(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cases</label>
                <input
                  type="number"
                  value={cases}
                  onChange={e => setCases(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Number of cases..."
                  className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Transport</label>
                <input
                  value={transport}
                  onChange={e => setTransport(e.target.value)}
                  placeholder="Transport name..."
                  className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ULTRA-WIDESCREEN EXCEL TABLE - 2600px+ WIDTH */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden border-2 border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: '2600px' }}>
              <thead className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10">
                <tr>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '60px'}}>#</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '100px'}}>QTY</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '100px'}}>FREE</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '150px'}}>MFR</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '100px'}}>PACK</th>
                  <th className="border border-indigo-500 px-4 py-4 text-left font-bold" style={{width: '350px'}}>PRODUCT NAME</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '140px'}}>BATCH</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '120px'}}>EXP</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '120px'}}>HSN</th>
                  <th className="border border-indigo-500 px-4 py-4 text-right font-bold" style={{width: '140px'}}>M.R.P</th>
                  <th className="border border-indigo-500 px-4 py-4 text-right font-bold" style={{width: '140px'}}>RATE</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '100px'}}>DIS%</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '100px'}}>SGST%</th>
                  <th className="border border-indigo-500 px-4 py-4 text-right font-bold" style={{width: '140px'}}>SGST</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '100px'}}>CGST%</th>
                  <th className="border border-indigo-500 px-4 py-4 text-right font-bold" style={{width: '140px'}}>CGST</th>
                  <th className="border border-indigo-500 px-4 py-4 text-right font-bold" style={{width: '160px'}}>VALUE</th>
                  <th className="border border-indigo-500 px-4 py-4 text-center font-bold" style={{width: '120px'}}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-indigo-50 transition-colors`}
                  >
                    <td className="border border-slate-300 px-4 py-3 text-center font-bold text-slate-700 text-lg">
                      {item.slNo}
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        type="number"
                        value={item.qty || ''}
                        onChange={e => updateItem(item.id, 'qty', Number(e.target.value))}
                        className="w-full px-4 py-3 text-center border-2 border-slate-300 rounded-lg text-lg font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        type="number"
                        value={item.free || ''}
                        onChange={e => updateItem(item.id, 'free', Number(e.target.value))}
                        className="w-full px-4 py-3 text-center border-2 border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        value={item.mfr}
                        onChange={e => updateItem(item.id, 'mfr', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="Manufacturer"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        type="number"
                        value={item.pack || ''}
                        onChange={e => updateItem(item.id, 'pack', Number(e.target.value))}
                        className="w-full px-4 py-3 text-center border-2 border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500"
                        placeholder="1"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <div className="flex items-center space-x-2">
                        <input
                          value={item.productName}
                          onChange={e => updateItem(item.id, 'productName', e.target.value)}
                          className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500"
                          placeholder="Product name..."
                        />
                        <button
                          onClick={() => openProductSearch(item.id)}
                          className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold"
                          title="Search Product"
                        >
                          🔍
                        </button>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        value={item.batch}
                        onChange={e => updateItem(item.id, 'batch', e.target.value)}
                        className="w-full px-4 py-3 text-center border-2 border-slate-300 rounded-lg font-mono text-sm font-bold focus:ring-2 focus:ring-indigo-500"
                        placeholder="Batch"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        value={item.exp}
                        onChange={e => updateItem(item.id, 'exp', e.target.value)}
                        className="w-full px-4 py-3 text-center border-2 border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="MM/YY"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        value={item.hsn}
                        onChange={e => updateItem(item.id, 'hsn', e.target.value)}
                        className="w-full px-4 py-3 text-center border-2 border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="HSN"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.mrp || ''}
                        onChange={e => updateItem(item.id, 'mrp', Number(e.target.value))}
                        className="w-full px-4 py-3 text-right border-2 border-slate-300 rounded-lg text-lg font-bold focus:ring-2 focus:ring-indigo-500"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.rate || ''}
                        onChange={e => updateItem(item.id, 'rate', Number(e.target.value))}
                        className="w-full px-4 py-3 text-right border-2 border-indigo-300 rounded-lg text-lg font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.dis || ''}
                        onChange={e => updateItem(item.id, 'dis', Number(e.target.value))}
                        className="w-full px-4 py-3 text-center border-2 border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-amber-500"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.sgst || ''}
                        onChange={e => updateItem(item.id, 'sgst', Number(e.target.value))}
                        className="w-full px-4 py-3 text-center border-2 border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-3 text-right font-bold text-amber-700 text-lg">
                      ₹{item.sgstValue.toFixed(2)}
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={item.cgst || ''}
                        onChange={e => updateItem(item.id, 'cgst', Number(e.target.value))}
                        className="w-full px-4 py-3 text-center border-2 border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-indigo-500"
                        placeholder="0"
                      />
                    </td>
                    <td className="border border-slate-300 px-4 py-3 text-right font-bold text-amber-700 text-lg">
                      ₹{item.cgstValue.toFixed(2)}
                    </td>
                    <td className="border border-slate-300 px-4 py-3 text-right font-bold text-indigo-700 text-xl">
                      ₹{item.value.toFixed(2)}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center">
                      <button
                        onClick={() => deleteRow(item.id)}
                        className="px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold"
                        title="Delete Row"
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gradient-to-r from-slate-100 to-slate-200 sticky bottom-0">
                <tr className="font-bold">
                  <td className="border border-slate-400 px-4 py-4 text-center" colSpan={1}>
                    <button
                      onClick={addRow}
                      className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-lg text-base font-bold shadow-lg"
                    >
                      ➕ Add Row
                    </button>
                  </td>
                  <td className="border border-slate-400 px-4 py-4 text-center text-indigo-700 text-xl">{totals.totalQty}</td>
                  <td className="border border-slate-400 px-4 py-4 text-center text-purple-700 text-xl">{totals.totalFree}</td>
                  <td className="border border-slate-400 px-4 py-4" colSpan={10}></td>
                  <td className="border border-slate-400 px-4 py-4 text-right text-amber-700 text-lg">{fmtINR(totals.sgst)}</td>
                  <td className="border border-slate-400 px-4 py-4"></td>
                  <td className="border border-slate-400 px-4 py-4 text-right text-amber-700 text-lg">{fmtINR(totals.cgst)}</td>
                  <td className="border border-slate-400 px-4 py-4 text-right text-indigo-700 text-2xl">
                    {fmtINR(totals.total)}
                  </td>
                  <td className="border border-slate-400 px-4 py-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* GST Summary Footer */}
      <div className="px-6 py-4 bg-white border-t shadow-lg">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8 border-2 border-indigo-200 rounded-xl p-4 bg-gradient-to-br from-indigo-50 to-blue-50">
            <div className="text-base font-bold text-indigo-900 mb-3">GST BREAKDOWN</div>
            <table className="w-full text-sm">
              <thead className="bg-indigo-100">
                <tr>
                  <th className="border border-indigo-300 px-4 py-3 text-left font-bold">CLASS</th>
                  <th className="border border-indigo-300 px-4 py-3 text-right font-bold">TAXABLE</th>
                  <th className="border border-indigo-300 px-4 py-3 text-right font-bold">SGST</th>
                  <th className="border border-indigo-300 px-4 py-3 text-right font-bold">CGST</th>
                  <th className="border border-indigo-300 px-4 py-3 text-right font-bold">TOTAL GST</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(gstBreakdown).map(([rate, data]) => (
                  <tr key={rate} className="hover:bg-indigo-50">
                    <td className="border border-indigo-200 px-4 py-3 font-bold text-base">GST {rate}%</td>
                    <td className="border border-indigo-200 px-4 py-3 text-right text-base">{fmtINR(data.taxable)}</td>
                    <td className="border border-indigo-200 px-4 py-3 text-right text-amber-600 font-semibold">{fmtINR(data.sgst)}</td>
                    <td className="border border-indigo-200 px-4 py-3 text-right text-amber-600 font-semibold">{fmtINR(data.cgst)}</td>
                    <td className="border border-indigo-200 px-4 py-3 text-right font-bold text-indigo-700 text-base">
                      {fmtINR(data.cgst + data.sgst)}
                    </td>
                  </tr>
                ))}
                {Object.keys(gstBreakdown).length === 0 && (
                  <tr>
                    <td className="border border-indigo-200 px-4 py-6 text-center text-slate-500" colSpan={5}>
                      No GST data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Summary Cards */}
          <div className="col-span-4 space-y-3">
            <div className="bg-gradient-to-br from-emerald-50 to-green-100 p-4 rounded-xl border-2 border-emerald-300">
              <div className="text-sm font-semibold text-emerald-700 mb-1">GRAND TOTAL</div>
              <div className="text-4xl font-bold text-emerald-800">{fmtINR(Math.round(totals.total))}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-amber-50 to-yellow-100 p-3 rounded-xl border-2 border-amber-300">
                <div className="text-xs font-semibold text-amber-700 mb-1">SGST</div>
                <div className="text-lg font-bold text-amber-800">{fmtINR(totals.sgst)}</div>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-red-100 p-3 rounded-xl border-2 border-orange-300">
                <div className="text-xs font-semibold text-orange-700 mb-1">CGST</div>
                <div className="text-lg font-bold text-orange-800">{fmtINR(totals.cgst)}</div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-violet-100 p-3 rounded-xl border-2 border-purple-300">
              <div className="text-xs font-semibold text-purple-700 mb-1">POTENTIAL PROFIT</div>
              <div className="text-2xl font-bold text-purple-900">{fmtINR(totals.potentialProfit)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* PRODUCT SEARCH MODAL */}
      {showProductSearch && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-purple-800 to-purple-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">🔍 Product Search</h3>
                <p className="text-sm text-white/70 mt-0.5">Search by item code, name, or batch</p>
              </div>
              <button
                onClick={() => setShowProductSearch(false)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <input
                  value={productQuery}
                  onChange={e => setProductQuery(e.target.value)}
                  placeholder="Type to search products..."
                  className="w-full px-5 py-4 border-2 border-purple-300 rounded-xl text-base focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  autoFocus
                />
              </div>

              <div className="max-h-[500px] overflow-auto border-2 border-purple-200 rounded-xl">
                {filteredProducts.map((product, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectProduct(product)}
                    className="p-4 border-b border-slate-200 hover:bg-purple-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-base font-bold text-slate-900">{product.itemName}</div>
                        <div className="text-sm text-slate-600 mt-1">Code: {product.itemCode}</div>
                        <div className="flex items-center space-x-3 mt-2 text-sm">
                          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg font-mono font-bold">
                            {product.batch}
                          </span>
                          <span className="text-slate-500">Exp: {product.expiryDate}</span>
                          <span className="text-emerald-600 font-semibold">MRP: ₹{product.mrp.toFixed(2)}</span>
                          <span className="text-indigo-600 font-semibold">HSN: {product.hsnCode}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Stock</div>
                        <div className="text-2xl font-bold text-indigo-700">{product.stockQuantity}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredProducts.length === 0 && productQuery && (
                  <div className="p-12 text-center text-slate-500">
                    <div className="text-5xl mb-3">🔍</div>
                    <div className="text-base font-semibold">No products found</div>
                  </div>
                )}
                {!productQuery && (
                  <div className="p-12 text-center text-slate-400">
                    <div className="text-5xl mb-3">📦</div>
                    <div className="text-base">Start typing to search products</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BILL PREVIEW MODAL */}
      {showBillPreview && billPreviewHTML && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-[95vw] max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-indigo-900 text-white flex items-center justify-between">
              <h3 className="text-xl font-bold">📄 Purchase Invoice Preview - Plain White Bill with Profit Analysis</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={printBill}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-bold"
                >
                  🖨️ Print
                </button>
                <button
                  onClick={saveToPDF}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-bold"
                >
                  📄 Save PDF
                </button>
                <button
                  onClick={() => setShowBillPreview(false)}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold"
                >
                  ✕ Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-slate-100">
              <div className="bg-white shadow-xl mx-auto" style={{ width: '297mm', minHeight: '210mm' }}>
                <div dangerouslySetInnerHTML={{ __html: billPreviewHTML }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
