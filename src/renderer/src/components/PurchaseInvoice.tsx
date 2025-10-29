// src/components/PurchaseInvoice.tsx - PART 1 (COMPLETE - ALL FIELDS EDITABLE)
// 🔥 PROFESSIONAL PURCHASE INVOICE WITH MANUAL ENTRY + SEARCH

import { useState, useEffect, useRef } from 'react';
import { savePurchaseInvoice, type PurchaseInvoiceRecord } from '../services/purchaseDB';

/********************** TYPES **********************/
declare global {
  interface Window {
    inventory?: {
      getAll: () => Promise<Product[]>;
      search: (term: string) => Promise<Product[]>;
      addProduct: (product: Partial<Product>) => Promise<{ success: boolean; product: Product }>;
      updateProduct: (id: string, updates: Partial<Product>) => Promise<{ success: boolean; product: Product }>;
      incrementStockByCodeBatch: (code: string, batch: string, qty: number) => Promise<{ success: boolean; newStock: number }>;
    };
  }
}

interface Product {
  id: string;
  itemCode: string;
  itemName: string;
  batch?: string;
  expiryDate?: string;
  hsnCode: string;
  manufacturer?: string;
  packSize?: number;
  mrp: number;
  purchasePrice: number;
  sellingPriceTab: number;
  stockQuantity: number;
  cgstRate: number;
  sgstRate: number;
  category: string;
  rol: number;
  minStockLevel: number;
  maxStockLevel: number;
}

interface PurchaseItem {
  id: string;
  slNo: number;
  itemCode: string;
  itemName: string;
  batch: string;
  expiry: string;
  hsn: string;
  mfr: string;
  pack: number;
  qty: number;
  free: number;
  rate: number;
  mrp: number;
  dis: number;
  cgst: number;
  sgst: number;
  cgstAmt: number;
  sgstAmt: number;
  amount: number;
}

/********************** UTILITIES **********************/
const generateId = () => Math.random().toString(36).substr(2, 9);

// Auto-format expiry date with "/" (MM/YY)
const formatExpiry = (value: string): string => {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length >= 2) {
    return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
  }
  return cleaned;
};

