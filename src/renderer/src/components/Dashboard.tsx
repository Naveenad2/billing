// src/components/Dashboard.tsx
// 📊 COMPLETE PROFESSIONAL DASHBOARD - FIXED DATABASE CLEARING
// 3 DATABASES: Sales DB + Inventory DB + Purchase DB (ALL WITH CLEAR FUNCTIONS)
// REMOVED: Firebase dependency (keeping it simple)

import { useState, useEffect } from 'react';
import { getInvoicesRange, clearSalesDatabase } from '../services/salesDB';

/********** TYPE DEFINITIONS **********/
interface Product {
  id: string;
  itemCode: string;
  itemName: string;
  stockQuantity: number;
  rol: number;
  sellingPriceTab: number;
  purchasePrice: number;
  mrp: number;
  category: string;
  manufacturer?: string;
  batch?: string;
  expiryDate?: string;
}

interface InventoryStats {
  totalProducts: number;
  totalQuantity: number;
  totalStockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiredCount: number;
  expiringCount: number;
  categoriesCount: number;
}

interface SalesDBStats {
  totalInvoices: number;
  totalSalesAmount: number;
  totalTaxCollected: number;
  totalProfit: number;
  totalQuantitySold: number;
  averageOrderValue: number;
  todaySales: number;
  thisMonthSales: number;
}

interface DatabaseHealth {
  inventoryDB: { recordCount: number; lastUpdated: string; status: 'healthy' | 'warning' | 'error' };
  salesDB: { recordCount: number; lastUpdated: string; status: 'healthy' | 'warning' | 'error' };
  purchaseDB: { recordCount: number; lastUpdated: string; status: 'healthy' | 'warning' | 'error' };
}

