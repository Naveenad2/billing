// src/services/inventoryDB.ts
import { get, set } from 'idb-keyval';

export interface Product {
  // Core identification fields
  id: string;
  itemCode: string; // Column A - Item Code
  itemName: string; // Column B - Item Name (was productName)
  regionalName?: string; // Column C - Regional Name
  
  // Product classification
  hsnCode: string; // Column D - HSNCODE
  batch?: string; // Column E - Batch
  category: string; // Column F - Category
  manufacturer?: string; // Column G - Manufacturer
  
  // Pricing fields
  rol: number; // Column H - ROL (Reorder Level)
  altUnit?: string; // Column K - Alt Unit (kept as requested)
  pack: string; // Column L - Pack
  purchasePrice: number; // Column M - PRate(Strip) - Purchase Rate per Strip
  sellingPriceTab: number; // Column N - SRate(Tab) - Selling Rate per Tablet
  mrp: number; // Column O - MRP(Tab) - Maximum Retail Price per Tablet
  
  // Stock management
  stockQuantity: number; // Column P - Quantity
  minStockLevel: number; // For alerts (derived from ROL)
  maxStockLevel: number; // Optional max stock
  
  // Tax fields
  cgstRate: number; // Column Q - CGST%
  sgstRate: number; // Column R - SGST%
  igstRate: number; // Column S - IGST%
  
  // Tax inclusion flags
  prTaxIncluded: boolean; // Column T - PR Taxincl (Purchase Rate Tax Included)
  slTaxIncluded: boolean; // Column U - SL Taxincl (Selling Rate Tax Included)
  
  // Expiry tracking
  hasExpiryDate: boolean; // Column V - Expiry (TRUE/FALSE)
  expiryDate?: string; // Column W - Expiry Date (if hasExpiryDate is true)
  
  // Legacy/optional fields (kept for backward compatibility)
  productCode?: string; // Same as itemCode (for backward compatibility)
  productName?: string; // Same as itemName (for backward compatibility)
  shortKey?: string; // Quick search key
  brand?: string; // Brand/Manufacturer
  unit?: string; // Primary unit (from pack)
  sellingPrice?: number; // Legacy field (use sellingPriceTab)
  supplier?: string; // Supplier information
  barcode?: string; // Product barcode
  description?: string; // Additional notes
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface InventoryStats {
  totalProducts: number;
  totalItems: number;        // ADD THIS
  totalQuantity: number;     // ADD THIS
  totalStockValue: number;
  totalCostValue: number;    // ADD THIS
  totalMRPValue: number;     // ADD THIS
  lowStockCount: number;
  lowStockItems: number;     // ADD THIS
  expiredCount: number;
  expiringCount: number;
  categoriesCount: number;
  outOfStockCount: number;
  outOfStockItems: number;   // ADD THIS
}


const PRODUCTS_KEY = 'offline_products';

// Get all products
export const getAllProducts = async (): Promise<Product[]> => {
  try {
    const products = await get(PRODUCTS_KEY);
    return products || [];
  } catch (error) {
    console.error('Error getting products:', error);
    return [];
  }
};

// src/services/inventoryDB.ts
// Add these helpers to your existing file that already has getAllProducts()

// src/services/inventoryDB.ts

// Helper to open inventory DB with the byCodeBatch index
function openInventoryDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // IMPORTANT: Use your actual DB name and version here
    const req = indexedDB.open('InventoryDB', 1);
    
    req.onerror = () => reject(req.error);
    
    req.onupgradeneeded = () => {
      const db = req.result;
      let productsStore;
      
      // Create products store if it doesn't exist
      if (!db.objectStoreNames.contains('products')) {
        productsStore = db.createObjectStore('products', { keyPath: 'id' });
      } else {
        productsStore = req.transaction!.objectStore('products');
      }
      
      // Create the composite index if it doesn't exist
      if (!productsStore.indexNames.contains('byCodeBatch')) {
        productsStore.createIndex('byCodeBatch', ['itemCode', 'batch'], { unique: false });
      }
    };
    
    req.onsuccess = () => resolve(req.result);
  });
}

// Get stock for a specific itemCode + batch
export async function getStockByCodeBatch(itemCode: string, batch: string): Promise<{ id: string; stock: number }> {
  const db = await openInventoryDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products'], 'readonly');
    const store = tx.objectStore('products');
    const index = store.index('byCodeBatch');
    
    // Trim and normalize to avoid key mismatch
    const normalizedCode = (itemCode || '').trim();
    const normalizedBatch = (batch || '').trim();
    
    const getReq = index.get([normalizedCode, normalizedBatch]);
    
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        resolve({ 
          id: record.id, 
          stock: Number(record.stockQuantity || 0) 
        });
      } else {
        // Not found - return 0 stock
        resolve({ id: '', stock: 0 });
      }
    };
    
    getReq.onerror = () => reject(getReq.error);
  });
}