/********************** MAIN COMPONENT **********************/
export default function PurchaseInvoice({ onClose }: { onClose: () => void }) {
  // ========== INVOICE HEADER ==========
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [lrDate, setLrDate] = useState('');
  const [transport, setTransport] = useState('');
  const [cases, setCases] = useState<number | ''>('');

  // ========== SUPPLIER DETAILS ==========
  const [supplierName, setSupplierName] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierGSTIN, setSupplierGSTIN] = useState('');
  const [supplierDLNo, setSupplierDLNo] = useState('');
  const [supplierState, setSupplierState] = useState('Kerala');
  const [supplierStateCode, setSupplierStateCode] = useState('32');
  const [paymentType, setPaymentType] = useState('Cash');

  // ========== ITEMS ==========
  const [items, setItems] = useState<PurchaseItem[]>([
    {
      id: generateId(),
      slNo: 1,
      itemCode: '',
      itemName: '',
      batch: '',
      expiry: '',
      hsn: '',
      mfr: '',
      pack: 1,
      qty: 0,
      free: 0,
      rate: 0,
      mrp: 0,
      dis: 0,
      cgst: 2.5,
      sgst: 2.5,
      cgstAmt: 0,
      sgstAmt: 0,
      amount: 0,
    },
  ]);

  // ========== INVENTORY DATA ==========
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>(['Supplier A', 'Supplier B', 'Supplier C']);

  // ========== MODALS ==========
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [currentEditingRow, setCurrentEditingRow] = useState<number | null>(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  // ========== TOAST & PREVIEW ==========
  const [toast, setToast] = useState<{ show: boolean; messages: string[]; type: 'success' | 'error' }>({
    show: false,
    messages: [],
    type: 'success',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');

  // ========== REFS FOR NAVIGATION ==========
  const inputRefs = useRef<{ [k: string]: HTMLInputElement | null }>({});

  const showToast = (messages: string[], type: 'success' | 'error' = 'success') => {
    setToast({ show: true, messages, type });
    setTimeout(() => setToast({ show: false, messages: [], type: 'success' }), 5000);
  };

  /********************** LOAD INVENTORY **********************/
  useEffect(() => {
    loadInventoryData();
  }, []);

  const loadInventoryData = async () => {
    if (!window.inventory?.getAll) return;
    try {
      const products = await window.inventory.getAll();
      setAllProducts(products);
    } catch (error) {
      console.error('Failed to load inventory:', error);
    }
  };

  /********************** PRODUCT SEARCH **********************/
  useEffect(() => {
    if (!productSearchQuery.trim()) {
      setFilteredProducts([]);
      return;
    }
    const q = productSearchQuery.toLowerCase();
    const filtered = allProducts.filter(
      p =>
        p.itemName.toLowerCase().includes(q) ||
        p.itemCode.toLowerCase().includes(q) ||
        p.batch?.toLowerCase().includes(q) ||
        p.hsnCode.toLowerCase().includes(q)
    );
    setFilteredProducts(filtered.slice(0, 50));
  }, [productSearchQuery, allProducts]);

  const openProductSearch = (idx: number) => {
    setCurrentEditingRow(idx);
    setProductSearchQuery('');
    setShowProductSearch(true);
  };

  const selectProduct = (product: Product) => {
    if (currentEditingRow === null) return;

    const updatedItems = items.map((item, idx) => {
      if (idx === currentEditingRow) {
        return calculateRow({
          ...item,
          itemCode: product.itemCode,
          itemName: product.itemName,
          batch: product.batch || '',
          expiry: formatExpiry(product.expiryDate || ''),
          hsn: product.hsnCode,
          mfr: product.manufacturer || '',
          pack: product.packSize || 1,
          mrp: product.mrp,
          rate: product.purchasePrice,
          cgst: product.cgstRate,
          sgst: product.sgstRate,
        });
      }
      return item;
    });

    setItems(updatedItems);
    setShowProductSearch(false);
    setCurrentEditingRow(null);
    setTimeout(() => inputRefs.current[`${currentEditingRow}-qty`]?.focus(), 50);
  };

  /********************** ROW CALCULATIONS **********************/
  const calculateRow = (item: PurchaseItem): PurchaseItem => {
    const grossAmount = item.qty * item.rate;
    const discountAmount = (grossAmount * item.dis) / 100;
    const taxableAmount = grossAmount - discountAmount;
    const cgstAmt = (taxableAmount * item.cgst) / 100;
    const sgstAmt = (taxableAmount * item.sgst) / 100;
    const amount = taxableAmount + cgstAmt + sgstAmt;

    return {
      ...item,
      cgstAmt: Number(cgstAmt.toFixed(2)),
      sgstAmt: Number(sgstAmt.toFixed(2)),
      amount: Number(amount.toFixed(2)),
    };
  };

  const updateItem = (idx: number, field: keyof PurchaseItem, value: any) => {
    const updated = items.map((item, i) => {
      if (i === idx) {
        let newItem = { ...item, [field]: value };
        if (field === 'expiry' && typeof value === 'string') {
          newItem.expiry = formatExpiry(value);
        }
        return calculateRow(newItem);
      }
      return item;
    });
    setItems(updated);
  };

  const addRow = () => {
    const newRow: PurchaseItem = {
      id: generateId(),
      slNo: items.length + 1,
      itemCode: '',
      itemName: '',
      batch: '',
      expiry: '',
      hsn: '',
      mfr: '',
      pack: 1,
      qty: 0,
      free: 0,
      rate: 0,
      mrp: 0,
      dis: 0,
      cgst: 2.5,
      sgst: 2.5,
      cgstAmt: 0,
      sgstAmt: 0,
      amount: 0,
    };
    setItems([...items, newRow]);
  };

  const deleteRow = (idx: number) => {
    if (items.length === 1) return;
    const filtered = items.filter((_, i) => i !== idx);
    const renumbered = filtered.map((item, i) => ({ ...item, slNo: i + 1 }));
    setItems(renumbered);
  };

  const clearAll = () => {
    if (!confirm('Clear all fields? This will reset the entire form.')) return;
    setInvoiceNo('');
    setDueDate('');
    setOrderDate('');
    setLrNo('');
    setLrDate('');
    setTransport('');
    setCases('');
    setSupplierName('');
    setSupplierAddress('');
    setSupplierPhone('');
    setSupplierEmail('');
    setSupplierGSTIN('');
    setSupplierDLNo('');
    setSupplierState('Kerala');
    setSupplierStateCode('32');
    setPaymentType('Cash');
    setItems([{
      id: generateId(),
      slNo: 1,
      itemCode: '',
      itemName: '',
      batch: '',
      expiry: '',
      hsn: '',
      mfr: '',
      pack: 1,
      qty: 0,
      free: 0,
      rate: 0,
      mrp: 0,
      dis: 0,
      cgst: 2.5,
      sgst: 2.5,
      cgstAmt: 0,
      sgstAmt: 0,
      amount: 0,
    }]);
  };

  /********************** KEYBOARD NAVIGATION **********************/
  const columns = ['itemCode', 'itemName', 'batch', 'expiry', 'hsn', 'mfr', 'pack', 'qty', 'free', 'rate', 'mrp', 'dis', 'cgst', 'sgst'] as const;

  const handleKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === 'F3') {
      e.preventDefault();
      openProductSearch(rowIdx);
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
      if (rowIdx < items.length - 1) {
        inputRefs.current[`${rowIdx + 1}-${columns[colIdx]}`]?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx > 0) {
        inputRefs.current[`${rowIdx - 1}-${columns[colIdx]}`]?.focus();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rowIdx === items.length - 1) {
        addRow();
        setTimeout(() => inputRefs.current[`${items.length}-${columns[0]}`]?.focus(), 50);
      } else {
        inputRefs.current[`${rowIdx + 1}-${columns[colIdx]}`]?.focus();
      }
    }
  };

  /********************** TOTALS **********************/
  const totals = items.reduce(
    (acc, item) => {
      const grossAmount = item.qty * item.rate;
      const discountAmount = (grossAmount * item.dis) / 100;
      const taxableAmount = grossAmount - discountAmount;

      return {
        totalQty: acc.totalQty + item.qty,
        totalFree: acc.totalFree + item.free,
        taxable: acc.taxable + taxableAmount,
        cgst: acc.cgst + item.cgstAmt,
        sgst: acc.sgst + item.sgstAmt,
        totalGST: acc.totalGST + item.cgstAmt + item.sgstAmt,
        grandTotal: acc.grandTotal + item.amount,
      };
    },
    { totalQty: 0, totalFree: 0, taxable: 0, cgst: 0, sgst: 0, totalGST: 0, grandTotal: 0 }
  );

  /********************** SAVE PURCHASE **********************/
  // In PurchaseInvoice.tsx - Update the savePurchase function:
  const savePurchase = async () => {
    if (!invoiceNo.trim()) {
      showToast(['❌ Invoice number is required'], 'error');
      return;
    }
  
    const validItems = items.filter(item => item.itemName.trim() && item.qty > 0);
    if (validItems.length === 0) {
      showToast(['❌ Add at least one product with quantity'], 'error');
      return;
    }
  
    const messages: string[] = [];
  
    try {
      // ✅ Save to Purchase DB via IPC (SQLite backend)
      if (!window.purchase?.create) {
        showToast(['❌ Purchase API not available'], 'error');
        return;
      }
  
      const record = {
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
          name: supplierName || 'N/A',
          address: supplierAddress || '',
          phone: supplierPhone || '',
          gstin: supplierGSTIN || '',
          state: supplierState || 'Kerala',
          stateCode: supplierStateCode || '32',
        },
        items: validItems.map(item => ({
          id: item.id,
          slNo: item.slNo,
          qty: item.qty,
          free: item.free,
          mfr: item.mfr,
          pack: item.pack,
          productName: item.itemName,
          batch: item.batch,
          exp: item.expiry,
          hsn: item.hsn,
          mrp: item.mrp,
          rate: item.rate,
          dis: item.dis,
          sgst: item.sgst,
          sgstValue: item.sgstAmt,
          cgst: item.cgst,
          cgstValue: item.cgstAmt,
          value: item.amount,
        })),
        totals: {
          totalQty: totals.totalQty,
          totalFree: totals.totalFree,
          scheme: 0,
          discount: 0,
          sgst: totals.sgst,
          cgst: totals.cgst,
          totalGST: totals.totalGST,
          total: totals.grandTotal,
        },
        createdAt: new Date().toISOString(),
      };
  
      // ✅ Save via IPC to SQLite
      await window.purchase.create(record);
      messages.push('✅ Purchase DB: Successfully saved to SQLite');
  
      // Update Inventory (existing code is correct)
      if (window.inventory) {
        for (const item of validItems) {
          const products = await window.inventory.search(item.itemCode);
          const existingProduct = products.find(
            p => p.itemCode === item.itemCode && p.batch === item.batch
          );
  
          if (existingProduct) {
            await window.inventory.incrementStockByCodeBatch(item.itemCode, item.batch, item.qty + item.free);
            await window.inventory.updateProduct(existingProduct.id, {
              mrp: item.mrp,
              purchasePrice: item.rate,
              sellingPriceTab: item.mrp * 0.9,
              expiryDate: item.expiry,
              hsnCode: item.hsn,
              manufacturer: item.mfr,
              packSize: item.pack,
              cgstRate: item.cgst,
              sgstRate: item.sgst,
            });
          } else {
            await window.inventory.addProduct({
              itemCode: item.itemCode,
              itemName: item.itemName,
              batch: item.batch,
              expiryDate: item.expiry,
              hsnCode: item.hsn,
              manufacturer: item.mfr,
              pack: item.pack.toString(),
              packSize: item.pack,
              mrp: item.mrp,
              purchasePrice: item.rate,
              sellingPriceTab: item.mrp * 0.9,
              stockQuantity: item.qty + item.free,
              cgstRate: item.cgst,
              sgstRate: item.sgst,
              igstRate: 0,
              category: 'General',
              rol: 10,
              minStockLevel: 10,
              maxStockLevel: 100,
              prTaxIncluded: false,
              slTaxIncluded: false,
              hasExpiryDate: item.expiry ? true : false,
              regionalName: '',
              altUnit: '',
            });
          }
        }
        messages.push('✅ Inventory DB: Successfully updated');
        await loadInventoryData();
      }
  
      // Generate print template
      const html = buildProfessionalA4PrintHTML(validItems);
      setPreviewHTML(html);
      setShowPreview(true);
  
      showToast(messages, 'success');
    } catch (error) {
      console.error('Failed to save purchase:', error);
      showToast(['❌ Failed to save purchase invoice'], 'error');
    }
  };
  
  /********************** BUILD PROFESSIONAL A4 PRINT TEMPLATE **********************/
  const buildProfessionalA4PrintHTML = (validItems: PurchaseItem[]) => {
    const ITEMS_PER_PAGE = 12;
    const pages: PurchaseItem[][] = [];
    
    for (let i = 0; i < validItems.length; i += ITEMS_PER_PAGE) {
      pages.push(validItems.slice(i, i + ITEMS_PER_PAGE));
    }

    const renderPage = (pageItems: PurchaseItem[], pageNum: number, isLastPage: boolean) => `
      <div class="page">
        <!-- HEADER -->
        <div class="header">
          <h1>PURCHASE INVOICE</h1>
          <div class="header-info">
            <div class="col">
              <p><strong>Invoice No:</strong> ${invoiceNo}</p>
              <p><strong>Invoice Date:</strong> ${new Date(invoiceDate).toLocaleDateString('en-IN')}</p>
              <p><strong>Due Date:</strong> ${dueDate ? new Date(dueDate).toLocaleDateString('en-IN') : '-'}</p>
            </div>
            <div class="col">
              <p><strong>Order Date:</strong> ${orderDate ? new Date(orderDate).toLocaleDateString('en-IN') : '-'}</p>
              <p><strong>Payment Type:</strong> ${paymentType}</p>
              <p><strong>Cases:</strong> ${cases || 0}</p>
            </div>
          </div>
        </div>

        <!-- SUPPLIER DETAILS -->
        <div class="party-details">
          <h3>SUPPLIER DETAILS</h3>
          <div class="party-grid">
            <div><strong>Name:</strong> ${supplierName || 'N/A'}</div>
            <div><strong>GSTIN:</strong> ${supplierGSTIN || 'N/A'}</div>
            <div><strong>Address:</strong> ${supplierAddress || 'N/A'}</div>
            <div><strong>Phone:</strong> ${supplierPhone || 'N/A'}</div>
            <div><strong>State:</strong> ${supplierState} (${supplierStateCode})</div>
            <div><strong>DL No:</strong> ${supplierDLNo || 'N/A'}</div>
          </div>
        </div>

        ${lrNo || transport ? `
        <div class="transport-details">
          <div><strong>LR No:</strong> ${lrNo || '-'}</div>
          <div><strong>LR Date:</strong> ${lrDate ? new Date(lrDate).toLocaleDateString('en-IN') : '-'}</div>
          <div><strong>Transport:</strong> ${transport || '-'}</div>
        </div>
        ` : ''}

        <!-- ITEMS TABLE -->
        <table>
          <thead>
            <tr>
              <th style="width:25px;">#</th>
              <th style="width:250px;">Item Name</th>
              <th style="width:70px;">Batch</th>
              <th style="width:55px;">Expiry</th>
              <th style="width:60px;">HSN</th>
              <th style="width:40px;">Qty</th>
              <th style="width:35px;">Free</th>
              <th style="width:70px;">Rate</th>
              <th style="width:70px;">MRP</th>
              <th style="width:45px;">Dis%</th>
              <th style="width:70px;">Taxable</th>
              <th style="width:60px;">GST</th>
              <th style="width:80px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${pageItems.map(item => {
              const taxable = (item.qty * item.rate) * (1 - item.dis / 100);
              const gstAmt = item.cgstAmt + item.sgstAmt;
              return `
              <tr>
                <td class="center">${item.slNo}</td>
                <td>${item.itemName}</td>
                <td class="center">${item.batch}</td>
                <td class="center">${item.expiry}</td>
                <td class="center">${item.hsn}</td>
                <td class="center">${item.qty}</td>
                <td class="center">${item.free}</td>
                <td class="right">${item.rate.toFixed(2)}</td>
                <td class="right">${item.mrp.toFixed(2)}</td>
                <td class="center">${item.dis}%</td>
                <td class="right">${taxable.toFixed(2)}</td>
                <td class="right">${gstAmt.toFixed(2)}</td>
                <td class="right"><strong>${item.amount.toFixed(2)}</strong></td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        ${isLastPage ? `
        <!-- TOTALS (ONLY ON LAST PAGE) -->
        <div class="totals">
          <div class="totals-grid">
            <div class="totals-row">
              <span>Total Quantity:</span>
              <strong>${totals.totalQty}</strong>
            </div>
            <div class="totals-row">
              <span>Total Free:</span>
              <strong>${totals.totalFree}</strong>
            </div>
            <div class="totals-row">
              <span>Taxable Amount:</span>
              <strong>₹${totals.taxable.toFixed(2)}</strong>
            </div>
            <div class="totals-row">
              <span>CGST:</span>
              <strong>₹${totals.cgst.toFixed(2)}</strong>
            </div>
            <div class="totals-row">
              <span>SGST:</span>
              <strong>₹${totals.sgst.toFixed(2)}</strong>
            </div>
            <div class="totals-row">
              <span>Total GST:</span>
              <strong>₹${totals.totalGST.toFixed(2)}</strong>
            </div>
            <div class="totals-row grand">
              <span>GRAND TOTAL:</span>
              <strong>₹${totals.grandTotal.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        <!-- FOOTER (ONLY ON LAST PAGE) -->
        <div class="footer">
          <div class="footer-left">
            <p><strong>Terms & Conditions:</strong></p>
            <p>1. Goods once sold will not be taken back</p>
            <p>2. Subject to jurisdiction only</p>
          </div>
          <div class="footer-right">
            <p style="margin-top: 30px;"><strong>Authorized Signature</strong></p>
          </div>
        </div>
        ` : ''}

        <div class="page-number">Page ${pageNum} of ${pages.length}</div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Purchase Invoice ${invoiceNo}</title>
          <style>
            @page { 
              size: A4; 
              margin: 10mm; 
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body { 
              font-family: 'Arial', sans-serif;
              font-size: 10px;
              color: #000;
              line-height: 1.3;
            }
            
            .page {
              page-break-after: always;
              position: relative;
              height: 277mm;
              padding: 8mm;
            }
            
            .page:last-child {
              page-break-after: auto;
            }
            
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 8px;
              margin-bottom: 10px;
            }
            
            .header h1 {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 8px;
            }
            
            .header-info {
              display: flex;
              justify-content: space-between;
              text-align: left;
              font-size: 9px;
            }
            
            .header-info .col {
              flex: 1;
            }
            
            .header-info p {
              margin: 2px 0;
            }
            
            .party-details {
              border: 1px solid #000;
              padding: 6px;
              margin-bottom: 8px;
            }
            
            .party-details h3 {
              font-size: 11px;
              margin-bottom: 5px;
              border-bottom: 1px solid #000;
              padding-bottom: 3px;
            }
            
            .party-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 4px;
              font-size: 9px;
            }
            
            .transport-details {
              display: flex;
              justify-content: space-between;
              border: 1px solid #000;
              padding: 4px 6px;
              margin-bottom: 8px;
              font-size: 9px;
            }
            
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 10px;
            }
            
            th, td {
              border: 1px solid #000;
              padding: 4px 3px;
              font-size: 9px;
            }
            
            th {
              background: #f0f0f0;
              font-weight: bold;
              text-align: center;
            }
            
            td.center {
              text-align: center;
            }
            
            td.right {
              text-align: right;
            }
            
            .totals {
              border: 2px solid #000;
              padding: 8px;
              margin-top: 10px;
            }
            
            .totals-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 5px;
            }
            
            .totals-row {
              display: flex;
              justify-content: space-between;
              padding: 3px 0;
              border-bottom: 1px dotted #ccc;
            }
            
            .totals-row.grand {
              border-top: 2px solid #000;
              border-bottom: 2px solid #000;
              font-size: 12px;
              padding: 5px 0;
              margin-top: 5px;
              grid-column: 1 / -1;
            }
            
            .footer {
              position: absolute;
              bottom: 15mm;
              left: 8mm;
              right: 8mm;
              display: flex;
              justify-content: space-between;
              border-top: 1px solid #000;
              padding-top: 8px;
              font-size: 9px;
            }
            
            .footer-left {
              flex: 1;
            }
            
            .footer-left p {
              margin: 2px 0;
            }
            
            .footer-right {
              text-align: right;
              flex: 1;
            }
            
            .page-number {
              position: absolute;
              bottom: 5mm;
              right: 8mm;
              font-size: 8px;
              color: #666;
            }
            
            @media print {
              body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          ${pages.map((pageItems, i) => renderPage(pageItems, i + 1, i === pages.length - 1)).join('')}
        </body>
      </html>
    `;
  };

  const handlePrint = () => {
    const iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
    iframe?.contentWindow?.print();
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    clearAll();
  };

  // ========== FIXED CLOSE BUTTON HANDLER ==========
  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  /********************** GLOBAL SHORTCUTS **********************/
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        savePurchase();
      }
      if (e.key === 'Escape') {
        if (showProductSearch) {
          setShowProductSearch(false);
        } else if (showPreview) {
          handleClosePreview();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showProductSearch, showPreview, onClose]);

  // ✅ CONTINUE TO PART 2 FOR COMPLETE UI RENDERING...
  // ✅ CONTINUATION FROM PART 1 - COMPLETE FULLSCREEN UI WITH ALL FIELDS EDITABLE

  return (
    <>
      <div className="fixed inset-0 bg-white z-50 overflow-hidden flex flex-col">
        {/* ========== HEADER BAR (WORKING CLOSE BUTTON) ========== */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-3 py-2 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <h2 className="text-base font-bold">Purchase Invoice Entry</h2>
            <p className="text-[9px] text-white/80">F3: Search • Arrows/Tab: Navigate • Enter: Add Row • Ctrl+S: Save • Esc: Close</p>
          </div>
          <button 
            onClick={handleClose}
            type="button"
            className="px-3 py-1 bg-white/20 rounded text-xs hover:bg-white/30 font-bold transition-colors cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        {/* ========== COMPLETE HEADER SECTION WITH ALL FIELDS ========== */}
        <div className="px-3 py-2 bg-slate-50 border-b overflow-y-auto" style={{maxHeight: '180px'}}>
          <h3 className="text-[10px] font-bold text-slate-700 mb-2 border-b pb-1">📋 Invoice & Supplier Details</h3>
          
          {/* Row 1: Invoice Details */}
          <div className="grid grid-cols-6 gap-2 mb-2">
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Invoice No *</label>
              <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none font-mono font-bold" placeholder="INV-001" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Invoice Date *</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Order Date</label>
              <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Payment Type</label>
              <select value={paymentType} onChange={e => setPaymentType(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none font-semibold">
                <option>Cash</option>
                <option>Credit</option>
                <option>Card</option>
                <option>UPI</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Cases</label>
              <input type="number" value={cases} onChange={e => setCases(e.target.value ? Number(e.target.value) : '')} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" min="0" placeholder="0" />
            </div>
          </div>

          {/* Row 2: Supplier Details */}
          <div className="grid grid-cols-6 gap-2 mb-2">
            <div className="col-span-2">
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Supplier Name *</label>
              <div className="flex space-x-1">
                <select value={supplierName} onChange={e => setSupplierName(e.target.value)} className="flex-1 px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none">
                  <option value="">Select Supplier</option>
                  {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} className="flex-1 px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" placeholder="Or type new" />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Address</label>
              <input value={supplierAddress} onChange={e => setSupplierAddress(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" placeholder="Full Address" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Phone</label>
              <input value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" placeholder="Phone" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Email</label>
              <input type="email" value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" placeholder="Email" />
            </div>
          </div>

          {/* Row 3: GST, Transport, LR Details */}
          <div className="grid grid-cols-8 gap-2">
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">GSTIN</label>
              <input value={supplierGSTIN} onChange={e => setSupplierGSTIN(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none font-mono" placeholder="29AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">DL No</label>
              <input value={supplierDLNo} onChange={e => setSupplierDLNo(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none font-mono" placeholder="DL-12345" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">State</label>
              <input value={supplierState} onChange={e => setSupplierState(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" placeholder="Kerala" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">State Code</label>
              <input value={supplierStateCode} onChange={e => setSupplierStateCode(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none font-mono" placeholder="32" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">LR No</label>
              <input value={lrNo} onChange={e => setLrNo(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" placeholder="LR12345" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">LR Date</label>
              <input type="date" value={lrDate} onChange={e => setLrDate(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-[9px] font-bold text-slate-700 mb-0.5">Transport Details</label>
              <input value={transport} onChange={e => setTransport(e.target.value)} className="w-full px-2 py-1 border-2 rounded text-[10px] focus:border-blue-500 focus:outline-none" placeholder="Transport Company Name" />
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t">
            <div className="flex items-center space-x-2">
              <button onClick={addRow} className="px-3 py-1 bg-blue-500 text-white rounded text-[10px] hover:bg-blue-600 font-bold">+ Add Row</button>
              <button onClick={clearAll} className="px-3 py-1 bg-red-500 text-white rounded text-[10px] hover:bg-red-600 font-bold">🗑️ Clear All</button>
            </div>
            <button onClick={savePurchase} className="px-5 py-1.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded text-[10px] hover:from-emerald-600 hover:to-green-700 font-bold shadow-lg">💾 Save Invoice (Ctrl+S)</button>
          </div>
        </div>

        {/* ========== FULLSCREEN EXCEL TABLE (ALL FIELDS EDITABLE) ========== */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead className="bg-slate-700 text-white sticky top-0 z-10">
              <tr>
                <th className="px-1 py-1.5 border text-center" style={{width:'30px'}}>#</th>
                <th className="px-1 py-1.5 border text-left" style={{width:'100px'}}>Code</th>
                <th className="px-1 py-1.5 border text-left" style={{minWidth:'200px'}}>Item Name (F3)</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'90px'}}>Batch</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'70px'}}>Expiry</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'80px'}}>HSN</th>
                <th className="px-1 py-1.5 border text-left" style={{width:'100px'}}>Manufacturer</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'50px'}}>Pack</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'60px'}}>Qty</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'50px'}}>Free</th>
                <th className="px-1 py-1.5 border text-right" style={{width:'75px'}}>Rate</th>
                <th className="px-1 py-1.5 border text-right" style={{width:'75px'}}>MRP</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'55px'}}>Dis%</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'60px'}}>CGST%</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'60px'}}>SGST%</th>
                <th className="px-1 py-1.5 border text-right" style={{width:'85px'}}>Amount</th>
                <th className="px-1 py-1.5 border text-center" style={{width:'40px'}}>Del</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} className="border-b hover:bg-blue-50">
                  <td className="px-1 py-0.5 border text-center text-[9px] font-bold">{item.slNo}</td>
                  
                  {/* Item Code - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-itemCode`] = el}
                      value={item.itemCode}
                      onChange={e => updateItem(idx, 'itemCode', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 0)}
                      className="w-full px-1 py-0.5 text-[10px] font-mono border-0 outline-none focus:bg-yellow-50"
                      placeholder="Code"
                    />
                  </td>
                  
                  {/* Item Name - EDITABLE + Search Button */}
                  <td className="px-1 py-0.5 border">
                    <div className="flex space-x-1">
                      <input
                        ref={el => inputRefs.current[`${idx}-itemName`] = el}
                        value={item.itemName}
                        onChange={e => updateItem(idx, 'itemName', e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 1)}
                        className="flex-1 px-1 py-0.5 text-[10px] border-0 outline-none focus:bg-yellow-50"
                        placeholder="Type name or press F3"
                      />
                      <button onClick={() => openProductSearch(idx)} className="px-1 py-0.5 bg-blue-500 text-white rounded text-[9px] hover:bg-blue-600 flex-shrink-0" title="Search (F3)">🔍</button>
                    </div>
                  </td>
                  
                  {/* Batch - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-batch`] = el}
                      value={item.batch}
                      onChange={e => updateItem(idx, 'batch', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 2)}
                      className="w-full px-1 py-0.5 text-[10px] font-mono text-center border-0 outline-none focus:bg-yellow-50"
                      placeholder="Batch"
                    />
                  </td>
                  
                  {/* Expiry - EDITABLE with auto-format */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-expiry`] = el}
                      value={item.expiry}
                      onChange={e => updateItem(idx, 'expiry', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 3)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50 text-purple-700 font-bold"
                      placeholder="MM/YY"
                      maxLength={5}
                    />
                  </td>
                  
                  {/* HSN - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-hsn`] = el}
                      value={item.hsn}
                      onChange={e => updateItem(idx, 'hsn', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 4)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50"
                      placeholder="HSN"
                    />
                  </td>
                  
                  {/* Manufacturer - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-mfr`] = el}
                      value={item.mfr}
                      onChange={e => updateItem(idx, 'mfr', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 5)}
                      className="w-full px-1 py-0.5 text-[10px] border-0 outline-none focus:bg-yellow-50"
                      placeholder="MFR"
                    />
                  </td>
                  
                  {/* Pack - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-pack`] = el}
                      type="number"
                      min={1}
                      value={item.pack || ''}
                      onChange={e => updateItem(idx, 'pack', Number(e.target.value) || 1)}
                      onKeyDown={e => handleKeyDown(e, idx, 6)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50"
                      placeholder="1"
                    />
                  </td>
                  
                  {/* Qty - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-qty`] = el}
                      type="number"
                      min={0}
                      value={item.qty || ''}
                      onChange={e => updateItem(idx, 'qty', Number(e.target.value) || 0)}
                      onKeyDown={e => handleKeyDown(e, idx, 7)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50 font-bold"
                      placeholder="0"
                    />
                  </td>
                  
                  {/* Free - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-free`] = el}
                      type="number"
                      min={0}
                      value={item.free || ''}
                      onChange={e => updateItem(idx, 'free', Number(e.target.value) || 0)}
                      onKeyDown={e => handleKeyDown(e, idx, 8)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50"
                      placeholder="0"
                    />
                  </td>
                  
                  {/* Rate - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-rate`] = el}
                      type="number"
                      step="0.01"
                      min={0}
                      value={item.rate || ''}
                      onChange={e => updateItem(idx, 'rate', Number(e.target.value) || 0)}
                      onKeyDown={e => handleKeyDown(e, idx, 9)}
                      className="w-full px-1 py-0.5 text-[10px] text-right border-0 outline-none focus:bg-yellow-50 font-bold text-green-700"
                      placeholder="0.00"
                    />
                  </td>
                  
                  {/* MRP - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-mrp`] = el}
                      type="number"
                      step="0.01"
                      min={0}
                      value={item.mrp || ''}
                      onChange={e => updateItem(idx, 'mrp', Number(e.target.value) || 0)}
                      onKeyDown={e => handleKeyDown(e, idx, 10)}
                      className="w-full px-1 py-0.5 text-[10px] text-right border-0 outline-none focus:bg-yellow-50"
                      placeholder="0.00"
                    />
                  </td>
                  
                  {/* Discount - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-dis`] = el}
                      type="number"
                      step="0.1"
                      min={0}
                      max={100}
                      value={item.dis || ''}
                      onChange={e => updateItem(idx, 'dis', Number(e.target.value) || 0)}
                      onKeyDown={e => handleKeyDown(e, idx, 11)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50"
                      placeholder="0"
                    />
                  </td>
                  
                  {/* CGST - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-cgst`] = el}
                      type="number"
                      step="0.1"
                      min={0}
                      value={item.cgst || ''}
                      onChange={e => updateItem(idx, 'cgst', Number(e.target.value) || 0)}
                      onKeyDown={e => handleKeyDown(e, idx, 12)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50"
                      placeholder="0"
                    />
                  </td>
                  
                  {/* SGST - EDITABLE */}
                  <td className="px-1 py-0.5 border">
                    <input
                      ref={el => inputRefs.current[`${idx}-sgst`] = el}
                      type="number"
                      step="0.1"
                      min={0}
                      value={item.sgst || ''}
                      onChange={e => updateItem(idx, 'sgst', Number(e.target.value) || 0)}
                      onKeyDown={e => handleKeyDown(e, idx, 13)}
                      className="w-full px-1 py-0.5 text-[10px] text-center border-0 outline-none focus:bg-yellow-50"
                      placeholder="0"
                    />
                  </td>
                  
                  {/* Amount - Calculated */}
                  <td className="px-1 py-0.5 border text-right text-[10px] font-bold text-blue-700">{item.amount.toFixed(2)}</td>
                  
                  {/* Delete Button */}
                  <td className="px-1 py-0.5 border text-center">
                    {items.length > 1 && (
                      <button onClick={() => deleteRow(idx)} className="px-1 py-0.5 text-red-600 hover:bg-red-50 rounded text-[9px]" title="Delete Row">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100 font-bold sticky bottom-0">
              <tr>
                <td colSpan={8} className="px-2 py-1.5 border text-right text-[10px]">TOTAL</td>
                <td className="px-2 py-1.5 border text-center text-[10px] text-blue-700">{totals.totalQty}</td>
                <td className="px-2 py-1.5 border text-center text-[10px] text-purple-700">{totals.totalFree}</td>
                <td colSpan={5} className="px-2 py-1.5 border"></td>
                <td className="px-2 py-1.5 border text-right text-[10px] text-blue-700">{totals.grandTotal.toFixed(2)}</td>
                <td className="border"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ========== FOOTER SUMMARY ========== */}
        <div className="px-3 py-1.5 bg-slate-50 border-t flex items-center justify-between">
          <div className="flex items-center space-x-6 text-[10px]">
            <div><span className="text-slate-600">Taxable:</span> <span className="font-bold">₹{totals.taxable.toFixed(2)}</span></div>
            <div><span className="text-slate-600">CGST:</span> <span className="font-bold text-green-700">₹{totals.cgst.toFixed(2)}</span></div>
            <div><span className="text-slate-600">SGST:</span> <span className="font-bold text-green-700">₹{totals.sgst.toFixed(2)}</span></div>
            <div><span className="text-slate-600">Total GST:</span> <span className="font-bold text-orange-700">₹{totals.totalGST.toFixed(2)}</span></div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-slate-500">GRAND TOTAL</div>
            <div className="text-xl font-bold text-blue-700">₹{totals.grandTotal.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* ========== PRODUCT SEARCH MODAL ========== */}
      {showProductSearch && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between">
              <h3 className="text-lg font-bold">🔍 Search Product from Inventory</h3>
              <button onClick={() => setShowProductSearch(false)} className="px-3 py-1 bg-white/20 rounded hover:bg-white/30 transition-colors font-bold">✕</button>
            </div>
            <div className="p-6">
              <input type="text" value={productSearchQuery} onChange={e => setProductSearchQuery(e.target.value)} placeholder="Search by name, code, batch, or HSN..." className="w-full px-4 py-3 text-sm border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none mb-4" autoFocus />
              <div className="max-h-[400px] overflow-auto">
                {filteredProducts.length > 0 ? (
                  <div className="space-y-2">
                    {filteredProducts.map((p, i) => (
                      <div key={i} onClick={() => selectProduct(p)} className="p-4 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all">
                        <div className="flex justify-between">
                          <div className="flex-1">
                            <div className="font-bold text-slate-800">{p.itemName}</div>
                            <div className="text-xs text-slate-600 mt-1 font-mono">{p.itemCode} | Batch: <span className="font-bold">{p.batch || 'N/A'}</span> | HSN: <span className="font-bold">{p.hsnCode}</span></div>
                            <div className="text-xs text-slate-600 mt-1">MFR: {p.manufacturer || 'N/A'} | Exp: {p.expiryDate || 'N/A'}</div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-sm">Stock: <span className="font-bold text-blue-700">{p.stockQuantity}</span></div>
                            <div className="text-sm">MRP: <span className="font-bold">₹{p.mrp.toFixed(2)}</span></div>
                            <div className="text-xs text-slate-600">GST: {p.cgstRate + p.sgstRate}%</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500">{productSearchQuery ? 'No products found' : 'Type to search...'}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== PREVIEW MODAL WITH PROFESSIONAL A4 PRINT ========== */}
      {showPreview && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl h-[90vh] rounded-lg shadow-2xl flex flex-col">
            <div className="px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-700 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">📄 Purchase Invoice Preview (A4 Format)</h3>
              <div className="flex space-x-2">
                <button onClick={handlePrint} className="px-4 py-2 bg-emerald-500 rounded text-sm hover:bg-emerald-600 font-bold">🖨️ Print</button>
                <button onClick={handleClosePreview} className="px-3 py-2 bg-white/20 rounded text-sm hover:bg-white/30 font-bold">✕ Close & Clear</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100">
              <iframe
                id="print-iframe"
                srcDoc={previewHTML}
                className="w-full h-full border-0"
                title="Invoice Preview"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========== TOAST NOTIFICATION ========== */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[200] ${toast.type === 'success' ? 'bg-gradient-to-r from-emerald-500 to-green-600' : 'bg-gradient-to-r from-rose-500 to-red-600'} text-white px-6 py-4 rounded-lg shadow-2xl animate-slideIn max-w-md`}>
          <div className="space-y-1">
            {toast.messages.map((msg, i) => (
              <div key={i} className="text-sm font-semibold">{msg}</div>
            ))}
          </div>
        </div>
      )}

      {/* ========== CSS ANIMATIONS ========== */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
      `}</style>
    </>
  );
}
