// src/components/ProductSearch.tsx
import { useState, useEffect } from 'react';
import { searchProducts, Product } from '../services/inventoryDB';

export default function ProductSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (searchTerm.length >= 2) {
        handleSearch();
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(delaySearch);
  }, [searchTerm]);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const products = await searchProducts(searchTerm);
      setResults(products);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Item Code, Item Name, HSN Code, Batch..."
            className="w-full px-4 py-3 pl-12 text-lg border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg className="absolute left-4 top-4 w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {loading && (
            <svg className="absolute right-4 top-4 w-6 h-6 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Found <span className="font-bold text-blue-600">{results.length}</span> products
        </p>
      </div>

      {/* Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Results List */}
        <div className="space-y-2 max-h-[600px] overflow-auto">
          {results.map((product) => (
            <div
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-lg ${
                selectedProduct?.id === product.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{product.itemName}</h3>
                  <p className="text-sm text-gray-600">{product.regionalName}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  product.stockQuantity > product.rol
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  Stock: {product.stockQuantity}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div><strong>Code:</strong> {product.itemCode}</div>
                <div><strong>HSN:</strong> {product.hsnCode}</div>
                <div><strong>MRP:</strong> ₹{product.mrp}</div>
                <div><strong>Batch:</strong> {product.batch || '-'}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Product Details */}
        {selectedProduct && (
          <div className="border-2 border-blue-300 rounded-lg p-6 bg-gradient-to-br from-blue-50 to-indigo-50 sticky top-0 max-h-[600px] overflow-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Product Details</h2>
            
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="bg-white rounded-lg p-4 shadow">
                <h3 className="font-bold text-blue-900 mb-3">Basic Information</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600">Item Code</p>
                    <p className="font-bold">{selectedProduct.itemCode}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">HSN Code</p>
                    <p className="font-bold">{selectedProduct.hsnCode}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-600">Item Name</p>
                    <p className="font-bold">{selectedProduct.itemName}</p>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="bg-white rounded-lg p-4 shadow">
                <h3 className="font-bold text-green-900 mb-3">Pricing</h3>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600">Purchase</p>
                    <p className="font-bold text-lg text-blue-700">₹{selectedProduct.purchasePrice}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Selling</p>
                    <p className="font-bold text-lg text-green-700">₹{selectedProduct.sellingPriceTab}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">MRP</p>
                    <p className="font-bold text-lg text-orange-700">₹{selectedProduct.mrp}</p>
                  </div>
                </div>
              </div>

              {/* Stock */}
              <div className="bg-white rounded-lg p-4 shadow">
                <h3 className="font-bold text-purple-900 mb-3">Stock</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600">Current Stock</p>
                    <p className="font-bold text-2xl text-purple-700">{selectedProduct.stockQuantity}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Reorder Level</p>
                    <p className="font-bold text-xl">{selectedProduct.rol}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
