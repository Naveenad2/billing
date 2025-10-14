import { Product } from '../../services/inventoryDB';

interface ProductListProps {
  products: Product[];
  viewMode: 'grid' | 'list';
  onAddStock: (product: Product) => void;
  onDelete: (productId: string) => void;
}

export default function ProductList({ products, viewMode, onAddStock, onDelete }: ProductListProps) {
  if (products.length === 0) {
    return (
      <div className="card text-center py-16 animate-fadeIn">
        <div className="flex flex-col items-center space-y-4">
          <div className="bg-slate-100 p-8 rounded-full">
            <svg className="w-24 h-24 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">No Products Found</h3>
            <p className="text-slate-600">Start by adding your first product to the inventory</p>
          </div>
        </div>
      </div>
    );
  }

  const getStockStatusColor = (product: Product) => {
    if (product.stockQuantity === 0) return 'text-red-600 bg-red-100';
    if (product.stockQuantity <= product.minStockLevel) return 'text-orange-600 bg-orange-100';
    return 'text-green-600 bg-green-100';
  };

  const getStockStatusText = (product: Product) => {
    if (product.stockQuantity === 0) return 'Out of Stock';
    if (product.stockQuantity <= product.minStockLevel) return 'Low Stock';
    return 'In Stock';
  };

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fadeIn">
        {products.map((product) => (
          <div
            key={product.id}
            className="card hover:scale-105 transition-all duration-300 group relative overflow-hidden"
          >
            {/* Stock Status Badge */}
            <div className="absolute top-4 right-4 z-10">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStockStatusColor(product)}`}>
                {getStockStatusText(product)}
              </span>
            </div>

            {/* Product Image Placeholder */}
            <div className="bg-gradient-to-br from-slate-100 to-slate-200 h-48 rounded-xl flex items-center justify-center mb-4 group-hover:from-primary/10 group-hover:to-indigo-100 transition-all">
              <svg className="w-20 h-20 text-slate-400 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>

            {/* Product Info */}
            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800 truncate group-hover:text-primary transition-colors">
                  {product.productName}
                </h3>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                    {product.productCode}
                  </span>
                  <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                    {product.shortKey}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Category:</span>
                <span className="font-semibold text-slate-800">{product.category}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Brand:</span>
                <span className="font-semibold text-slate-800">{product.brand || 'N/A'}</span>
              </div>

              <div className="border-t border-slate-200 pt-3 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">Price:</span>
                  <span className="text-lg font-bold text-green-600">₹{product.sellingPrice.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Stock:</span>
                  <span className="text-xl font-bold text-primary">{product.stockQuantity} {product.unit}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 pt-3">
                <button
                  onClick={() => onAddStock(product)}
                  className="flex-1 bg-gradient-to-r from-primary to-indigo-600 text-white py-2 rounded-lg hover:shadow-lg transition-all font-semibold text-sm"
                >
                  + Add Stock
                </button>
                <button
                  onClick={() => onDelete(product.id)}
                  className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // List View
  return (
    <div className="card animate-fadeIn">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="text-left py-4 px-4 font-semibold text-slate-700">Product</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-700">Code/Key</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-700">Category</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-700">Brand</th>
              <th className="text-right py-4 px-4 font-semibold text-slate-700">Purchase Price</th>
              <th className="text-right py-4 px-4 font-semibold text-slate-700">Selling Price</th>
              <th className="text-center py-4 px-4 font-semibold text-slate-700">Stock</th>
              <th className="text-center py-4 px-4 font-semibold text-slate-700">Status</th>
              <th className="text-center py-4 px-4 font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="table-row group">
                <td className="py-4 px-4">
                  <div>
                    <p className="font-semibold text-slate-800 group-hover:text-primary transition-colors">
                      {product.productName}
                    </p>
                    {product.description && (
                      <p className="text-xs text-slate-500 truncate max-w-xs">{product.description}</p>
                    )}
                  </div>
                </td>
                <td className="py-4 px-4">
                  <div className="flex flex-col space-y-1">
                    <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded inline-block">
                      {product.productCode}
                    </span>
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded inline-block">
                      {product.shortKey}
                    </span>
                  </div>
                </td>
                <td className="py-4 px-4 text-slate-700">{product.category}</td>
                <td className="py-4 px-4 text-slate-700">{product.brand || 'N/A'}</td>
                <td className="py-4 px-4 text-right font-semibold text-slate-600">
                  ₹{product.purchasePrice.toLocaleString('en-IN')}
                </td>
                <td className="py-4 px-4 text-right font-bold text-green-600">
                  ₹{product.sellingPrice.toLocaleString('en-IN')}
                </td>
                <td className="py-4 px-4 text-center">
                  <div className="inline-flex items-center space-x-1">
                    <span className="text-xl font-bold text-primary">{product.stockQuantity}</span>
                    <span className="text-sm text-slate-500">{product.unit}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Min: {product.minStockLevel}</p>
                </td>
                <td className="py-4 px-4 text-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStockStatusColor(product)}`}>
                    {getStockStatusText(product)}
                  </span>
                </td>
                <td className="py-4 px-4">
                  <div className="flex items-center justify-center space-x-2">
                    <button
                      onClick={() => onAddStock(product)}
                      className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all"
                      title="Add Stock"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <button
                      className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all"
                      title="View Details"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(product.id)}
                      className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all"
                      title="Delete Product"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
