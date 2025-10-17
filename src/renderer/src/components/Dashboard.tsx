// src/components/Dashboard.tsx
// Inventory Value = SUM of (Stock Quantity × Selling Rate) ONLY

import { useState, useEffect } from 'react';
import { getAllInvoices } from '../services/invoiceDB';

/***** Type Definitions *****/
interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  total: number;
  status: 'paid' | 'pending' | 'partial';
  invoiceDate: string;
  createdAt: string;
}

interface Product {
  id: string;
  itemCode: string;
  itemName: string;
  stockQuantity: number;
  rol: number;
  sellingPriceTab: number; // This is SRate
  purchasePrice: number;
  mrp: number;
  category: string;
  manufacturer?: string;
  hasExpiryDate: boolean;
  expiryDate?: string;
}

interface InventoryStats {
  totalProducts: number;
  totalQuantity: number;
  totalStockValue: number; // This should be calculated as SUM(qty × sellingPriceTab)
  lowStockCount: number;
  outOfStockCount: number;
  expiredCount: number;
  expiringCount: number;
  categoriesCount: number;
}

interface DashboardProps {
  invoices: Invoice[];
}

declare global {
  interface Window {
    inventory?: {
      getAll: () => Promise<Product[]>;
      stats: () => Promise<InventoryStats>;
      getLowStock: () => Promise<Product[]>;
      getOutOfStock: () => Promise<Product[]>;
      getExpiring: (days: number) => Promise<Product[]>;
      getExpired: () => Promise<Product[]>;
    };
  }
}

