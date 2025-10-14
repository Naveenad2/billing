import { useState, useEffect } from 'react';
import { Product } from '../services/inventoryDB';

interface ProductFormProps {
  product: Product | null;
  onSubmit: (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}

export default function ProductForm({ product, onSubmit, onClose }: ProductFormProps) {
  const [formData, setFormData] = useState({
    productName: '',
    productCode: '',
    shortKey: '',
    category: '',
    brand: '',
    unit: 'pieces',
    pack: '1',
    hsnCode: '',
    purchasePrice: 0,
    sellingPrice: 0,
    mrp: 0,
    stockQuantity: 0,
    minStockLevel: 10,
    maxStockLevel: 100,
    supplier: '',
    barcode: '',
    description: '',
    hasExpiryDate: false,
    expiryDate: '',
    batch: '',
    cgstRate: 9,
    sgstRate: 9,
  });

  useEffect(() => {
    if (product) {
      setFormData({
        productName: product.productName,
        productCode: product.productCode,
        shortKey: product.shortKey,
        category: product.category,
        brand: product.brand,
        unit: product.unit,
        pack: product.pack || '1',
        hsnCode: product.hsnCode || '',
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        mrp: product.mrp || product.sellingPrice,
        stockQuantity: product.stockQuantity,
        minStockLevel: product.minStockLevel,
        maxStockLevel: product.maxStockLevel,
        supplier: product.supplier,
        barcode: product.barcode || '',
        description: product.description || '',
        hasExpiryDate: product.hasExpiryDate,
        expiryDate: product.expiryDate || '',
        batch: product.batch || '',
        cgstRate: product.cgstRate || 9,
        sgstRate: product.sgstRate || 9,
      });
    }
  }, [product]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-indigo-600 text-white p-6 rounded-t-2xl sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">{product ? 'Edit Product' : 'Add New Product'}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Product Name *</label>
                <input
                  type="text"
                  name="productName"
                  required
                  value={formData.productName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Enter product name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Product Code *</label>
                <input
                  type="text"
                  name="productCode"
                  required
                  value={formData.productCode}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Enter product code"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Short Key</label>
                <input
                  type="text"
                  name="shortKey"
                  value={formData.shortKey}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Quick search key"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Brand</label>
                <input
                  type="text"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Enter brand name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Category *</label>
                <input
                  type="text"
                  name="category"
                  required
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="e.g., Medicine"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Unit</label>
                <select
                  name="unit"
                  value={formData.unit}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="pieces">Pieces</option>
                  <option value="strips">Strips</option>
                  <option value="bottles">Bottles</option>
                  <option value="boxes">Boxes</option>
                  <option value="packets">Packets</option>
                </select>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Pricing & Tax</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Purchase Price *</label>
                <input
                  type="number"
                  name="purchasePrice"
                  step="0.01"
                  required
                  value={formData.purchasePrice}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Selling Price *</label>
                <input
                  type="number"
                  name="sellingPrice"
                  step="0.01"
                  required
                  value={formData.sellingPrice}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">MRP</label>
                <input
                  type="number"
                  name="mrp"
                  step="0.01"
                  value={formData.mrp}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">HSN Code</label>
                <input
                  type="text"
                  name="hsnCode"
                  value={formData.hsnCode}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="HSN code"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">CGST Rate (%)</label>
                <input
                  type="number"
                  name="cgstRate"
                  step="0.01"
                  value={formData.cgstRate}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="9.00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">SGST Rate (%)</label>
                <input
                  type="number"
                  name="sgstRate"
                  step="0.01"
                  value={formData.sgstRate}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="9.00"
                />
              </div>
            </div>
          </div>

          {/* Stock Management */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Stock Management</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Current Stock *</label>
                <input
                  type="number"
                  name="stockQuantity"
                  required
                  value={formData.stockQuantity}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Min Stock Level</label>
                <input
                  type="number"
                  name="minStockLevel"
                  value={formData.minStockLevel}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="10"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Max Stock Level</label>
                <input
                  type="number"
                  name="maxStockLevel"
                  value={formData.maxStockLevel}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="100"
                />
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Additional Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Supplier</label>
                <input
                  type="text"
                  name="supplier"
                  value={formData.supplier}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Supplier name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Barcode</label>
                <input
                  type="text"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Barcode"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                  placeholder="Product description..."
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4 pt-4 border-t-2 border-slate-200 sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-100 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
            >
              {product ? 'Update Product' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
