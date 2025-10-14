import { useState, useEffect } from 'react';
import { getAllInvoices } from '../services/invoiceDB';
import { getAllProducts } from '../services/inventoryDB';

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  total: number;
  status: 'paid' | 'pending';
  invoiceDate: string;
  createdAt: string;
}

interface Product {
  id: string;
  productName: string;
  stockQuantity: number;
  minStockLevel: number;
  sellingPrice: number;
}

interface DashboardProps {
  invoices: Invoice[];
}

export default function Dashboard({ invoices: firebaseInvoices }: DashboardProps) {
  const [offlineInvoices, setOfflineInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invoicesData, productsData] = await Promise.all([
        getAllInvoices(),
        getAllProducts()
      ]);
      setOfflineInvoices(invoicesData);
      setProducts(productsData);
    } catch (error) {
      console.error('Error loading dashboard ', error);
    } finally {
      setLoading(false);
    }
  };

  // Combine Firebase and offline invoices
  const allInvoices = [...firebaseInvoices, ...offlineInvoices];

  // Filter invoices by period
  const getFilteredInvoices = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    return allInvoices.filter(invoice => {
      const invoiceDate = new Date(invoice.invoiceDate || invoice.createdAt);
      
      switch (selectedPeriod) {
        case 'today':
          return invoiceDate >= today;
        case 'week':
          return invoiceDate >= weekAgo;
        case 'month':
          return invoiceDate >= monthAgo;
        default:
          return true;
      }
    });
  };

  const filteredInvoices = getFilteredInvoices();

  // Calculate statistics
  const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const paidInvoices = filteredInvoices.filter(inv => inv.status === 'paid');
  const pendingInvoices = filteredInvoices.filter(inv => inv.status === 'pending');
  const totalPaid = paidInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalPending = pendingInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

  // Low stock products
  const lowStockProducts = products.filter(p => p.stockQuantity <= p.minStockLevel);
  const outOfStockProducts = products.filter(p => p.stockQuantity === 0);

  // Inventory value
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.stockQuantity * p.sellingPrice), 0);

  // Recent invoices
  const recentInvoices = [...allInvoices]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="card bg-gradient-to-r from-primary to-indigo-600 text-white">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">📊 Business Dashboard</h1>
            <p className="text-white/80">Track your business performance and insights</p>
          </div>
          <div className="mt-4 md:mt-0">
            <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-xl">
              <p className="text-xs text-white/80">Today's Date</p>
              <p className="text-lg font-bold">{new Date().toLocaleDateString('en-IN', { 
                day: 'numeric', 
                month: 'short', 
                year: 'numeric' 
              })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Period Filter */}
      <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow-md">
        <h3 className="text-sm font-bold text-slate-700">Filter Period:</h3>
        <div className="flex space-x-2">
          {[
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'Last 7 Days' },
            { id: 'month', label: 'Last 30 Days' },
            { id: 'all', label: 'All Time' }
          ].map(period => (
            <button
              key={period.id}
              onClick={() => setSelectedPeriod(period.id as any)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                selectedPeriod === period.id
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="card hover:scale-105 transition-transform cursor-pointer bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-3 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
              Revenue
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Total Revenue</h3>
          <p className="text-3xl font-bold text-green-600">₹{totalRevenue.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500 mt-2">{filteredInvoices.length} invoices</p>
        </div>

        {/* Paid Amount */}
        <div className="card hover:scale-105 transition-transform cursor-pointer bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-3 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
              Paid
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Paid Amount</h3>
          <p className="text-3xl font-bold text-blue-600">₹{totalPaid.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500 mt-2">{paidInvoices.length} paid invoices</p>
        </div>

        {/* Pending Amount */}
        <div className="card hover:scale-105 transition-transform cursor-pointer bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 p-3 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
              Pending
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Pending Amount</h3>
          <p className="text-3xl font-bold text-orange-600">₹{totalPending.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500 mt-2">{pendingInvoices.length} pending invoices</p>
        </div>

        {/* Inventory Value */}
        <div className="card hover:scale-105 transition-transform cursor-pointer bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-3 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
              Stock
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Inventory Value</h3>
          <p className="text-3xl font-bold text-purple-600">₹{totalInventoryValue.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500 mt-2">{products.length} products</p>
        </div>
      </div>

      {/* Alerts Section */}
      {(lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Low Stock Alert */}
          {lowStockProducts.length > 0 && (
            <div className="card bg-gradient-to-r from-orange-50 to-red-50 border border-orange-300">
              <div className="flex items-start space-x-3">
                <div className="bg-orange-500 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-orange-800 mb-1">⚠️ Low Stock Alert</h3>
                  <p className="text-xs text-orange-700 mb-2">
                    {lowStockProducts.length} product(s) running low on stock
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {lowStockProducts.slice(0, 5).map(product => (
                      <div key={product.id} className="text-xs bg-white/50 rounded p-2 flex items-center justify-between">
                        <span className="font-semibold text-orange-800">{product.productName}</span>
                        <span className="text-orange-600">Stock: {product.stockQuantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Out of Stock Alert */}
          {outOfStockProducts.length > 0 && (
            <div className="card bg-gradient-to-r from-red-50 to-pink-50 border border-red-300">
              <div className="flex items-start space-x-3">
                <div className="bg-red-500 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-red-800 mb-1">🚫 Out of Stock</h3>
                  <p className="text-xs text-red-700 mb-2">
                    {outOfStockProducts.length} product(s) out of stock
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {outOfStockProducts.slice(0, 5).map(product => (
                      <div key={product.id} className="text-xs bg-white/50 rounded p-2 flex items-center justify-between">
                        <span className="font-semibold text-red-800">{product.productName}</span>
                        <span className="text-red-600 font-bold">Out of Stock</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Invoices & Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center">
              <svg className="w-5 h-5 mr-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Recent Invoices
            </h3>
            <span className="text-xs text-slate-500">{recentInvoices.length} invoices</span>
          </div>

          {recentInvoices.length > 0 ? (
            <div className="space-y-2">
              {recentInvoices.map(invoice => (
                <div key={invoice.id} className="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-bold text-slate-800">{invoice.invoiceNumber}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          invoice.status === 'paid' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {invoice.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{invoice.customerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">₹{invoice.total.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <svg className="w-16 h-16 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-semibold">No invoices yet</p>
              <p className="text-xs mt-1">Create your first invoice to get started</p>
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="space-y-4">
          {/* Payment Status */}
          <div className="card bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Payment Status</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-600">Paid</span>
                  <span className="text-xs font-bold text-green-600">
                    {totalRevenue > 0 ? ((totalPaid / totalRevenue) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-green-500 to-emerald-600 h-2 rounded-full transition-all"
                    style={{ width: `${totalRevenue > 0 ? (totalPaid / totalRevenue) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-600">Pending</span>
                  <span className="text-xs font-bold text-orange-600">
                    {totalRevenue > 0 ? ((totalPending / totalRevenue) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-orange-500 to-amber-600 h-2 rounded-full transition-all"
                    style={{ width: `${totalRevenue > 0 ? (totalPending / totalRevenue) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Inventory Health */}
          <div className="card bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Inventory Health</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-white/50 rounded">
                <span className="text-xs text-slate-600">Total Products</span>
                <span className="text-sm font-bold text-slate-800">{products.length}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-white/50 rounded">
                <span className="text-xs text-slate-600">Low Stock</span>
                <span className="text-sm font-bold text-orange-600">{lowStockProducts.length}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-white/50 rounded">
                <span className="text-xs text-slate-600">Out of Stock</span>
                <span className="text-sm font-bold text-red-600">{outOfStockProducts.length}</span>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="card bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200">
            <h3 className="text-sm font-bold text-slate-800 mb-3">System Status</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-slate-700">Offline Mode Active</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-slate-700">Local Database Ready</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-slate-700">All Systems Operational</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
