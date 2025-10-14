import { useState, useEffect, useRef } from 'react';
import { getAllProducts, Product, updateStock } from '../services/inventoryDB';
import { addInvoice, PaymentDetail, InvoiceItem } from '../services/invoiceDB';
import { useAuth } from '../contexts/AuthContext';
import InvoicePrintPreview from './InvoicePrintPreview';

export default function PharmacyInvoiceForm({ onSubmit }: any) {
  const { userData } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState<any>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [editingCell, setEditingCell] = useState<{row: number; field: string} | null>(null);
  
  const [invoiceData, setInvoiceData] = useState({
    invoiceNumber: `PH-${Date.now()}`,
    invoiceDate: new Date().toISOString().split('T')[0],
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    doctorName: '',
    hospitalName: '',
    items: [] as InvoiceItem[],
    subtotal: 0,
    discount: 0,
    cgstTotal: 0,
    sgstTotal: 0,
    taxAmount: 0,
    roundOff: 0,
    total: 0,
    payments: [] as PaymentDetail[],
    status: 'pending' as 'paid' | 'pending' | 'partial',
    notes: '',
    terms: 'Payment due within 30 days',
  });

  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = products.filter(p =>
        p.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.shortKey.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProducts(filtered);
      setSelectedIndex(0);
    } else {
      setFilteredProducts(products);
    }
  }, [searchTerm, products]);

  useEffect(() => {
    calculateTotals();
  }, [invoiceData.items, invoiceData.discount]);

  const fetchProducts = async () => {
    const allProducts = await getAllProducts();
    setProducts(allProducts);
    setFilteredProducts(allProducts);
  };

  const handleProductSelect = (product: Product) => {
    if (product.stockQuantity <= 0) {
      alert('This product is out of stock!');
      return;
    }

    // Calculate amounts
    const grossAmount = product.mrp * 1;
    const cgstAmount = grossAmount * (product.cgstRate / 100);
    const sgstAmount = grossAmount * (product.sgstRate / 100);
    const total = grossAmount + cgstAmount + sgstAmount;

    const newItem: InvoiceItem = {
      productId: product.id,
      productName: product.productName,
      productCode: product.productCode,
      hsnCode: product.hsnCode || '',
      batch: product.batch || '',
      expiryDate: product.expiryDate || '',
      quantity: 1,
      pack: product.pack || '1',
      mrp: product.mrp,
      rate: product.sellingPrice,
      grossAmount: grossAmount,
      cgstPercent: product.cgstRate,
      cgstAmount: cgstAmount,
      sgstPercent: product.sgstRate,
      sgstAmount: sgstAmount,
      discount: 0,
      total: total,
      price: 0,
      taxRate: 0
    };

    setInvoiceData({
      ...invoiceData,
      items: [...invoiceData.items, newItem],
    });

    setSearchTerm('');
    setShowProductSearch(false);
    searchInputRef.current?.focus();
  };

  const updateItemField = (index: number, field: string, value: any) => {
    const updatedItems = [...invoiceData.items];
    const item = updatedItems[index];

    // Update the field
    (item as any)[field] = value;

    // Recalculate based on field changed
    if (['quantity', 'rate', 'discount', 'cgstPercent', 'sgstPercent'].includes(field)) {
      const grossAmount = item.rate * item.quantity;
      item.grossAmount = grossAmount;
      
      const afterDiscount = grossAmount - item.discount;
      const cgstAmount = afterDiscount * (item.cgstPercent / 100);
      const sgstAmount = afterDiscount * (item.sgstPercent / 100);
      
      item.cgstAmount = cgstAmount;
      item.sgstAmount = sgstAmount;
      item.total = afterDiscount + cgstAmount + sgstAmount;
    }

    setInvoiceData({ ...invoiceData, items: updatedItems });
  };

  const removeItem = (index: number) => {
    const updatedItems = invoiceData.items.filter((_, i) => i !== index);
    setInvoiceData({ ...invoiceData, items: updatedItems });
  };

  const calculateTotals = () => {
    const subtotal = invoiceData.items.reduce((sum, item) => sum + item.grossAmount, 0);
    const totalDiscount = invoiceData.items.reduce((sum, item) => sum + item.discount, 0) + invoiceData.discount;
    const cgstTotal = invoiceData.items.reduce((sum, item) => sum + item.cgstAmount, 0);
    const sgstTotal = invoiceData.items.reduce((sum, item) => sum + item.sgstAmount, 0);
    const taxAmount = cgstTotal + sgstTotal;
    
    const beforeRound = subtotal - totalDiscount + taxAmount;
    const total = Math.round(beforeRound);
    const roundOff = total - beforeRound;

    setInvoiceData(prev => ({
      ...prev,
      subtotal,
      cgstTotal,
      sgstTotal,
      taxAmount,
      roundOff,
      total,
    }));
  };

  const handleCellEdit = (rowIndex: number, field: string, value: any) => {
    updateItemField(rowIndex, field, value);
    setEditingCell(null);
  };

  const handlePayment = () => {
    if (invoiceData.items.length === 0) {
      alert('Please add items to the invoice');
      return;
    }
    if (!invoiceData.customerName) {
      alert('Please enter customer name');
      return;
    }
    setShowPaymentModal(true);
  };

  const handleSubmit = async (payments: PaymentDetail[]) => {
    try {
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const status = totalPaid >= invoiceData.total ? 'paid' : totalPaid > 0 ? 'partial' : 'pending';

      const finalInvoice = {
        ...invoiceData,
        payments,
        status,
      };

      const savedInvoice = await addInvoice(finalInvoice);
      
      // Deduct stock
      for (const item of invoiceData.items) {
        await updateStock(item.productId, -item.quantity, 'add');
      }

      setSavedInvoice(savedInvoice);
      onSubmit(finalInvoice);
      setShowPaymentModal(false);
      setShowPrintPreview(true);
    } catch (error) {
      console.error('Error saving invoice:', error);
      alert('Failed to save invoice');
    }
  };

  const resetForm = () => {
    setInvoiceData({
      invoiceNumber: `PH-${Date.now()}`,
      invoiceDate: new Date().toISOString().split('T')[0],
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      doctorName: '',
      hospitalName: '',
      items: [],
      subtotal: 0,
      discount: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      taxAmount: 0,
      roundOff: 0,
      total: 0,
      payments: [],
      status: 'pending',
      notes: '',
      terms: 'Payment due within 30 days',
    });
    setSearchTerm('');
  };

  return (
    <>
      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          totalAmount={invoiceData.total}
          onClose={() => setShowPaymentModal(false)}
          onSubmit={handlePayment}
        />
      )}

      {showPrintPreview && (
        <InvoicePrintPreview
          // invoice={{ ...invoiceData, id: savedInvoice?.id || invoiceData.invoiceNumber }}
          companyData={userData}
          onClose={() => {
            setShowPrintPreview(false);
            resetForm();
          } } invoice={undefined}        />
      )}

      <div className="h-[calc(100vh-180px)] flex flex-col space-y-2">
        {/* Top Bar - Compact */}
        <div className="bg-white border-2 border-slate-300 rounded-lg shadow-sm">
          <div className="grid grid-cols-12 gap-2 p-2">
            {/* Left Column - Customer Details */}
            <div className="col-span-6 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Bill No</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-slate-50 font-bold"
                  value={invoiceData.invoiceNumber}
                  readOnly
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Date</label>
                <input
                  type="date"
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                  value={invoiceData.invoiceDate}
                  onChange={(e) => setInvoiceData({ ...invoiceData, invoiceDate: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Customer Name *</label>
                <input
                  type="text"
                  required
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                  placeholder="Enter customer name"
                  value={invoiceData.customerName}
                  onChange={(e) => setInvoiceData({ ...invoiceData, customerName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Phone</label>
                <input
                  type="tel"
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                  placeholder="Mobile"
                  value={invoiceData.customerPhone}
                  onChange={(e) => setInvoiceData({ ...invoiceData, customerPhone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Address</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                  placeholder="Address"
                  value={invoiceData.customerAddress}
                  onChange={(e) => setInvoiceData({ ...invoiceData, customerAddress: e.target.value })}
                />
              </div>
            </div>

            {/* Right Column - Doctor/Hospital Details */}
            <div className="col-span-6 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Doctor Name</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                  placeholder="Dr. Name"
                  value={invoiceData.doctorName}
                  onChange={(e) => setInvoiceData({ ...invoiceData, doctorName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Hospital/Clinic</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded"
                  placeholder="Hospital name"
                  value={invoiceData.hospitalName}
                  onChange={(e) => setInvoiceData({ ...invoiceData, hospitalName: e.target.value })}
                />
              </div>
              <div className="col-span-2 relative">
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Search Medicine (F1)</label>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="w-full px-2 py-1 text-xs border-2 border-primary rounded"
                  placeholder="Type medicine name, code or press F1..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowProductSearch(true);
                  }}
                  onFocus={() => setShowProductSearch(true)}
                />

                {/* Product Dropdown */}
                {showProductSearch && filteredProducts.length > 0 && (
                  <div className="absolute z-30 mt-1 w-full bg-white border-2 border-primary rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                    {filteredProducts.slice(0, 8).map((product, index) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleProductSelect(product)}
                        className={`w-full px-2 py-1.5 text-left hover:bg-primary/10 border-b border-slate-100 last:border-0 transition-colors text-[10px] ${
                          index === selectedIndex ? 'bg-primary/20' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-800">{product.productName}</p>
                            <p className="text-[9px] text-slate-500">
                              {product.productCode} | HSN: {product.hsnCode || 'N/A'} | Batch: {product.batch || 'N/A'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600 text-xs">₹{product.mrp}</p>
                            <p className={`text-[9px] ${product.stockQuantity > 10 ? 'text-green-600' : 'text-orange-600'}`}>
                              Stock: {product.stockQuantity}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Excel-Like Table - Maximum Space */}
        <div className="flex-1 bg-white border-2 border-slate-300 rounded-lg overflow-hidden shadow-sm">
          <div className="h-full overflow-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead className="bg-gradient-to-r from-slate-700 to-slate-800 text-white sticky top-0 z-10">
                <tr>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-8">No</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-20">Code</th>
                  <th className="border border-slate-600 px-2 py-1.5 font-bold">Item Name</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-16">HSN</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-20">Batch</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-20">Expiry</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-12">Qty</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-16">Pack</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-16">MRP</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-16">Rate</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-20">Gross</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-12">CGST%</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-16">CGST</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-12">SGST%</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-16">SGST</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-20">Total</th>
                  <th className="border border-slate-600 px-1 py-1.5 font-bold w-10">Del</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {invoiceData.items.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="text-center py-8 text-slate-400 border border-slate-200">
                      <p className="text-xs font-semibold">No items added</p>
                      <p className="text-[10px] mt-1">Search and select medicines to add</p>
                    </td>
                  </tr>
                ) : (
                  invoiceData.items.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50 group">
                      <td className="border border-slate-200 px-1 py-0.5 text-center font-semibold">{index + 1}</td>
                      <td className="border border-slate-200 px-1 py-0.5 text-center font-mono text-[9px]">{item.productCode}</td>
                      <td className="border border-slate-200 px-2 py-0.5 font-semibold">{item.productName}</td>
                      <td className="border border-slate-200 px-1 py-0.5">
                        {editingCell?.row === index && editingCell?.field === 'hsnCode' ? (
                          <input
                            type="text"
                            className="w-full px-1 py-0.5 border border-primary rounded text-[10px]"
                            value={item.hsnCode}
                            onChange={(e) => handleCellEdit(index, 'hsnCode', e.target.value)}
                            onBlur={() => setEditingCell(null)}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:bg-blue-100 block px-1"
                            onDoubleClick={() => setEditingCell({row: index, field: 'hsnCode'})}
                          >
                            {item.hsnCode || '-'}
                          </span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-1 py-0.5">
                        {editingCell?.row === index && editingCell?.field === 'batch' ? (
                          <input
                            type="text"
                            className="w-full px-1 py-0.5 border border-primary rounded text-[10px]"
                            value={item.batch}
                            onChange={(e) => handleCellEdit(index, 'batch', e.target.value)}
                            onBlur={() => setEditingCell(null)}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:bg-blue-100 block px-1"
                            onDoubleClick={() => setEditingCell({row: index, field: 'batch'})}
                          >
                            {item.batch || '-'}
                          </span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-1 py-0.5">
                        {editingCell?.row === index && editingCell?.field === 'expiryDate' ? (
                          <input
                            type="date"
                            className="w-full px-1 py-0.5 border border-primary rounded text-[10px]"
                            value={item.expiryDate}
                            onChange={(e) => handleCellEdit(index, 'expiryDate', e.target.value)}
                            onBlur={() => setEditingCell(null)}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:bg-blue-100 block px-1 text-[9px]"
                            onDoubleClick={() => setEditingCell({row: index, field: 'expiryDate'})}
                          >
                            {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN', {month: 'short', year: '2-digit'}) : '-'}
                          </span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-1 py-0.5">
                        {editingCell?.row === index && editingCell?.field === 'quantity' ? (
                          <input
                            type="number"
                            min="1"
                            className="w-full px-1 py-0.5 border border-primary rounded text-[10px] text-center font-bold"
                            value={item.quantity}
                            onChange={(e) => handleCellEdit(index, 'quantity', parseInt(e.target.value) || 1)}
                            onBlur={() => setEditingCell(null)}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:bg-blue-100 block px-1 text-center font-bold"
                            onDoubleClick={() => setEditingCell({row: index, field: 'quantity'})}
                          >
                            {item.quantity}
                          </span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-1 py-0.5 text-center text-[9px]">{item.pack}</td>
                      <td className="border border-slate-200 px-1 py-0.5 text-right font-semibold">₹{item.mrp.toFixed(2)}</td>
                      <td className="border border-slate-200 px-1 py-0.5">
                        {editingCell?.row === index && editingCell?.field === 'rate' ? (
                          <input
                            type="number"
                            step="0.01"
                            className="w-full px-1 py-0.5 border border-primary rounded text-[10px] text-right"
                            value={item.rate}
                            onChange={(e) => handleCellEdit(index, 'rate', parseFloat(e.target.value) || 0)}
                            onBlur={() => setEditingCell(null)}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:bg-blue-100 block px-1 text-right font-semibold"
                            onDoubleClick={() => setEditingCell({row: index, field: 'rate'})}
                          >
                            ₹{item.rate.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-1 py-0.5 text-right font-bold">₹{item.grossAmount.toFixed(2)}</td>
                      <td className="border border-slate-200 px-1 py-0.5 text-center text-blue-600 font-semibold">{item.cgstPercent}%</td>
                      <td className="border border-slate-200 px-1 py-0.5 text-right text-blue-600">₹{item.cgstAmount.toFixed(2)}</td>
                      <td className="border border-slate-200 px-1 py-0.5 text-center text-purple-600 font-semibold">{item.sgstPercent}%</td>
                      <td className="border border-slate-200 px-1 py-0.5 text-right text-purple-600">₹{item.sgstAmount.toFixed(2)}</td>
                      <td className="border border-slate-200 px-1 py-0.5 text-right font-bold text-green-600">₹{item.total.toFixed(2)}</td>
                      <td className="border border-slate-200 px-1 py-0.5 text-center">
                        <button
                          onClick={() => removeItem(index)}
                          className="p-0.5 text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Bar - Totals & Actions */}
        <div className="bg-white border-2 border-slate-300 rounded-lg shadow-sm p-2">
          <div className="grid grid-cols-12 gap-2">
            {/* Left - Actions */}
            <div className="col-span-6 flex items-center space-x-2">
              <button
                onClick={resetForm}
                className="px-4 py-1.5 border-2 border-slate-400 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100 transition-all"
              >
                Reset
              </button>
              <button
                onClick={handlePayment}
                disabled={invoiceData.items.length === 0}
                className="px-6 py-1.5 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-lg text-xs font-bold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Payment & Save (F9)
              </button>
            </div>

            {/* Right - Totals */}
            <div className="col-span-6">
              <table className="w-full text-xs">
                <tbody>
                  <tr>
                    <td className="text-right font-semibold py-0.5">Gross Amount:</td>
                    <td className="text-right font-bold py-0.5 w-24">₹{invoiceData.subtotal.toFixed(2)}</td>
                    <td className="text-right font-semibold py-0.5">CGST Total:</td>
                    <td className="text-right font-bold py-0.5 w-24 text-blue-600">₹{invoiceData.cgstTotal.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="text-right font-semibold py-0.5">Discount:</td>
                    <td className="text-right py-0.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full px-2 py-0.5 border border-slate-300 rounded text-right text-xs"
                        value={invoiceData.discount}
                        onChange={(e) => setInvoiceData({ ...invoiceData, discount: parseFloat(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="text-right font-semibold py-0.5">SGST Total:</td>
                    <td className="text-right font-bold py-0.5 text-purple-600">₹{invoiceData.sgstTotal.toFixed(2)}</td>
                  </tr>
                  <tr className="bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                    <td className="text-right font-bold py-1 px-2">GRAND TOTAL:</td>
                    <td className="text-right font-bold text-lg py-1 px-2" colSpan={3}>₹{invoiceData.total.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Payment Modal Component
function PaymentModal({ totalAmount, onClose, onSubmit }: any) {
  const [payments, setPayments] = useState<PaymentDetail[]>([
    { method: 'cash', amount: 0, reference: '' }
  ]);

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: '💵' },
    { value: 'gpay', label: 'Google Pay', icon: '📱' },
    { value: 'phonepe', label: 'PhonePe', icon: '📲' },
    { value: 'paytm', label: 'Paytm', icon: '💳' },
    { value: 'upi', label: 'UPI', icon: '🏦' },
    { value: 'card', label: 'Card', icon: '💳' },
    { value: 'netbanking', label: 'Net Banking', icon: '🏛️' },
  ];

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = totalAmount - totalPaid;

  const addPaymentMethod = () => {
    setPayments([...payments, { method: 'cash', amount: 0, reference: '' }]);
  };

  const updatePayment = (index: number, field: string, value: any) => {
    const updated = [...payments];
    (updated[index] as any)[field] = value;
    setPayments(updated);
  };

  const removePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="bg-gradient-to-r from-primary to-indigo-600 text-white p-6 rounded-t-2xl">
          <h2 className="text-2xl font-bold">Payment Details</h2>
          <p className="text-white/80 text-sm mt-1">Split payment across multiple methods</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Payment Summary */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-600">Total Amount</p>
                <p className="text-2xl font-bold text-slate-800">₹{totalAmount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600">Paid</p>
                <p className="text-2xl font-bold text-green-600">₹{totalPaid.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600">Balance</p>
                <p className={`text-2xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{Math.abs(balance).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {payments.map((payment, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end bg-white p-3 rounded-lg border border-slate-200">
                <div className="col-span-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Method</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    value={payment.method}
                    onChange={(e) => updatePayment(index, 'method', e.target.value)}
                  >
                    {paymentMethods.map(method => (
                      <option key={method.value} value={method.value}>
                        {method.icon} {method.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="0.00"
                    value={payment.amount}
                    onChange={(e) => updatePayment(index, 'amount', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reference/UTR</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="Transaction ID"
                    value={payment.reference}
                    onChange={(e) => updatePayment(index, 'reference', e.target.value)}
                  />
                </div>
                <div className="col-span-1">
                  {payments.length > 1 && (
                    <button
                      onClick={() => removePayment(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addPaymentMethod}
            className="w-full py-2 border-2 border-dashed border-primary text-primary rounded-lg font-semibold hover:bg-primary/5 transition-all text-sm"
          >
            + Add Payment Method
          </button>
        </div>

        <div className="flex items-center justify-end space-x-3 p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(payments)}
            disabled={balance > 0.01}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