// Decrement stock for a specific itemCode + batch
export async function decrementStockByCodeBatch(
  itemCode: string, 
  batch: string, 
  qty: number
): Promise<{ success: boolean; newStock: number; itemName: string }> {
  const db = await openInventoryDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products'], 'readwrite');
    const store = tx.objectStore('products');
    const index = store.index('byCodeBatch');
    
    // Trim and normalize
    const normalizedCode = (itemCode || '').trim();
    const normalizedBatch = (batch || '').trim();
    
    const getReq = index.get([normalizedCode, normalizedBatch]);
    
    getReq.onsuccess = () => {
      const record = getReq.result;
      
      if (!record) {
        // Record not found - return failure
        resolve({ success: false, newStock: 0, itemName: '' });
        return;
      }
      
      const currentStock = Number(record.stockQuantity || 0);
      const newStock = Math.max(0, currentStock - qty);
      
      // Update the stock quantity
      record.stockQuantity = newStock;
      
      const putReq = store.put(record);
      
      putReq.onsuccess = () => {
        resolve({ 
          success: true, 
          newStock, 
          itemName: record.itemName || itemCode 
        });
      };
      
      putReq.onerror = () => reject(putReq.error);
    };
    
    getReq.onerror = () => reject(getReq.error);
  });
}