// Global APIs
declare global {
  interface Window {
    inventory?: {
      getAll: () => Promise<Product[]>;
      stats: () => Promise<InventoryStats>;
      getLowStock: () => Promise<Product[]>;
      getOutOfStock: () => Promise<Product[]>;
      getExpiring: (days: number) => Promise<Product[]>;
      getExpired: () => Promise<Product[]>;
      clearAll: () => Promise<void>;
    };
    purchaseDB?: {
      getAll: () => Promise<any[]>;
      clearAll: () => Promise<void>;
    };
  }
}

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryStats, setInventoryStats] = useState<InventoryStats | null>(null);
  const [salesDBStats, setSalesDBStats] = useState<SalesDBStats | null>(null);
  const [databaseHealth, setDatabaseHealth] = useState<DatabaseHealth | null>(null);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [outOfStockProducts, setOutOfStockProducts] = useState<Product[]>([]);
  const [expiringProducts, setExpiringProducts] = useState<Product[]>([]);
  const [expiredProducts, setExpiredProducts] = useState<Product[]>([]);
  const [purchaseRecords, setPurchaseRecords] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [showDatabaseDetails, setShowDatabaseDetails] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState<'sales' | 'inventory' | 'purchase' | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  /********** DATA LOADING **********/
  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!window.inventory) {
        throw new Error('❌ Inventory API not available');
      }

      // 1️⃣ Load Inventory DB
      const [productsData, stats, lowStock, outOfStock, expiring, expired] = await Promise.all([
        window.inventory.getAll(),
        window.inventory.stats(),
        window.inventory.getLowStock(),
        window.inventory.getOutOfStock(),
        window.inventory.getExpiring?.(30) || Promise.resolve([]),
        window.inventory.getExpired?.() || Promise.resolve([])
      ]);

      setProducts(productsData);
      setInventoryStats(stats);
      setLowStockProducts(lowStock);
      setOutOfStockProducts(outOfStock);
      setExpiringProducts(expiring);
      setExpiredProducts(expired);

      // 2️⃣ Load Sales DB (from salesDB.ts - used in AllInvoices)
      const today = new Date().toISOString().split('T')[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const yearStart = `${new Date().getFullYear()}-01-01`;

      const [allSalesInvoices, todaySalesInvoices, monthSalesInvoices] = await Promise.all([
        getInvoicesRange(yearStart, today, ''),
        getInvoicesRange(today, today, ''),
        getInvoicesRange(monthStart, today, '')
      ]);

      const salesStats: SalesDBStats = {
        totalInvoices: allSalesInvoices.length,
        totalSalesAmount: allSalesInvoices.reduce((sum, inv) => sum + inv.finalAmount, 0),
        totalTaxCollected: allSalesInvoices.reduce((sum, inv) => sum + inv.cgst + inv.sgst, 0),
        totalProfit: allSalesInvoices.reduce((sum, inv) => sum + inv.profit, 0),
        totalQuantitySold: allSalesInvoices.reduce((sum, inv) => sum + inv.qtyTotal, 0),
        averageOrderValue: allSalesInvoices.length > 0 
          ? allSalesInvoices.reduce((sum, inv) => sum + inv.finalAmount, 0) / allSalesInvoices.length 
          : 0,
        todaySales: todaySalesInvoices.reduce((sum, inv) => sum + inv.finalAmount, 0),
        thisMonthSales: monthSalesInvoices.reduce((sum, inv) => sum + inv.finalAmount, 0),
      };

      setSalesDBStats(salesStats);

      // 3️⃣ Load Purchase DB (if available)
      let purchaseData: any[] = [];
      if (window.purchaseDB?.getAll) {
        try {
          purchaseData = await window.purchaseDB.getAll();
          setPurchaseRecords(purchaseData);
        } catch (err) {
          console.warn('Purchase DB not available:', err);
        }
      }

      // 4️⃣ Database Health
      setDatabaseHealth({
        inventoryDB: {
          recordCount: productsData.length,
          lastUpdated: new Date().toISOString(),
          status: productsData.length > 0 ? 'healthy' : 'warning'
        },
        salesDB: {
          recordCount: allSalesInvoices.length,
          lastUpdated: new Date().toISOString(),
          status: allSalesInvoices.length > 0 ? 'healthy' : 'warning'
        },
        purchaseDB: {
          recordCount: purchaseData.length,
          lastUpdated: new Date().toISOString(),
          status: purchaseData.length > 0 ? 'healthy' : 'warning'
        }
      });

      console.log('📊 Dashboard Loaded:', {
        inventory: productsData.length,
        sales: allSalesInvoices.length,
        purchases: purchaseData.length,
        inventoryValue: stats.totalStockValue,
        totalSales: salesStats.totalSalesAmount
      });

    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /********** RECALCULATE INVENTORY **********/
  const recalculateInventoryValue = async () => {
    try {
      setRecalculating(true);
      
      if (!window.inventory) throw new Error('Inventory API not available');

      const freshProducts = await window.inventory.getAll();
      const freshStats = await window.inventory.stats();
      
      const calculatedValue = freshProducts.reduce((sum, p) => 
        sum + ((p.stockQuantity || 0) * (p.sellingPriceTab || 0)), 0);

      setProducts(freshProducts);
      setInventoryStats({ ...freshStats, totalStockValue: calculatedValue });

      alert(`✅ Recalculated!\n\nProducts: ${freshProducts.length}\nValue: ₹${calculatedValue.toLocaleString('en-IN')}`);
      
    } catch (err: any) {
      alert(`❌ Failed: ${err.message}`);
    } finally {
      setRecalculating(false);
    }
  };

  /********** CLEAR DATABASE FUNCTIONS **********/
  const clearSalesDB = async () => {
    try {
      setClearing(true);
      
      // Use the clearSalesDatabase function from salesDB.ts
      await clearSalesDatabase();
      
      alert('✅ Sales Database Cleared!\n\nAll invoices deleted.\nNext invoice starts from #1');
      
      setShowClearConfirm(null);
      await loadAllData();
    } catch (err: any) {
      console.error('Clear Sales DB Error:', err);
      alert(`❌ Failed to clear Sales DB: ${err.message}`);
    } finally {
      setClearing(false);
    }
  };

  const clearInventoryDB = async () => {
    try {
      setClearing(true);
      
      if (!window.inventory?.clearAll) {
        throw new Error('Inventory clearAll API not available');
      }

      await window.inventory.clearAll();
      
      alert('✅ Inventory Database Cleared!\n\nAll products deleted.');
      
      setShowClearConfirm(null);
      await loadAllData();
    } catch (err: any) {
      console.error('Clear Inventory Error:', err);
      alert(`❌ Failed to clear Inventory: ${err.message}`);
    } finally {
      setClearing(false);
    }
  };

  const clearPurchaseDB = async () => {
    try {
      setClearing(true);
      
      if (!window.purchaseDB?.clearAll) {
        throw new Error('Purchase DB clearAll API not available');
      }

      await window.purchaseDB.clearAll();
      
      alert('✅ Purchase Database Cleared!\n\nAll purchase records deleted.');
      
      setShowClearConfirm(null);
      await loadAllData();
    } catch (err: any) {
      console.error('Clear Purchase Error:', err);
      alert(`❌ Failed to clear Purchase DB: ${err.message}`);
    } finally {
      setClearing(false);
    }
  };

  /********** CALCULATIONS **********/
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.stockQuantity * p.sellingPriceTab), 0);

  /********** LOADING STATE **********/
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-lg font-semibold text-slate-700">Loading Dashboard...</p>
          <p className="text-sm text-slate-500 mt-2">Sales DB • Inventory DB • Purchase DB</p>
        </div>
      </div>
    );
  }

  /********** ERROR STATE **********/
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen p-6">
        <div className="text-center bg-red-50 border-2 border-red-200 rounded-2xl p-8 max-w-md shadow-xl">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-xl font-bold text-red-800 mb-3">Failed to Load</h3>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <button onClick={loadAllData} className="px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700">
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  /********** MAIN UI **********/
  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-2xl shadow-2xl p-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between">
          <div className="flex-1">
            <h1 className="text-4xl font-bold mb-2">📊 Professional Dashboard</h1>
            <p className="text-white/90 text-sm mb-4">3 Databases: Sales • Inventory • Purchase</p>
            <div className="flex flex-wrap gap-2">
              <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg text-xs font-semibold">
                💰 {salesDBStats?.totalInvoices || 0} Sales
              </div>
              <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg text-xs font-semibold">
                📦 {products.length} Products
              </div>
              <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg text-xs font-semibold">
                📥 {purchaseRecords.length} Purchases
              </div>
            </div>
          </div>
          <div className="mt-4 lg:mt-0">
            <div className="bg-white/20 backdrop-blur-sm px-4 py-3 rounded-xl">
              <p className="text-xs text-white/80">Today</p>
              <p className="text-lg font-bold">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-2xl p-5 shadow-lg border-2 border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-3">
            <button
              onClick={recalculateInventoryValue}
              disabled={recalculating}
              className="px-5 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-semibold hover:shadow-xl transition-all disabled:opacity-50 flex items-center space-x-2"
            >
              <svg className={`w-5 h-5 ${recalculating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{recalculating ? 'Calculating...' : '🔄 Recalculate'}</span>
            </button>

            <button
              onClick={() => setShowDatabaseDetails(true)}
              className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:shadow-xl transition-all"
            >
              🗄️ Database Details
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowClearConfirm('sales')}
              className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
            >
              🗑️ Clear Sales
            </button>
            <button
              onClick={() => setShowClearConfirm('inventory')}
              className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
            >
              🗑️ Clear Inventory
            </button>
            <button
              onClick={() => setShowClearConfirm('purchase')}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all text-sm"
            >
              🗑️ Clear Purchase
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Sales */}
        <div className="group bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-6 hover:shadow-2xl hover:scale-105 transition-all">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-3 rounded-xl">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full">Sales DB</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Total Sales</h3>
          <p className="text-3xl font-bold text-green-600 mb-1">₹{(salesDBStats?.totalSalesAmount || 0).toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500">{salesDBStats?.totalInvoices || 0} invoices</p>
        </div>

        {/* Total Profit */}
        <div className="group bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6 hover:shadow-2xl hover:scale-105 transition-all">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-3 rounded-xl">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-full">Profit</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Total Profit</h3>
          <p className="text-3xl font-bold text-blue-600 mb-1">₹{(salesDBStats?.totalProfit || 0).toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500">
            {salesDBStats?.totalSalesAmount ? ((salesDBStats.totalProfit / salesDBStats.totalSalesAmount) * 100).toFixed(1) : 0}% margin
          </p>
        </div>

        {/* Inventory Value */}
        <div className="group bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-6 hover:shadow-2xl hover:scale-105 transition-all">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-3 rounded-xl">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <span className="text-xs font-bold text-purple-700 bg-purple-100 px-3 py-1 rounded-full">Inventory</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Stock Value (SRate)</h3>
          <p className="text-3xl font-bold text-purple-600 mb-1">₹{totalInventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-slate-500">{products.length} products</p>
        </div>

        {/* Today's Sales */}
        <div className="group bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-2xl p-6 hover:shadow-2xl hover:scale-105 transition-all">
          <div className="flex items-start justify-between mb-4">
            <div className="bg-gradient-to-r from-yellow-500 to-amber-600 p-3 rounded-xl">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-yellow-700 bg-yellow-100 px-3 py-1 rounded-full">Today</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Today's Sales</h3>
          <p className="text-3xl font-bold text-yellow-600 mb-1">₹{(salesDBStats?.todaySales || 0).toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-500">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
        </div>
      </div>

      {/* Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {lowStockProducts.length > 0 && (
          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-r from-yellow-500 to-orange-600 p-3 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-yellow-900">⚠️ Low Stock</h3>
                  <p className="text-sm text-yellow-700">{lowStockProducts.length} products</p>
                </div>
              </div>
            </div>
            <div className="max-h-60 overflow-auto space-y-2">
              {lowStockProducts.slice(0, 5).map(p => (
                <div key={p.id} className="bg-white/70 rounded-xl p-3 flex justify-between">
                  <div>
                    <p className="text-sm font-semibold">{p.itemName}</p>
                    <p className="text-xs text-slate-600">Code: {p.itemCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-orange-600">{p.stockQuantity}</p>
                    <p className="text-xs text-slate-500">ROL: {p.rol}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {outOfStockProducts.length > 0 && (
          <div className="bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-300 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-r from-red-500 to-pink-600 p-3 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-red-900">❌ Out of Stock</h3>
                  <p className="text-sm text-red-700">{outOfStockProducts.length} products</p>
                </div>
              </div>
            </div>
            <div className="max-h-60 overflow-auto space-y-2">
              {outOfStockProducts.slice(0, 5).map(p => (
                <div key={p.id} className="bg-white/70 rounded-xl p-3 flex justify-between">
                  <div>
                    <p className="text-sm font-semibold">{p.itemName}</p>
                    <p className="text-xs text-slate-600">Code: {p.itemCode}</p>
                  </div>
                  <p className="text-base font-bold text-red-600">0 stock</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DATABASE DETAILS MODAL */}
      {showDatabaseDetails && databaseHealth && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 text-white px-6 py-5 flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-2xl font-bold">🗄️ Database Health Status</h3>
              <button onClick={() => setShowDatabaseDetails(false)} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold">
                ✕ Close
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Sales DB */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-green-900">💰 Sales Database (salesDB.ts)</h4>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    databaseHealth.salesDB.status === 'healthy' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {databaseHealth.salesDB.status === 'healthy' ? '✅ Healthy' : '⚠️ Warning'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/70 rounded-lg p-4">
                    <p className="text-xs text-green-700 font-semibold mb-1">Total Invoices</p>
                    <p className="text-2xl font-bold text-green-900">{databaseHealth.salesDB.recordCount}</p>
                  </div>
                  <div className="bg-white/70 rounded-lg p-4">
                    <p className="text-xs text-green-700 font-semibold mb-1">Last Updated</p>
                    <p className="text-sm font-bold text-green-900">
                      {new Date(databaseHealth.salesDB.lastUpdated).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Inventory DB */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-purple-900">📦 Inventory Database</h4>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    databaseHealth.inventoryDB.status === 'healthy' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {databaseHealth.inventoryDB.status === 'healthy' ? '✅ Healthy' : '⚠️ Warning'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/70 rounded-lg p-4">
                    <p className="text-xs text-purple-700 font-semibold mb-1">Total Products</p>
                    <p className="text-2xl font-bold text-purple-900">{databaseHealth.inventoryDB.recordCount}</p>
                  </div>
                  <div className="bg-white/70 rounded-lg p-4">
                    <p className="text-xs text-purple-700 font-semibold mb-1">Last Updated</p>
                    <p className="text-sm font-bold text-purple-900">
                      {new Date(databaseHealth.inventoryDB.lastUpdated).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Purchase DB */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-blue-900">📥 Purchase Database</h4>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    databaseHealth.purchaseDB.status === 'healthy' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {databaseHealth.purchaseDB.status === 'healthy' ? '✅ Healthy' : '⚠️ Warning'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/70 rounded-lg p-4">
                    <p className="text-xs text-blue-700 font-semibold mb-1">Total Records</p>
                    <p className="text-2xl font-bold text-blue-900">{databaseHealth.purchaseDB.recordCount}</p>
                  </div>
                  <div className="bg-white/70 rounded-lg p-4">
                    <p className="text-xs text-blue-700 font-semibold mb-1">Last Updated</p>
                    <p className="text-sm font-bold text-blue-900">
                      {new Date(databaseHealth.purchaseDB.lastUpdated).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR CONFIRMATION MODAL */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white px-6 py-5">
              <h3 className="text-xl font-bold">⚠️ Confirm Database Clear</h3>
            </div>
            <div className="p-6">
              <p className="text-slate-700 mb-6">
                Clear <strong>
                  {showClearConfirm === 'sales' ? 'Sales Database' : 
                   showClearConfirm === 'inventory' ? 'Inventory Database' : 
                   'Purchase Database'}
                </strong>?
              </p>
              <p className="text-sm text-red-600 mb-6">
                ⚠️ This CANNOT be undone! All data will be permanently deleted.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(null)}
                  className="flex-1 px-4 py-3 bg-slate-200 hover:bg-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={
                    showClearConfirm === 'sales' ? clearSalesDB : 
                    showClearConfirm === 'inventory' ? clearInventoryDB : 
                    clearPurchaseDB
                  }
                  disabled={clearing}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold disabled:opacity-50"
                >
                  {clearing ? '⏳ Clearing...' : '🗑️ Clear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