export default function Dashboard({ invoices: firebaseInvoices }: DashboardProps) {
  const [offlineInvoices, setOfflineInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryStats, setInventoryStats] = useState<InventoryStats | null>(null);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [outOfStockProducts, setOutOfStockProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!window.inventory) {
        throw new Error('Inventory API not available. Please restart the application.');
      }

      const invoicesData = await getAllInvoices();
      const [productsData, stats, lowStock, outOfStock] = await Promise.all([
        window.inventory.getAll(),
        window.inventory.stats(),
        window.inventory.getLowStock(),
        window.inventory.getOutOfStock()
      ]);

      setOfflineInvoices(invoicesData);
      setProducts(productsData);
      setInventoryStats(stats);
      setLowStockProducts(lowStock);
      setOutOfStockProducts(outOfStock);

      console.log('📊 Dashboard loaded:', {
        products: productsData.length,
        dbStockValue: stats?.totalStockValue,
        calculatedStockValue: productsData.reduce((sum, p) => sum + (p.stockQuantity * p.sellingPriceTab), 0)
      });
    } catch (err: any) {
      console.error('Error loading dashboard:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // 🔥 RECALCULATE: Force fresh calculation from products directly
  const recalculateInventoryValue = async () => {
    try {
      setRecalculating(true);
      
      if (!window.inventory) {
        throw new Error('Inventory API not available');
      }

      // Get fresh product data
      const freshProducts = await window.inventory.getAll();
      const freshStats = await window.inventory.stats();
      
      // Calculate manually to ensure accuracy
      const calculatedValue = freshProducts.reduce((sum, product) => {
        const qty = product.stockQuantity || 0;
        const srate = product.sellingPriceTab || 0;
        return sum + (qty * srate);
      }, 0);

      console.log('🔄 Recalculation Results:');
      console.log('├─ Total Products:', freshProducts.length);
      console.log('├─ DB Stock Value:', freshStats.totalStockValue);
      console.log('├─ Calculated Value (Qty × SRate):', calculatedValue);
      console.log('└─ Match:', Math.abs(freshStats.totalStockValue - calculatedValue) < 0.01 ? '✅' : '❌');

      // Update state with fresh data
      setProducts(freshProducts);
      setInventoryStats({
        ...freshStats,
        totalStockValue: calculatedValue // Force use calculated value
      });

      alert(`✅ Inventory Value Recalculated!\n\n` +
            `Total Products: ${freshProducts.length}\n` +
            `Total Stock Value (SRate): ₹${calculatedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}\n\n` +
            `Calculation: SUM(Stock Quantity × Selling Rate)`);
      
    } catch (err: any) {
      console.error('Error recalculating:', err);
      alert(`❌ Failed to recalculate: ${err.message}`);
    } finally {
      setRecalculating(false);
    }
  };

  const allInvoices = [...firebaseInvoices, ...offlineInvoices];

  const getFilteredInvoices = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    return allInvoices.filter(invoice => {
      const invoiceDate = new Date(invoice.invoiceDate || invoice.createdAt);
      switch (selectedPeriod) {
        case 'today': return invoiceDate >= today;
        case 'week': return invoiceDate >= weekAgo;
        case 'month': return invoiceDate >= monthAgo;
        default: return true;
      }
    });
  };

  const filteredInvoices = getFilteredInvoices();
  const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const paidInvoices = filteredInvoices.filter(inv => inv.status === 'paid');
  const pendingInvoices = filteredInvoices.filter(inv => inv.status === 'pending' || inv.status === 'partial');
  const totalPaid = paidInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalPending = pendingInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

  // 🔥 CRITICAL: Calculate inventory value ONLY from products × sellingPriceTab
  const totalInventoryValue = products.reduce((sum, p) => {
    return sum + (p.stockQuantity * p.sellingPriceTab);
  }, 0);

  const recentInvoices = [...allInvoices]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-slate-600">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center bg-red-50 border-2 border-red-200 rounded-xl p-6 max-w-md">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-bold text-red-800 mb-2">Failed to Load Dashboard</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-all text-sm">
            Retry
          </button>
        </div>
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

      {/* Period Filter + Recalculate Button */}
      <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow-md">
        <div className="flex items-center space-x-4">
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

        {/* 🔥 RECALCULATE Button */}
        <button
          onClick={recalculateInventoryValue}
          disabled={recalculating}
          className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg 
            className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span>{recalculating ? 'Calculating...' : 'Recalculate Value'}</span>
        </button>
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
            <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">Revenue</span>
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
            <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">Paid</span>
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
            <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">Pending</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Pending Amount</h3>
          <p className="text-3xl font-bold text-orange-600">₹{totalPending.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500 mt-2">{pendingInvoices.length} pending invoices</p>
        </div>

        {/* 🔥 Inventory Value - CALCULATED FROM SRATE ONLY */}
        <div className="card hover:scale-105 transition-transform cursor-pointer bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-3 rounded-xl">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-2 py-1 rounded-full">Stock</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">Total Inventory (SRate)</h3>
          <p className="text-3xl font-bold text-purple-600">₹{totalInventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-slate-500 mt-2">{products.length} products • Qty × SRate</p>
        </div>
      </div>

      {/* Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {lowStockProducts.length > 0 && (
          <div className="card bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-r from-yellow-500 to-orange-600 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-yellow-800">⚠️ Low Stock Alert</h3>
                  <p className="text-xs text-yellow-600">{lowStockProducts.length} products running low</p>
                </div>
              </div>
            </div>
            <div className="max-h-40 overflow-auto space-y-2">
              {lowStockProducts.slice(0, 5).map(product => (
                <div key={product.id} className="bg-white/60 rounded-lg p-2 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{product.itemName}</p>
                    <p className="text-xs text-slate-600">Code: {product.itemCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-orange-600">{product.stockQuantity} left</p>
                    <p className="text-xs text-slate-500">ROL: {product.rol}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {outOfStockProducts.length > 0 && (
          <div className="card bg-gradient-to-br from-red-50 to-pink-50 border border-red-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-r from-red-500 to-pink-600 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-red-800">❌ Out of Stock</h3>
                  <p className="text-xs text-red-600">{outOfStockProducts.length} products unavailable</p>
                </div>
              </div>
            </div>
            <div className="max-h-40 overflow-auto space-y-2">
              {outOfStockProducts.slice(0, 5).map(product => (
                <div key={product.id} className="bg-white/60 rounded-lg p-2 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{product.itemName}</p>
                    <p className="text-xs text-slate-600">Code: {product.itemCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">0 stock</p>
                    <p className="text-xs text-red-500">Restock needed</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Invoices */}
      {recentInvoices.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">Recent Invoices</h3>
            <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
              Last {recentInvoices.length} transactions
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Invoice #</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentInvoices.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3 text-slate-800">{invoice.customerName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      ₹{invoice.total.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        invoice.status === 'paid' ? 'bg-green-100 text-green-700' : 
                        invoice.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {invoice.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