// Add product
export const addProduct = async (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> => {
  const products = await getAllProducts();
  
  const newProduct: Product = {
    ...product,
    id: `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    // Set backward compatibility fields
    productCode: product.itemCode,
    productName: product.itemName,
    sellingPrice: product.sellingPriceTab,
    minStockLevel: product.rol || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  products.push(newProduct);
  await set(PRODUCTS_KEY, products);
  
  return newProduct;
};

// Get product by ID
export const getProductById = async (id: string): Promise<Product | undefined> => {
  const products = await getAllProducts();
  return products.find(prod => prod.id === id);
};

// Get product by item code
export const getProductByItemCode = async (itemCode: string): Promise<Product | undefined> => {
  const products = await getAllProducts();
  return products.find(prod => prod.itemCode === itemCode);
};

// Update product
export const updateProduct = async (id: string, updates: Partial<Product>): Promise<Product | null> => {
  const products = await getAllProducts();
  const index = products.findIndex(prod => prod.id === id);
  
  if (index === -1) return null;
  
  products[index] = {
    ...products[index],
    ...updates,
    // Update backward compatibility fields
    productCode: updates.itemCode || products[index].itemCode,
    productName: updates.itemName || products[index].itemName,
    sellingPrice: updates.sellingPriceTab || products[index].sellingPriceTab,
    updatedAt: new Date().toISOString(),
  };
  
  await set(PRODUCTS_KEY, products);
  return products[index];
};

// Delete product
export const deleteProduct = async (id: string): Promise<boolean> => {
  const products = await getAllProducts();
  const filtered = products.filter(prod => prod.id !== id);
  
  if (filtered.length === products.length) return false;
  
  await set(PRODUCTS_KEY, filtered);
  return true;
};

// Update stock
export const updateStock = async (
  id: string,
  quantity: number,
  type: 'add' | 'subtract'
): Promise<Product | null> => {
  const products = await getAllProducts();
  const index = products.findIndex(prod => prod.id === id);
  
  if (index === -1) return null;
  
  const currentStock = products[index].stockQuantity;
  const newStock = type === 'add' ? currentStock + quantity : currentStock - quantity;
  
  products[index] = {
    ...products[index],
    stockQuantity: Math.max(0, newStock),
    updatedAt: new Date().toISOString(),
  };
  
  await set(PRODUCTS_KEY, products);
  return products[index];
};

// Search products
export const searchProducts = async (searchTerm: string): Promise<Product[]> => {
  const products = await getAllProducts();
  const term = searchTerm.toLowerCase();
  
  return products.filter(
    prod =>
      prod.itemName.toLowerCase().includes(term) ||
      prod.itemCode.toLowerCase().includes(term) ||
      prod.regionalName?.toLowerCase().includes(term) ||
      prod.shortKey?.toLowerCase().includes(term) ||
      prod.barcode?.toLowerCase().includes(term) ||
      prod.batch?.toLowerCase().includes(term) ||
      prod.hsnCode?.toLowerCase().includes(term)
  );
};

// Get low stock products (below ROL - Reorder Level)
export const getLowStockProducts = async (): Promise<Product[]> => {
  const products = await getAllProducts();
  return products.filter(prod => prod.stockQuantity <= prod.rol && prod.stockQuantity > 0);
};

// Get out of stock products
export const getOutOfStockProducts = async (): Promise<Product[]> => {
  const products = await getAllProducts();
  return products.filter(prod => prod.stockQuantity === 0);
};

// Get products by category
export const getProductsByCategory = async (category: string): Promise<Product[]> => {
  const products = await getAllProducts();
  return products.filter(prod => prod.category === category);
};

// Get products expiring soon (within 30 days)
export const getExpiringProducts = async (daysThreshold: number = 30): Promise<Product[]> => {
  const products = await getAllProducts();
  const today = new Date();
  const thresholdDate = new Date(today.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
  
  return products.filter(prod => {
    if (!prod.hasExpiryDate || !prod.expiryDate) return false;
    const expiryDate = new Date(prod.expiryDate);
    return expiryDate <= thresholdDate && expiryDate >= today;
  });
};

// Get expired products
export const getExpiredProducts = async (): Promise<Product[]> => {
  const products = await getAllProducts();
  const today = new Date();
  
  return products.filter(prod => {
    if (!prod.hasExpiryDate || !prod.expiryDate) return false;
    const expiryDate = new Date(prod.expiryDate);
    return expiryDate < today;
  });
};

// Get products by batch
export const getProductsByBatch = async (batch: string): Promise<Product[]> => {
  const products = await getAllProducts();
  return products.filter(prod => prod.batch === batch);
};

// Get products by manufacturer
export const getProductsByManufacturer = async (manufacturer: string): Promise<Product[]> => {
  const products = await getAllProducts();
  return products.filter(prod => prod.manufacturer?.toLowerCase() === manufacturer.toLowerCase());
};

// Calculate total stock value (based on purchase price)
export const calculateTotalStockValue = async (): Promise<number> => {
  const products = await getAllProducts();
  return products.reduce((total, prod) => {
    return total + (prod.stockQuantity * prod.purchasePrice);
  }, 0);
};

// Get products with tax included
export const getProductsWithTaxIncluded = async (type: 'purchase' | 'selling'): Promise<Product[]> => {
  const products = await getAllProducts();
  return products.filter(prod => 
    type === 'purchase' ? prod.prTaxIncluded : prod.slTaxIncluded
  );
};

// Get unique categories
export const getUniqueCategories = async (): Promise<string[]> => {
  const products = await getAllProducts();
  const categories = new Set<string>();
  products.forEach(prod => categories.add(prod.category));
  return Array.from(categories).sort();
};

// Get inventory statistics - THIS WAS MISSING!
// Get inventory statistics
export const getInventoryStats = async (): Promise<InventoryStats> => {
  const products = await getAllProducts();
  const lowStock = await getLowStockProducts();
  const expired = await getExpiredProducts();
  const expiring = await getExpiringProducts();
  const outOfStock = await getOutOfStockProducts();
  const categories = await getUniqueCategories();
  
  // Calculate totals
  const totalQuantity = products.reduce((sum, prod) => sum + prod.stockQuantity, 0);
  const totalStockValue = products.reduce((sum, prod) => sum + (prod.stockQuantity * prod.purchasePrice), 0);
  const totalCostValue = products.reduce((sum, prod) => sum + (prod.stockQuantity * prod.purchasePrice), 0);
  const totalMRPValue = products.reduce((sum, prod) => sum + (prod.stockQuantity * prod.mrp), 0);
  
  return {
    totalProducts: products.length,
    totalItems: products.length,
    totalQuantity: totalQuantity,
    totalStockValue: totalStockValue,
    totalCostValue: totalCostValue,
    totalMRPValue: totalMRPValue,
    lowStockCount: lowStock.length,
    lowStockItems: lowStock.length,
    expiredCount: expired.length,
    expiringCount: expiring.length,
    categoriesCount: categories.length,
    outOfStockCount: outOfStock.length,
    outOfStockItems: outOfStock.length
  };
};


// Bulk update products (for imports)
export const bulkAddProducts = async (productsToAdd: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Product[]> => {
  const existingProducts = await getAllProducts();
  
  const newProducts: Product[] = productsToAdd.map(product => ({
    ...product,
    id: `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    productCode: product.itemCode,
    productName: product.itemName,
    sellingPrice: product.sellingPriceTab,
    minStockLevel: product.rol || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  
  const allProducts = [...existingProducts, ...newProducts];
  await set(PRODUCTS_KEY, allProducts);
  
  return newProducts;
};

// Export all products (for backup/export)
export const exportAllProducts = async (): Promise<string> => {
  const products = await getAllProducts();
  return JSON.stringify(products, null, 2);
};

// Import products (for restore/import)
export const importProducts = async (jsonData: string): Promise<boolean> => {
  try {
    const products: Product[] = JSON.parse(jsonData);
    await set(PRODUCTS_KEY, products);
    return true;
  } catch (error) {
    console.error('Error importing products:', error);
    return false;
  }
};

// Clear all products (for testing/reset)
export const clearAllProducts = async (): Promise<boolean> => {
  try {
    await set(PRODUCTS_KEY, []);
    return true;
  } catch (error) {
    console.error('Error clearing products:', error);
    return false;
  }
};
