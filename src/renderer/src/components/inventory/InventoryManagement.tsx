// src/components/inventory/InventoryManagement.tsx
// Enhanced: Shows Purchase History + New Purchase Entry Button (Removed Daily Closing)

import { useState, useEffect } from 'react';
import StockImport from '../StockImport';
import PurchaseInvoice from '../PurchaseInvoice'; // 🔥 Import Purchase Invoice Component

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
  totalStockValue: number;
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

// 🔥 Purchase Invoice Record Type (from Purchase DB)
interface PurchaseInvoiceRecord {
  id: string;
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
  items: Array<{
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
  }>;
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
}

// 🔥 Declare window APIs
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
    purchase?: {
      getAll: () => Promise<PurchaseInvoiceRecord[]>;
      getByProduct: (itemCode: string, batch: string) => Promise<PurchaseInvoiceRecord[]>;
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
  const [showPurchaseInvoice, setShowPurchaseInvoice] = useState(false); // 🔥 New state for purchase invoice
  
  // Filters
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterManufacturer, setFilterManufacturer] = useState('all');
  const [filterStockStatus, setFilterStockStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Stats
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

  // 🔥 Purchase history for selected product
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseInvoiceRecord[]>([]);
  const [showPurchaseHistory, setShowPurchaseHistory] = useState(false);

  // Categorized product sets
  const [lowStockProducts, setLowStockProducts] = useState<Set<string>>(new Set());
  const [outOfStockProducts, setOutOfStockProducts] = useState<Set<string>>(new Set());
  const [expiredProducts, setExpiredProducts] = useState<Set<string>>(new Set());
  const [expiringProducts, setExpiringProducts] = useState<Set<string>>(new Set());
  const [invalidPricingProducts, setInvalidPricingProducts] = useState<Set<string>>(new Set());

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [searchTerm, products, filterCategory, filterManufacturer, filterStockStatus, dateFrom, dateTo]);

  // 🔥 Calculate accurate stats from ALL products
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

      totalQuantity += qty;
      totalStockValue += qty * srate;
      totalCostValue += qty * prate;
      totalMRPValue += qty * mrp;

      if (product.category) {
        categories.add(product.category);
      }

      if (qty > 0 && qty <= rol) {
        lowStockCount++;
        lowStockSet.add(product.id);
      }

      if (qty === 0) {
        outOfStockCount++;
        outOfStockSet.add(product.id);
      }

      if (product.hasExpiryDate && product.expiryDate) {
        const expiryDate = new Date(product.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        
        if (expiryDate < today) {
          expiredCount++;
          expiredSet.add(product.id);
        } else if (expiryDate >= today && expiryDate <= thirtyDaysFromNow) {
          expiringCount++;
          expiringSet.add(product.id);
        }
      }

      if (srate > mrp && mrp > 0) {
        invalidPricingCount++;
        invalidPricingSet.add(product.id);
      }
    });

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

      if (!window.inventory) {
        throw new Error('Inventory API not available. Please restart the application.');
      }

      const allProducts = await window.inventory.getAll();
      const accurateStats = calculateAccurateStats(allProducts);

      setProducts(allProducts);
      setInventoryStats(accurateStats);

      console.log('📊 Accurate Inventory Stats:', accurateStats);

    } catch (err: any) {
      console.error('Error fetching inventory:', err);
      setError(err.message || 'Failed to load inventory data');
    } finally {
      setIsLoading(false);
    }
  };

  // 🔥 Fetch purchase history for a product
  const fetchPurchaseHistory = async (product: Product) => {
    try {
      if (!window.purchase) {
        console.warn('Purchase API not available');
        return;
      }

      const history = await window.purchase.getByProduct(product.itemCode, product.batch || '');
      setPurchaseHistory(history);
      setShowPurchaseHistory(true);
      setSelectedProduct(product);

      console.log('📦 Purchase History for', product.itemName, ':', history);
    } catch (error) {
      console.error('Error fetching purchase history:', error);
      setPurchaseHistory([]);
    }
  };

  const filterProducts = () => {
    let filtered = [...products];

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

    if (filterCategory !== 'all') {
      filtered = filtered.filter(p => p.category === filterCategory);
    }

    if (filterManufacturer !== 'all') {
      filtered = filtered.filter(p => p.manufacturer === filterManufacturer);
    }

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
          {/* 🔥 NEW PURCHASE ENTRY BUTTON */}
          <button
            onClick={() => setShowPurchaseInvoice(true)}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-xl transition-all flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Purchase Entry</span>
          </button>
          <button
            onClick={() => setShowStockImport(true)}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:shadow-xl transition-all"
          >
            Import Stock
          </button>
        </div>
      </div>

      {/* Analytics Cards */}
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

      {/* CONTINUE TO PART 2 FOR TABLE AND MODALS... */}
      {/* 🔥 Excel-Style Inventory Table with Purchase History Button */}
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
                <th className="px-3 py-3 text-center font-bold uppercase">Actions</th>
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
                    className={`hover:bg-primary/5 ${
                      isOutOfStock ? 'bg-red-50' : 
                      isLowStock ? 'bg-yellow-50' : 
                      isExpired ? 'bg-purple-50' : 
                      hasInvalidPricing ? 'bg-orange-50' : ''
                    }`}
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
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex space-x-1 justify-center">
                        <button
                          onClick={() => setSelectedProduct(product)}
                          className="px-2 py-1 bg-blue-500 text-white text-[10px] font-bold rounded hover:bg-blue-600"
                          title="View Details"
                        >
                          👁️
                        </button>
                        <button
                          onClick={() => fetchPurchaseHistory(product)}
                          className="px-2 py-1 bg-indigo-500 text-white text-[10px] font-bold rounded hover:bg-indigo-600"
                          title="Purchase History"
                        >
                          📦
                        </button>
                      </div>
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

      {/* 🔥 Product Detail Modal */}
      {selectedProduct && !showPurchaseHistory && (
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

      {/* 🔥 Purchase History Modal */}
      // 🔥 FIXED: Replace the Purchase History Modal section in Part 2 with this:

{/* 🔥 Purchase History Modal - FIXED VERSION */}
{showPurchaseHistory && selectedProduct && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-4 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">📦 Purchase History</h2>
          <p className="text-sm mt-1">{selectedProduct.itemName} ({selectedProduct.itemCode})</p>
          {selectedProduct.batch && <p className="text-xs mt-1">Batch: {selectedProduct.batch}</p>}
        </div>
        <button onClick={() => { setShowPurchaseHistory(false); setSelectedProduct(null); }} className="p-2 hover:bg-white/10 rounded-lg transition-all">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
        {purchaseHistory.length > 0 ? (
          <div className="space-y-4">
            {purchaseHistory.map((invoice, idx) => {
              // 🔥 FIXED: Find matching items with better logic
              const matchingItems = invoice.items.filter(item => {
                const nameMatch = item.productName.toLowerCase().includes(selectedProduct.itemName.toLowerCase()) ||
                                  selectedProduct.itemName.toLowerCase().includes(item.productName.toLowerCase());
                const batchMatch = selectedProduct.batch ? 
                                   item.batch.toLowerCase().includes(selectedProduct.batch.toLowerCase()) : 
                                   true;
                return nameMatch || batchMatch;
              });

              // 🔥 If no matches found, show ALL items in the invoice
              const itemsToShow = matchingItems.length > 0 ? matchingItems : invoice.items;

              return (
                <div key={invoice.id} className="border-2 border-indigo-200 rounded-xl p-4 hover:border-indigo-400 transition-all bg-indigo-50/50">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-indigo-900">Invoice: {invoice.invoiceNo}</h3>
                      <p className="text-sm text-gray-600 mt-1">Date: {new Date(invoice.header.invoiceDate).toLocaleDateString('en-IN')}</p>
                      <p className="text-sm text-gray-600">Supplier: <span className="font-bold">{invoice.party.name}</span></p>
                      {matchingItems.length > 0 && matchingItems.length !== invoice.items.length && (
                        <p className="text-xs text-blue-600 mt-1">✓ Found {matchingItems.length} matching item(s) in this invoice</p>
                      )}
                      {matchingItems.length === 0 && (
                        <p className="text-xs text-orange-600 mt-1">ℹ️ Showing all items (no exact match found)</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-700">₹{invoice.totals.total.toFixed(2)}</p>
                      <p className="text-xs text-gray-600">Total Amount</p>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <h4 className="text-xs font-bold text-gray-700 mb-2">
                      Items Purchased: ({itemsToShow.length} of {invoice.items.length} items)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-2 py-1 text-left font-bold">#</th>
                            <th className="px-2 py-1 text-left font-bold">Product</th>
                            <th className="px-2 py-1 text-center font-bold">Batch</th>
                            <th className="px-2 py-1 text-center font-bold">Expiry</th>
                            <th className="px-2 py-1 text-center font-bold">Qty</th>
                            <th className="px-2 py-1 text-center font-bold">Free</th>
                            <th className="px-2 py-1 text-right font-bold">Rate</th>
                            <th className="px-2 py-1 text-right font-bold">MRP</th>
                            <th className="px-2 py-1 text-center font-bold">Dis%</th>
                            <th className="px-2 py-1 text-right font-bold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {itemsToShow.map((item, itemIdx) => {
                            // 🔥 Highlight matching rows
                            const isMatch = item.productName.toLowerCase().includes(selectedProduct.itemName.toLowerCase()) ||
                                          selectedProduct.itemName.toLowerCase().includes(item.productName.toLowerCase()) ||
                                          (selectedProduct.batch && item.batch.toLowerCase().includes(selectedProduct.batch.toLowerCase()));
                            
                            return (
                              <tr key={itemIdx} className={isMatch ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-blue-50'}>
                                <td className="px-2 py-1.5 text-center font-bold text-gray-700">{item.slNo}</td>
                                <td className="px-2 py-1.5 font-semibold">
                                  {item.productName}
                                  {isMatch && <span className="ml-2 px-1.5 py-0.5 bg-green-500 text-white text-[9px] rounded-full">MATCH</span>}
                                </td>
                                <td className="px-2 py-1.5 text-center font-mono">{item.batch}</td>
                                <td className="px-2 py-1.5 text-center text-purple-700">{item.exp}</td>
                                <td className="px-2 py-1.5 text-center font-bold text-blue-700">{item.qty}</td>
                                <td className="px-2 py-1.5 text-center text-orange-700">{item.free}</td>
                                <td className="px-2 py-1.5 text-right font-semibold">₹{item.rate.toFixed(2)}</td>
                                <td className="px-2 py-1.5 text-right">₹{item.mrp.toFixed(2)}</td>
                                <td className="px-2 py-1.5 text-center">{item.dis}%</td>
                                <td className="px-2 py-1.5 text-right font-bold text-green-700">₹{item.value.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mt-3">
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-[10px] text-blue-700 font-bold">Total Qty</p>
                      <p className="text-lg font-bold text-blue-900">{invoice.totals.totalQty}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-2">
                      <p className="text-[10px] text-purple-700 font-bold">Total Free</p>
                      <p className="text-lg font-bold text-purple-900">{invoice.totals.totalFree}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2">
                      <p className="text-[10px] text-green-700 font-bold">Total GST</p>
                      <p className="text-lg font-bold text-green-900">₹{invoice.totals.totalGST.toFixed(2)}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-2">
                      <p className="text-[10px] text-indigo-700 font-bold">Grand Total</p>
                      <p className="text-lg font-bold text-indigo-900">₹{invoice.totals.total.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <svg className="w-20 h-20 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-lg font-semibold text-gray-700">No Purchase History Found</p>
            <p className="text-sm text-gray-500 mt-2">This product has not been purchased yet or Purchase DB is empty.</p>
          </div>
        )}
      </div>
    </div>
  </div>
)}


      {/* 🔥 Stock Import Modal */}
      {showStockImport && (
        <StockImport 
          onClose={() => { 
            setShowStockImport(false); 
            fetchData(); 
          }} 
        />
      )}

      {/* 🔥 Purchase Invoice Modal (New Purchase Entry) */}
      {showPurchaseInvoice && (
        <PurchaseInvoice 
          onClose={() => { 
            setShowPurchaseInvoice(false); 
            fetchData(); // Reload inventory after purchase entry
          }} 
        />
      )}
    </div>
  );
}
