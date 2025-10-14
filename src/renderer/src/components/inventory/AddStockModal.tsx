import { useState } from 'react';
import { Product } from '../../services/inventoryDB';


interface AddStockModalProps {
  product: Product;
  onSubmit: (productId: string, quantity: number, operation: 'add' | 'set') => void;
  onClose: () => void;
}

export default function AddStockModal({ product, onSubmit, onClose }: AddStockModalProps) {
  const [operation, setOperation] = useState<'add' | 'set'>('add');
  const [quantity, setQuantity] = useState<number>(0);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0 && operation === 'add') {
      alert('Please enter a valid quantity');
      return;
    }
    onSubmit(product.id, quantity, operation);
  };

  const getNewStockQuantity = () => {
    return operation === 'add' ? product.stockQuantity + quantity : quantity;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full animate-scaleIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-indigo-600 text-white p-6 rounded-t-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Update Stock</h2>
              <p className="text-white/80 text-sm mt-1">{product.productName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Product Info Card */}
          <div className="bg-gradient-to-r from-slate-50 to-blue-50 p-4 rounded-xl border border-slate-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-600 mb-1">Product Code</p>
                <p className="font-bold text-slate-800">{product.productCode}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Short Key</p>
                <p className="font-bold text-primary">{product.shortKey}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Current Stock</p>
                <p className="text-2xl font-bold text-green-600">{product.stockQuantity}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Unit</p>
                <p className="font-bold text-slate-800">{product.unit}</p>
              </div>
            </div>
          </div>

          {/* Operation Type */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Operation Type
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setOperation('add')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  operation === 'add'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-primary/50'
                }`}
              >
                <div className="flex flex-col items-center space-y-2">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <div>
                    <p className="font-bold">Add to Stock</p>
                    <p className="text-xs mt-1">Increase quantity</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOperation('set')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  operation === 'set'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-primary/50'
                }`}
              >
                <div className="flex flex-col items-center space-y-2">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <div>
                    <p className="font-bold">Set Stock</p>
                    <p className="text-xs mt-1">Update exact quantity</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Quantity Input */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {operation === 'add' ? 'Quantity to Add' : 'New Stock Quantity'}
              <span className="text-red-500 ml-1">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                required
                min={operation === 'set' ? 0 : 1}
                className="input-field text-2xl font-bold text-center"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                autoFocus
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                <span className="text-slate-500 font-semibold">{product.unit}</span>
              </div>
            </div>
          </div>

          {/* Preview */}
          {quantity > 0 && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200 animate-fadeIn">
              <div className="flex items-center justify-center space-x-4">
                <div className="text-center">
                  <p className="text-sm text-slate-600 mb-1">Current Stock</p>
                  <p className="text-2xl font-bold text-slate-800">{product.stockQuantity}</p>
                </div>
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <div className="text-center">
                  <p className="text-sm text-slate-600 mb-1">New Stock</p>
                  <p className="text-3xl font-bold text-green-600">{getNewStockQuantity()}</p>
                </div>
              </div>
              {operation === 'add' && (
                <p className="text-center text-sm text-green-700 mt-3">
                  Adding <span className="font-bold">{quantity} {product.unit}</span> to current stock
                </p>
              )}
              {/* Stock Level Warning */}
              {getNewStockQuantity() <= product.minStockLevel && (
                <div className="mt-3 p-3 bg-orange-100 rounded-lg border border-orange-300">
                  <p className="text-sm text-orange-800 text-center font-semibold">
                    ⚠️ Stock will be below minimum level ({product.minStockLevel} {product.unit})
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              className="input-field resize-none"
              rows={3}
              placeholder="Add notes about this stock update..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-4 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={quantity <= 0 && operation === 'add'}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Update Stock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
