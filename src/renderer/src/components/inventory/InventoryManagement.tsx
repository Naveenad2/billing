// src/components/inventory/InventoryManagement.tsx
// Uses InventoryDB (SQLite) via window.inventory IPC API
// 100% Accurate: Stock Value = SUM(Qty × SRate), Expired checked with TODAY, Low Stock = Qty ≤ ROL

import { useState, useEffect } from 'react';
import StockImport from '../StockImport';

/***** Type Definitions *****/
interface Product {
  id: string;
  itemCode: string;
  itemName: string;
  regionalName?: string;
  hsnCode: string;
  batch?: string;
  category: string;
  manufacturer?: string;
  rol: number;
  altUnit?: string;
  pack: string;
  purchasePrice: number;
  sellingPriceTab: number;
  mrp: number;
  stockQuantity: number;
  minStockLevel: number;
  maxStockLevel: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  prTaxIncluded: boolean;
  slTaxIncluded: boolean;
  hasExpiryDate: boolean;
  expiryDate?: string;
  productCode?: string;
  productName?: string;
  shortKey?: string;
  brand?: string;
  unit?: string;
  sellingPrice?: number;
  supplier?: string;
  barcode?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface InventoryStats {
  totalProducts: number;
  totalItems: number;
  totalQuantity: number;
  totalStockValue: number; // SUM(qty × sellingPriceTab)
  totalCostValue: number;
  totalMRPValue: number;
  lowStockItems: number;
  lowStockCount: number;
  outOfStockItems: number;
  outOfStockCount: number;
  expiredCount: number;
  expiringCount: number;
  categoriesCount: number;
  invalidPricingCount: number;
}

interface DailyClosing {
  date: string;
  timestamp: number;
  totalValue: number;
  totalQuantity: number;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiredCount: number;
}

// Declare window.inventory API (from preload.ts → InventoryDB)
declare global {
  interface Window {
    inventory?: {
      getAll: () => Promise<Product[]>;
      stats: () => Promise<InventoryStats>;
      getLowStock: () => Promise<Product[]>;
      getOutOfStock: () => Promise<Product[]>;
      getExpiring: (days: number) => Promise<Product[]>;
      getExpired: () => Promise<Product[]>;
      search: (query: string) => Promise<Product[]>;
      getCategories: () => Promise<string[]>;
    };
  }
}

export default function InventoryManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStockImport, setShowStockImport] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Filters
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterManufacturer, setFilterManufacturer] = useState('all');
  const [filterStockStatus, setFilterStockStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Daily Closing Filters
  const [closingDateFrom, setClosingDateFrom] = useState('');
  const [closingDateTo, setClosingDateTo] = useState('');
  
  // 🔥 CLIENT-SIDE CALCULATED STATS (100% accurate from ALL products)
  const [inventoryStats, setInventoryStats] = useState<InventoryStats>({
    totalProducts: 0,
    totalItems: 0,
    totalQuantity: 0,
    totalStockValue: 0,
    totalCostValue: 0,
    totalMRPValue: 0,
    lowStockItems: 0,
    lowStockCount: 0,
    outOfStockItems: 0,
    outOfStockCount: 0,
    expiredCount: 0,
    expiringCount: 0,
    categoriesCount: 0,
    invalidPricingCount: 0
  });

  const [dailyClosings, setDailyClosings] = useState<DailyClosing[]>([]);
  const [filteredClosings, setFilteredClosings] = useState<DailyClosing[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 🔥 Categorized product sets for accurate filtering
  const [lowStockProducts, setLowStockProducts] = useState<Set<string>>(new Set());
  const [outOfStockProducts, setOutOfStockProducts] = useState<Set<string>>(new Set());
  const [expiredProducts, setExpiredProducts] = useState<Set<string>>(new Set());
  const [expiringProducts, setExpiringProducts] = useState<Set<string>>(new Set());
  const [invalidPricingProducts, setInvalidPricingProducts] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
    loadDailyClosings();
    
    // Auto-save at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();
    
    const midnightTimeout = setTimeout(() => {
      autoSaveDailyClosing();
      const dailyInterval = setInterval(autoSaveDailyClosing, 24 * 60 * 60 * 1000);
      return () => clearInterval(dailyInterval);
    }, timeUntilMidnight);

    return () => clearTimeout(midnightTimeout);
  }, []);

  useEffect(() => {
    filterProducts();
  }, [searchTerm, products, filterCategory, filterManufacturer, filterStockStatus, dateFrom, dateTo]);

  useEffect(() => {
    filterClosings();
  }, [dailyClosings, closingDateFrom, closingDateTo]);

  // 🔥 CRITICAL: Calculate 100% accurate stats from ALL products
  const calculateAccurateStats = (allProducts: Product[]): InventoryStats => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    let totalQuantity = 0;
    let totalStockValue = 0;
    let totalCostValue = 0;
    let totalMRPValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let expiredCount = 0;
    let expiringCount = 0;
    let invalidPricingCount = 0;

    const lowStockSet = new Set<string>();
    const outOfStockSet = new Set<string>();
    const expiredSet = new Set<string>();
    const expiringSet = new Set<string>();
    const invalidPricingSet = new Set<string>();
    const categories = new Set<string>();

    allProducts.forEach(product => {
      const qty = Number(product.stockQuantity) || 0;
      const srate = Number(product.sellingPriceTab) || 0;
      const prate = Number(product.purchasePrice) || 0;
      const mrp = Number(product.mrp) || 0;
      const rol = Number(product.rol) || 0;

      // Total quantity
      totalQuantity += qty;

      // 🔥 CRITICAL: Stock value = ONLY Quantity × SRate
      totalStockValue += qty * srate;
      totalCostValue += qty * prate;
      totalMRPValue += qty * mrp;

      // Categories
      if (product.category) {
        categories.add(product.category);
      }

      // 🔥 Low Stock: qty > 0 AND qty <= ROL
      if (qty > 0 && qty <= rol) {
        lowStockCount++;
        lowStockSet.add(product.id);
      }

      // 🔥 Out of Stock: qty = 0
      if (qty === 0) {
        outOfStockCount++;
        outOfStockSet.add(product.id);
      }

      // 🔥 Expired: hasExpiryDate AND expiryDate < TODAY
      if (product.hasExpiryDate && product.expiryDate) {
        const expiryDate = new Date(product.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        
        if (expiryDate < today) {
          expiredCount++;
          expiredSet.add(product.id);
        } else if (expiryDate >= today && expiryDate <= thirtyDaysFromNow) {
          // Expiring within 30 days (but not expired yet)
          expiringCount++;
          expiringSet.add(product.id);
        }
      }

      // 🔥 Invalid Pricing: SRate > MRP (pricing error)
      if (srate > mrp && mrp > 0) {
        invalidPricingCount++;
        invalidPricingSet.add(product.id);
      }
    });

    // Update state for filtering
    setLowStockProducts(lowStockSet);
    setOutOfStockProducts(outOfStockSet);
    setExpiredProducts(expiredSet);
    setExpiringProducts(expiringSet);
    setInvalidPricingProducts(invalidPricingSet);

    return {
      totalProducts: allProducts.length,
      totalItems: allProducts.length,
      totalQuantity,
      totalStockValue,
      totalCostValue,
      totalMRPValue,
      lowStockItems: lowStockCount,
      lowStockCount,
      outOfStockItems: outOfStockCount,
      outOfStockCount,
      expiredCount,
      expiringCount,
      categoriesCount: categories.size,
      invalidPricingCount
    };
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 🔥 Check if window.inventory API is available
      if (!window.inventory) {
        throw new Error('Inventory API not available. Please restart the application.');
      }

      // 🔥 Fetch ALL products from InventoryDB via IPC
      const allProducts = await window.inventory.getAll();
      
      // 🔥 Calculate accurate stats from ALL products (client-side)
      const accurateStats = calculateAccurateStats(allProducts);

      setProducts(allProducts);
      setInventoryStats(accurateStats);

      console.log('📊 Accurate Inventory Stats (from ALL products):', {
        totalProducts: accurateStats.totalProducts,
        totalQuantity: accurateStats.totalQuantity,
        stockValue: `₹${accurateStats.totalStockValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
        lowStock: accurateStats.lowStockCount,
        outOfStock: accurateStats.outOfStockCount,
        expired: accurateStats.expiredCount,
        expiring: accurateStats.expiringCount,
        invalidPricing: accurateStats.invalidPricingCount
      });

    } catch (err: any) {
      console.error('Error fetching inventory:', err);
      setError(err.message || 'Failed to load inventory data');
    } finally {
      setIsLoading(false);
    }
  };

  const autoSaveDailyClosing = async () => {
    try {
      if (!window.inventory) return;

      // Fetch ALL products and calculate accurate stats
      const allProducts = await window.inventory.getAll();
      const stats = calculateAccurateStats(allProducts);
      
      const today = new Date().toISOString().split('T')[0];
      const existing = localStorage.getItem('dailyClosings');
      const closings: DailyClosing[] = existing ? JSON.parse(existing) : [];
      
      const todayIndex = closings.findIndex(c => c.date === today);
      
      const newClosing: DailyClosing = {
        date: today,
        timestamp: Date.now(),
        totalValue: stats.totalStockValue,
        totalQuantity: stats.totalQuantity,
        totalProducts: stats.totalProducts,
        lowStockCount: stats.lowStockCount,
        outOfStockCount: stats.outOfStockCount,
        expiredCount: stats.expiredCount
      };

      if (todayIndex >= 0) {
        closings[todayIndex] = newClosing;
      } else {
        closings.push(newClosing);
      }

      // Keep only last 90 days
      const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
      const filtered = closings.filter(c => c.timestamp >= ninetyDaysAgo);
      
      localStorage.setItem('dailyClosings', JSON.stringify(filtered));
      setDailyClosings(filtered);
      
      console.log('💾 Daily closing saved:', newClosing);
    } catch (error) {
      console.error('Error saving daily closing:', error);
    }
  };

  const manualSaveDailyClosing = async () => {
    await autoSaveDailyClosing();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const loadDailyClosings = () => {
    const existing = localStorage.getItem('dailyClosings');
    if (existing) {
      const closings = JSON.parse(existing);
      setDailyClosings(closings);
      setFilteredClosings(closings);
    }
  };

  const filterClosings = () => {
    let filtered = [...dailyClosings];

    if (closingDateFrom) {
      filtered = filtered.filter(c => new Date(c.date) >= new Date(closingDateFrom));
    }
    if (closingDateTo) {
      filtered = filtered.filter(c => new Date(c.date) <= new Date(closingDateTo));
    }

    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setFilteredClosings(filtered);
  };

  const filterProducts = () => {
    let filtered = [...products];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.itemName.toLowerCase().includes(term) ||
        p.itemCode.toLowerCase().includes(term) ||
        p.hsnCode?.toLowerCase().includes(term) ||
        p.batch?.toLowerCase().includes(term) ||
        p.manufacturer?.toLowerCase().includes(term) ||
        p.regionalName?.toLowerCase().includes(term) ||
        p.barcode?.toLowerCase().includes(term)
      );
    }

    // Category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(p => p.category === filterCategory);
    }

    // Manufacturer filter
    if (filterManufacturer !== 'all') {
      filtered = filtered.filter(p => p.manufacturer === filterManufacturer);
    }

    // 🔥 Stock status filter using accurate Sets
    if (filterStockStatus !== 'all') {
      if (filterStockStatus === 'low') {
        filtered = filtered.filter(p => lowStockProducts.has(p.id));
      } else if (filterStockStatus === 'out') {
        filtered = filtered.filter(p => outOfStockProducts.has(p.id));
      } else if (filterStockStatus === 'expired') {
        filtered = filtered.filter(p => expiredProducts.has(p.id));
      } else if (filterStockStatus === 'expiring') {
        filtered = filtered.filter(p => expiringProducts.has(p.id));
      } else if (filterStockStatus === 'invalid') {
        filtered = filtered.filter(p => invalidPricingProducts.has(p.id));
      }
    }

    // Date range filter
    if (dateFrom) {
      filtered = filtered.filter(p => new Date(p.updatedAt) >= new Date(dateFrom));
    }
    if (dateTo) {
      filtered = filtered.filter(p => new Date(p.updatedAt) <= new Date(dateTo));
    }

    setFilteredProducts(filtered);
    setCurrentPage(1);
  };

  const uniqueCategories = Array.from(new Set(products.map(p => p.category))).sort();
  const uniqueManufacturers = Array.from(new Set(products.map(p => p.manufacturer).filter(Boolean))).sort();

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  
  // 🔥 Show first 10 products in table (paginated)
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-primary mx-auto mb-4"></div>
          <p className="text-lg font-semibold text-gray-700">Loading inventory from database...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen p-6">
        <div className="text-center bg-red-50 border-2 border-red-200 rounded-xl p-8 max-w-md">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-xl font-bold text-red-800 mb-3">Failed to Load Inventory</h3>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <button
            onClick={fetchData}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-600 mt-1">SQLite Database • {products.length} total products</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={manualSaveDailyClosing}
            className={`px-6 py-3 rounded-xl font-semibold hover:shadow-xl transition-all flex items-center space-x-2 ${
              saveSuccess 
                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' 
                : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            <span>{saveSuccess ? '✓ Saved!' : 'Save Today\'s Closing'}</span>
          </button>
          <button
            onClick={() => setShowStockImport(true)}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:shadow-xl transition-all"
          >
            Import Stock
          </button>
        </div>
      </div>

      {/* 🔥 Analytics Cards - 100% Accurate from ALL products */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-l-4 border-blue-500">
          <p className="text-xs text-blue-700 font-bold mb-1">Total Products</p>
          <p className="text-2xl font-bold text-blue-900">{inventoryStats.totalProducts}</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border-l-4 border-green-500">
          <p className="text-xs text-green-700 font-bold mb-1">Total Quantity</p>
          <p className="text-2xl font-bold text-green-900">{inventoryStats.totalQuantity.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border-l-4 border-emerald-500">
          <p className="text-xs text-emerald-700 font-bold mb-1">Stock Value (SRate)</p>
          <p className="text-2xl font-bold text-emerald-900">₹{(inventoryStats.totalStockValue / 1000).toFixed(1)}K</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border-l-4 border-red-500">
          <p className="text-xs text-red-700 font-bold mb-1">Low Stock</p>
          <p className="text-2xl font-bold text-red-900">{inventoryStats.lowStockCount}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border-l-4 border-orange-500">
          <p className="text-xs text-orange-700 font-bold mb-1">Out of Stock</p>
          <p className="text-2xl font-bold text-orange-900">{inventoryStats.outOfStockCount}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border-l-4 border-purple-500">
          <p className="text-xs text-purple-700 font-bold mb-1">Expired</p>
          <p className="text-2xl font-bold text-purple-900">{inventoryStats.expiredCount}</p>
        </div>
        <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl p-4 border-l-4 border-pink-500">
          <p className="text-xs text-pink-700 font-bold mb-1">Expiring Soon</p>
          <p className="text-2xl font-bold text-pink-900">{inventoryStats.expiringCount}</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-4 border-l-4 border-yellow-500">
          <p className="text-xs text-yellow-700 font-bold mb-1">Price Errors</p>
          <p className="text-2xl font-bold text-yellow-900">{inventoryStats.invalidPricingCount}</p>
        </div>
      </div>

      {/* Daily Closing Report */}
      <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Daily Stock Closing History</h3>
          <div className="flex space-x-3">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-semibold text-gray-700">From:</label>
              <input
                type="date"
                value={closingDateFrom}
                onChange={(e) => setClosingDateFrom(e.target.value)}
                className="px-3 py-1.5 border-2 border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-semibold text-gray-700">To:</label>
              <input
                type="date"
                value={closingDateTo}
                onChange={(e) => setClosingDateTo(e.target.value)}
                className="px-3 py-1.5 border-2 border-gray-300 rounded-lg text-sm"
              />
            </div>
            <button
              onClick={() => {
                setClosingDateFrom('');
                setClosingDateTo('');
              }}
              className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300"
            >
              Clear
            </button>
          </div>
        </div>

        {filteredClosings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-bold">Date</th>
                  <th className="px-4 py-2 text-right font-bold">Stock Value (SRate)</th>
                  <th className="px-4 py-2 text-center font-bold">Products</th>
                  <th className="px-4 py-2 text-center font-bold">Quantity</th>
                  <th className="px-4 py-2 text-center font-bold">Low Stock</th>
                  <th className="px-4 py-2 text-center font-bold">Out of Stock</th>
                  <th className="px-4 py-2 text-center font-bold">Expired</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredClosings.slice(0, 30).map((closing, idx) => (
                  <tr key={idx} className="hover:bg-indigo-50">
                    <td className="px-4 py-2 font-bold text-gray-900">
                      {new Date(closing.date).toLocaleDateString('en-IN', { 
                        weekday: 'short', 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-green-700">
                      ₹{closing.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2 text-center font-semibold text-blue-700">{closing.totalProducts}</td>
                    <td className="px-4 py-2 text-center font-semibold text-purple-700">{closing.totalQuantity}</td>
                    <td className="px-4 py-2 text-center font-semibold text-orange-700">{closing.lowStockCount}</td>
                    <td className="px-4 py-2 text-center font-semibold text-red-700">{closing.outOfStockCount}</td>
                    <td className="px-4 py-2 text-center font-semibold text-purple-700">{closing.expiredCount || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No daily closings found for the selected date range.</p>
            <p className="text-sm mt-2">Click "Save Today's Closing" to record current stock value.</p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="Search by name, code, HSN, batch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-semibold"
          >
            <option value="all">All Categories</option>
            {uniqueCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={filterManufacturer}
            onChange={(e) => setFilterManufacturer(e.target.value)}
            className="px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-semibold"
          >
            <option value="all">All Manufacturers</option>
            {uniqueManufacturers.map(mfr => (
              <option key={mfr} value={mfr}>{mfr}</option>
            ))}
          </select>
          <select
            value={filterStockStatus}
            onChange={(e) => setFilterStockStatus(e.target.value)}
            className="px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-semibold"
          >
            <option value="all">All Stock Status</option>
            <option value="low">Low Stock Only</option>
            <option value="out">Out of Stock Only</option>
            <option value="expired">Expired Only</option>
            <option value="expiring">Expiring Soon</option>
            <option value="invalid">Price Errors (SRate &gt; MRP)</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm"
            placeholder="Updated From"
          />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing <span className="font-bold">{paginatedProducts.length}</span> of{' '}
            <span className="font-bold">{filteredProducts.length}</span> filtered • Total: <span className="font-bold">{products.length}</span>
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterCategory('all');
              setFilterManufacturer('all');
              setFilterStockStatus('all');
              setDateFrom('');
              setDateTo('');
            }}
            className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* 🔥 Excel-Style Table - Shows paginated products (10 per page) */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gradient-to-r from-primary to-indigo-600 text-white sticky top-0">
              <tr>
                <th className="px-3 py-3 text-left font-bold uppercase">Item Code</th>
                <th className="px-3 py-3 text-left font-bold uppercase">Item Name</th>
                <th className="px-3 py-3 text-left font-bold uppercase">HSN</th>
                <th className="px-3 py-3 text-center font-bold uppercase">Batch</th>
                <th className="px-3 py-3 text-center font-bold uppercase">Pack</th>
                <th className="px-3 py-3 text-center font-bold uppercase">Stock</th>
                <th className="px-3 py-3 text-center font-bold uppercase">ROL</th>
                <th className="px-3 py-3 text-right font-bold uppercase">Purchase</th>
                <th className="px-3 py-3 text-right font-bold uppercase">Selling</th>
                <th className="px-3 py-3 text-right font-bold uppercase">MRP</th>
                <th className="px-3 py-3 text-center font-bold uppercase">Tax%</th>
                <th className="px-3 py-3 text-center font-bold uppercase">Expiry</th>
                <th className="px-3 py-3 text-left font-bold uppercase">Manufacturer</th>
                <th className="px-3 py-3 text-center font-bold uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedProducts.map((product) => {
                const isLowStock = lowStockProducts.has(product.id);
                const isOutOfStock = outOfStockProducts.has(product.id);
                const isExpired = expiredProducts.has(product.id);
                const hasInvalidPricing = invalidPricingProducts.has(product.id);
                
                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-primary/5 cursor-pointer ${
                      isOutOfStock ? 'bg-red-50' : 
                      isLowStock ? 'bg-yellow-50' : 
                      isExpired ? 'bg-purple-50' : 
                      hasInvalidPricing ? 'bg-orange-50' : ''
                    }`}
                    onClick={() => setSelectedProduct(product)}
                  >
                    <td className="px-3 py-2.5 font-mono font-bold text-gray-900">{product.itemCode}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900">{product.itemName}</td>
                    <td className="px-3 py-2.5 text-gray-700">{product.hsnCode}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs">{product.batch || '-'}</td>
                    <td className="px-3 py-2.5 text-center">{product.pack}</td>
                    <td className={`px-3 py-2.5 text-center font-bold text-lg ${
                      isOutOfStock ? 'text-red-700' : isLowStock ? 'text-orange-700' : 'text-blue-700'
                    }`}>
                      {product.stockQuantity}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">{product.rol}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">₹{product.purchasePrice.toFixed(2)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${hasInvalidPricing ? 'text-red-700' : 'text-green-700'}`}>
                      ₹{product.sellingPriceTab.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">₹{product.mrp.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-center">{product.cgstRate + product.sgstRate}%</td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      {product.hasExpiryDate && product.expiryDate ? (
                        <span className={isExpired ? 'text-red-700 font-bold' : 'text-purple-700'}>
                          {new Date(product.expiryDate).toLocaleDateString()}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{product.manufacturer || '-'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {isOutOfStock && <span className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded-full">OUT</span>}
                      {isLowStock && !isOutOfStock && <span className="px-2 py-1 bg-orange-500 text-white text-[10px] font-bold rounded-full">LOW</span>}
                      {isExpired && <span className="px-2 py-1 bg-purple-500 text-white text-[10px] font-bold rounded-full">EXP</span>}
                      {hasInvalidPricing && <span className="px-2 py-1 bg-yellow-500 text-white text-[10px] font-bold rounded-full">ERR</span>}
                      {!isOutOfStock && !isLowStock && !isExpired && !hasInvalidPricing && <span className="px-2 py-1 bg-green-500 text-white text-[10px] font-bold rounded-full">OK</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold hover:shadow-lg transition-all"
          >
            Previous
          </button>
          <span className="text-sm font-semibold text-gray-700">
            Page {currentPage} of {totalPages || 1}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold hover:shadow-lg transition-all"
          >
            Next
          </button>
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-indigo-600 text-white px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold">Product Details</h2>
              <button onClick={() => setSelectedProduct(null)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">Item Code</p>
                  <p className="font-bold text-gray-900 font-mono">{selectedProduct.itemCode}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">Item Name</p>
                  <p className="font-bold text-gray-900">{selectedProduct.itemName}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">Stock Quantity</p>
                  <p className="text-2xl font-bold text-blue-700">{selectedProduct.stockQuantity}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">Reorder Level (ROL)</p>
                  <p className="text-xl font-bold text-orange-700">{selectedProduct.rol}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">Purchase Price</p>
                  <p className="text-xl font-bold text-green-700">₹{selectedProduct.purchasePrice.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">Selling Price (SRate)</p>
                  <p className="text-xl font-bold text-teal-700">₹{selectedProduct.sellingPriceTab.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">MRP</p>
                  <p className="text-xl font-bold text-indigo-700">₹{selectedProduct.mrp.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">HSN Code</p>
                  <p className="font-bold text-gray-900">{selectedProduct.hsnCode}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">Batch</p>
                  <p className="font-bold text-gray-900 font-mono">{selectedProduct.batch || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">Manufacturer</p>
                  <p className="font-bold text-gray-900">{selectedProduct.manufacturer || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">Tax Rate</p>
                  <p className="font-bold text-gray-900">CGST: {selectedProduct.cgstRate}% | SGST: {selectedProduct.sgstRate}%</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 font-bold">Expiry Date</p>
                  <p className="font-bold text-purple-700">
                    {selectedProduct.hasExpiryDate && selectedProduct.expiryDate
                      ? new Date(selectedProduct.expiryDate).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock Import Modal */}
      {showStockImport && (
        <StockImport 
          onClose={() => { 
            setShowStockImport(false); 
            fetchData(); 
          }} 
        />
      )}
    </div>
  );
}
