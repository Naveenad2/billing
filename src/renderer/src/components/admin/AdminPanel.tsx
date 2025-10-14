import { useState, useEffect } from 'react';
import { getAllInvoices, deleteInvoice, Invoice } from '../../services/invoiceDB';
import { getAllProducts, deleteProduct, Product } from '../../services/inventoryDB';
import AdminLogin from './AdminLogin';


export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'invoices' | 'products'>('invoices');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'invoice' | 'product'; name: string } | null>(null);

  // Advanced Filters
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [productFilter, setProductFilter] = useState<string>('all');

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invoicesData, productsData] = await Promise.all([
        getAllInvoices(),
        getAllProducts()
      ]);
      setInvoices(invoicesData);
      setProducts(productsData);
    } catch (error) {
      console.error('Error loading admin ', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: string, type: 'invoice' | 'product', name: string) => {
    setItemToDelete({ id, type, name });
    setShowDeleteWarning(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === 'invoice') {
        await deleteInvoice(itemToDelete.id);
      } else {
        await deleteProduct(itemToDelete.id);
      }
      await loadData();
      setShowDeleteWarning(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  // Advanced Filtering Logic
  const getFilteredInvoices = () => {
    let filtered = invoices;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(inv =>
        inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.items.some(item => item.productName.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter(inv => {
        const invDate = new Date(inv.invoiceDate || inv.createdAt);
        
        switch (dateFilter) {
          case 'today':
            return invDate >= today;
          case 'week':
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            return invDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            return invDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(inv => inv.status === statusFilter);
    }

    // Product filter
    if (productFilter !== 'all') {
      filtered = filtered.filter(inv =>
        inv.items.some(item => item.productId === productFilter)
      );
    }

    return filtered;
  };

  const filteredInvoices = getFilteredInvoices();

  const filteredProducts = products.filter(prod =>
    prod.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prod.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prod.shortKey.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // CSV Export Functions
  const exportInvoicesToCSV = () => {
    const data = filteredInvoices;
    
    if (data.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = ['Invoice Number', 'Customer Name', 'Date', 'Status', 'Subtotal', 'Discount', 'Tax Amount', 'Total', 'Products'];
    const csvRows = [headers.join(',')];

    data.forEach(inv => {
      const products = inv.items.map(item => `${item.productName} (${item.quantity})`).join('; ');
      const row = [
        inv.invoiceNumber,
        `"${inv.customerName}"`,
        new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN'),
        inv.status,
        inv.subtotal.toFixed(2),
        inv.discount.toFixed(2),
        inv.taxAmount.toFixed(2),
        inv.total.toFixed(2),
        `"${products}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    downloadCSV(csvContent, `invoices-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportProductsToCSV = () => {
    const data = filteredProducts;
    
    if (data.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = ['Product Code', 'Product Name', 'Short Key', 'Category', 'Brand', 'Stock Quantity', 'Min Stock', 'Purchase Price', 'Selling Price', 'Unit'];
    const csvRows = [headers.join(',')];

    data.forEach(prod => {
      const row = [
        prod.productCode,
        `"${prod.productName}"`,
        prod.shortKey,
        prod.category,
        prod.brand || '',
        prod.stockQuantity,
        prod.minStockLevel,
        prod.purchasePrice.toFixed(2),
        prod.sellingPrice.toFixed(2),
        prod.unit
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    downloadCSV(csvContent, `products-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAuthenticated) {
    return <AdminLogin onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="space-y-6">
      {/* Delete Warning Modal */}
      {showDeleteWarning && itemToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scaleIn">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Permanent Deletion Warning</h3>
              <p className="text-sm text-slate-600 mb-4">
                You are about to delete: <span className="font-bold text-red-600">{itemToDelete.name}</span>
              </p>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <p className="text-xs text-red-800 font-semibold mb-2">⚠️ This action cannot be undone!</p>
                <p className="text-xs text-red-700">
                  This record will be permanently removed from the database. 
                  No backup or recovery will be available.
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteWarning(false);
                    setItemToDelete(null);
                  }}
                  className="flex-1 px-4 py-3 border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                  Delete Permanently
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Header */}
      <div className="card bg-gradient-to-r from-primary to-indigo-600 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">🔐 Admin Control Panel</h1>
            <p className="text-white/80">Manage system data, export reports, and monitor activities</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-6 py-3 bg-white/20 backdrop-blur-sm hover:bg-white/30 rounded-xl font-semibold transition-all flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card hover:scale-105 transition-transform cursor-pointer bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-3 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Total Invoices</h3>
          <p className="text-3xl font-bold text-blue-600">{invoices.length}</p>
          <p className="text-xs text-slate-500 mt-1">Filtered: {filteredInvoices.length}</p>
        </div>

        <div className="card hover:scale-105 transition-transform cursor-pointer bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-3 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Total Revenue</h3>
          <p className="text-3xl font-bold text-green-600">
            ₹{invoices.reduce((sum, inv) => sum + inv.total, 0).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-500 mt-1">Filtered: ₹{filteredInvoices.reduce((sum, inv) => sum + inv.total, 0).toLocaleString('en-IN')}</p>
        </div>

        <div className="card hover:scale-105 transition-transform cursor-pointer bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-3 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Total Products</h3>
          <p className="text-3xl font-bold text-purple-600">{products.length}</p>
          <p className="text-xs text-slate-500 mt-1">Active: {products.filter(p => p.stockQuantity > 0).length}</p>
        </div>

        <div className="card hover:scale-105 transition-transform cursor-pointer bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 p-3 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Pending Payments</h3>
          <p className="text-3xl font-bold text-orange-600">
            {invoices.filter(inv => inv.status === 'pending').length}
          </p>
          <p className="text-xs text-slate-500 mt-1">₹{invoices.filter(inv => inv.status === 'pending').reduce((sum, inv) => sum + inv.total, 0).toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Tab Navigation & Controls */}
      <div className="card">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 mb-6">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'invoices'
                  ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-lg'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              📄 Invoices ({invoices.length})
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'products'
                  ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-lg'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              📦 Products ({products.length})
            </button>
          </div>

          {/* Export Button */}
          <button
            onClick={activeTab === 'invoices' ? exportInvoicesToCSV : exportProductsToCSV}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export to CSV</span>
          </button>
        </div>

        {/* Advanced Filters (Only for Invoices) */}
        {activeTab === 'invoices' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-xl">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Search</label>
              <div className="relative">
                <input
                  type="text"
                  className="input-field text-sm pl-10"
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Date Range</label>
              <select
                className="input-field text-sm"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Payment Status</label>
              <select
                className="input-field text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="all">All Status</option>
                <option value="paid">Paid Only</option>
                <option value="pending">Pending Only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Filter by Product</label>
              <select
                className="input-field text-sm"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
              >
                <option value="all">All Products</option>
                {products.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.productName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Products Search */}
        {activeTab === 'products' && (
          <div className="mb-6">
            <div className="relative w-full">
              <input
                type="text"
                className="input-field text-sm pl-10"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : activeTab === 'invoices' ? (
          /* Invoices Table */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-slate-100 to-blue-100">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Invoice #</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Customer</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Products</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Date</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Amount</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Status</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-primary">{invoice.invoiceNumber}</td>
                    <td className="py-3 px-4 text-slate-700">{invoice.customerName}</td>
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {invoice.items.slice(0, 2).map(item => item.productName).join(', ')}
                      {invoice.items.length > 2 && ` +${invoice.items.length - 2} more`}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-600">
                      {new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-green-600">
                      ₹{invoice.total.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        invoice.status === 'paid' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {invoice.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleDeleteClick(invoice.id, 'invoice', invoice.invoiceNumber)}
                        className="px-4 py-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg font-semibold transition-all text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredInvoices.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <svg className="w-16 h-16 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-lg font-semibold">No invoices found</p>
                <p className="text-sm mt-1">Try adjusting your filters</p>
              </div>
            )}
          </div>
        ) : (
          /* Products Table */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-slate-100 to-purple-100">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Product Name</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Code</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Short Key</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Stock</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">Price</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-800">{product.productName}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="bg-slate-100 px-2 py-1 rounded text-xs">{product.productCode}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-bold">{product.shortKey}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-bold ${
                        product.stockQuantity === 0 ? 'text-red-600' :
                        product.stockQuantity <= product.minStockLevel ? 'text-orange-600' :
                        'text-green-600'
                      }`}>
                        {product.stockQuantity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-green-600">
                      ₹{product.sellingPrice.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleDeleteClick(product.id, 'product', product.productName)}
                        className="px-4 py-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg font-semibold transition-all text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProducts.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <svg className="w-16 h-16 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-lg font-semibold">No products found</p>
                <p className="text-sm mt-1">Try adjusting your search</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
