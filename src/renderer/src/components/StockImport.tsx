// src/components/StockImport.tsx
// Professional Excel import for 37k+ products into SQLite via Electron IPC
// Preserves all fields, validates data, handles duplicates, and provides detailed feedback

import { useState } from 'react';
import * as XLSX from 'xlsx';

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

interface ImportStats {
  total: number;
  successful: number;
  failed: number;
  duplicates: number;
  errors: string[];
  warnings: string[];
}

interface StockImportProps {
  onClose: () => void;
  onSuccess?: (stats: ImportStats) => void;
}

// Declare global IPC API (must match preload script)
declare global {
  interface Window {
    inventory?: {
      bulkAdd: (products: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[]) => Promise<Product[]>;
      getByItemCode: (code: string) => Promise<Product | undefined>;
    };
  }
}

export default function StockImport({ onClose, onSuccess }: StockImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStats(null);
      setProgress(0);
      setCurrentPhase('');
      previewFile(selectedFile);
    }
  };

  const previewFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      setPreviewData(jsonData.slice(0, 11)); // Header + 10 rows
    } catch (error) {
      console.error('Preview error:', error);
      alert('Failed to preview file. Please check the format.');
    }
  };

  // Parse Excel serial date (days since 1900-01-01)
  const parseExcelDate = (serial: number): string => {
    if (!serial || serial === 0) return '';
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    return dateInfo.toISOString().split('T')[0];
  };

  // Normalize boolean from Excel
  const parseBoolean = (value: any): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      return lower === 'true' || lower === 'yes' || lower === '1' || lower === 't' || lower === 'y';
    }
    return value === 1 || value === true;
  };

  // Safe string extraction
  const safeString = (val: any, defaultVal = ''): string => {
    if (val === null || val === undefined) return defaultVal;
    return String(val).trim();
  };

  // Safe number extraction
  const safeNumber = (val: any, defaultVal = 0): number => {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultVal : parsed;
  };

  const handleImport = async () => {
    if (!file) return;

    // Check IPC API
    if (!window.inventory?.bulkAdd) {
      alert('Inventory API not available. Please restart the application.');
      return;
    }

    setImporting(true);
    setProgress(0);
    setCurrentPhase('Reading file...');

    const errors: string[] = [];
    const warnings: string[] = [];
    let successful = 0;
    let failed = 0;
    let duplicates = 0;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

      const total = jsonData.length;
      setCurrentPhase(`Processing ${total.toLocaleString()} rows...`);

      const batchSize = 100;
      const batches = Math.ceil(total / batchSize);

      for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, total);
        const batch = jsonData.slice(start, end);

        setCurrentPhase(`Batch ${batchIndex + 1}/${batches} (rows ${start + 1}–${end})`);

        const productsToAdd: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[] = [];

        for (let i = 0; i < batch.length; i++) {
          const rowIndex = start + i + 2; // Excel row (1-indexed + header)
          const row = batch[i];

          try {
            // Core fields with flexible column mapping
            const itemCode = safeString(row['Item Code'] || row['ItemCode'] || row['item_code']);
            const itemName = safeString(row['Item Name'] || row['ItemName'] || row['item_name'] || row['Product Name']);

            // Validation: mandatory fields
            if (!itemCode || !itemName) {
              errors.push(`Row ${rowIndex}: Missing Item Code or Item Name`);
              failed++;
              continue;
            }

            // Check for duplicate (optional: skip or merge)
            // Note: This is per-batch; for global duplicate check, query DB before insert
            const existingIndex = productsToAdd.findIndex(p => p.itemCode === itemCode && (p.batch || '') === (row['Batch'] || ''));
            if (existingIndex !== -1) {
              warnings.push(`Row ${rowIndex}: Duplicate Item Code + Batch "${itemCode}" (${row['Batch'] || 'NO BATCH'}), skipping`);
              duplicates++;
              continue;
            }

            // Build product (all 33 fields preserved)
            const product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
              // Core identification
              itemCode,
              itemName,
              regionalName: safeString(row['Regional Name'] || row['RegionalName']) || undefined,

              // Classification
              hsnCode: safeString(row['HSNCODE'] || row['HSNCode'] || row['HSN CODE'] || row['HSN']),
              batch: safeString(row['Batch']) || undefined,
              category: safeString(row['Category'], 'GENERAL'),
              manufacturer: safeString(row['Manufacturer'] || row['Manufactur'] || row['Mfg']) || undefined,

              // Pricing
              rol: safeNumber(row['ROL'] || row['Reorder Level'], 0),
              altUnit: safeString(row['Alt Unit'] || row['AltUnit']) || undefined,
              pack: safeString(row['Pack'], '1'),
              purchasePrice: safeNumber(row['PRate(Strip)'] || row['PurchasePrice'] || row['Purchase Price'] || row['P.Rate']),
              sellingPriceTab: safeNumber(row['SRate(Tab)'] || row['SellingPrice'] || row['Selling Price'] || row['S.Rate']),
              mrp: safeNumber(row['MRP(Tab)'] || row['MRP'] || row['MaxRetailPrice']),

              // Stock
              stockQuantity: Math.max(0, Math.floor(safeNumber(row['Quantity'] || row['Stock'] || row['Qty'], 0))),
              minStockLevel: safeNumber(row['MinStock'] || row['ROL'], 0),
              maxStockLevel: safeNumber(row['MaxStock'] || row['Max Stock'], 0),

              // Tax
              cgstRate: safeNumber(row['CGST%'] || row['CGST'] || row['cgst'], 2.5),
              sgstRate: safeNumber(row['SGST%'] || row['SGST'] || row['sgst'], 2.5),
              igstRate: safeNumber(row['IGST%'] || row['IGST'] || row['igst'], 5.0),

              // Tax inclusion flags
              prTaxIncluded: parseBoolean(row['PR Taxincl'] || row['PRTaxIncl'] || row['pr_tax_incl'] || false),
              slTaxIncluded: parseBoolean(row['SL Taxincl'] || row['SLTaxIncl'] || row['sl_tax_incl'] || false),

              // Expiry
              hasExpiryDate: parseBoolean(row['Expiry'] || row['HasExpiry'] || row['has_expiry'] || false),
              expiryDate: row['Expiry Date'] || row['ExpiryDate'] || row['expiry_date']
                ? (typeof row['Expiry Date'] === 'number'
                  ? parseExcelDate(row['Expiry Date'])
                  : safeString(row['Expiry Date'] || row['ExpiryDate'] || row['expiry_date']))
                : undefined,

              // Optional/legacy fields (backward compatibility)
              productCode: itemCode,
              productName: itemName,
              shortKey: itemCode.substring(0, 6).toUpperCase(),
              brand: safeString(row['Brand'] || row['Manufacturer']) || undefined,
              unit: safeString(row['Unit'] || row['Pack'], '1'),
              sellingPrice: safeNumber(row['SRate(Tab)'] || row['SellingPrice']),
              supplier: safeString(row['Supplier']) || undefined,
              barcode: safeString(row['Barcode'] || row['Bar Code']) || undefined,
              description: safeString(row['Description'] || row['Notes']) || undefined,
            };

            // Additional validation
            if (product.purchasePrice < 0 || product.sellingPriceTab < 0 || product.mrp < 0) {
              warnings.push(`Row ${rowIndex}: Negative price detected for "${itemName}"`);
            }
            if (product.mrp > 0 && product.sellingPriceTab > product.mrp) {
              warnings.push(`Row ${rowIndex}: Selling price exceeds MRP for "${itemName}"`);
            }
            if (product.stockQuantity < 0) {
              warnings.push(`Row ${rowIndex}: Negative stock for "${itemName}", set to 0`);
              product.stockQuantity = 0;
            }

            productsToAdd.push(product);
          } catch (error: any) {
            errors.push(`Row ${rowIndex}: ${error.message || String(error)}`);
            failed++;
          }
        }

        // Bulk insert via IPC
        if (productsToAdd.length > 0) {
          try {
            await window.inventory!.bulkAdd(productsToAdd);
            successful += productsToAdd.length;
          } catch (error: any) {
            errors.push(`Batch ${batchIndex + 1} insert failed: ${error.message || String(error)}`);
            failed += productsToAdd.length;
          }
        }

        // Update progress
        setProgress(Math.round((end / total) * 100));
      }

      // Final stats
      const finalStats: ImportStats = {
        total: jsonData.length,
        successful,
        failed,
        duplicates,
        errors: errors.slice(0, 200), // limit display
        warnings: warnings.slice(0, 200),
      };
      setStats(finalStats);
      setCurrentPhase('Import complete');

      // Callback
      if (onSuccess && successful > 0) {
        onSuccess(finalStats);
      }
    } catch (error: any) {
      console.error('Import error:', error);
      alert(`Failed to import file: ${error.message || String(error)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-t-2xl">
          <div className="flex-1">
            <h2 className="text-2xl font-extrabold tracking-tight">📦 Import Stock from Excel</h2>
            <p className="text-sm text-white/90 mt-1">Professional bulk import supporting 37k+ products • All 33 fields preserved</p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="p-2.5 hover:bg-white/20 rounded-xl transition-all disabled:opacity-50"
            title="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* File Upload */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-3">
              📄 Select Excel File (.xlsx, .xls, .csv)
            </label>
            <div className="flex items-center space-x-4">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                disabled={importing}
              />
              <button
                onClick={handleImport}
                disabled={!file || importing}
                className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold hover:shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center space-x-2 text-sm"
              >
                {importing ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>{progress}%</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Start Import</span>
                  </>
                )}
              </button>
            </div>
            {currentPhase && (
              <p className="text-xs text-indigo-600 font-semibold mt-2 animate-pulse">{currentPhase}</p>
            )}
          </div>

          {/* Expected Format */}
          <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl shadow-sm">
            <h3 className="font-bold text-blue-900 mb-3 flex items-center text-sm">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              📋 Required Excel Columns (flexible mapping)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs text-blue-800">
              <div><strong>•</strong> Item Code</div>
              <div><strong>•</strong> Item Name</div>
              <div><strong>•</strong> Regional Name</div>
              <div><strong>•</strong> HSNCODE</div>
              <div><strong>•</strong> Batch</div>
              <div><strong>•</strong> Category</div>
              <div><strong>•</strong> Manufacturer</div>
              <div><strong>•</strong> ROL</div>
              <div><strong>•</strong> Alt Unit</div>
              <div><strong>•</strong> Pack</div>
              <div><strong>•</strong> PRate(Strip)</div>
              <div><strong>•</strong> SRate(Tab)</div>
              <div><strong>•</strong> MRP(Tab)</div>
              <div><strong>•</strong> Quantity</div>
              <div><strong>•</strong> CGST%</div>
              <div><strong>•</strong> SGST%</div>
              <div><strong>•</strong> IGST%</div>
              <div><strong>•</strong> PR Taxincl</div>
              <div><strong>•</strong> SL Taxincl</div>
              <div><strong>•</strong> Expiry</div>
              <div><strong>•</strong> Expiry Date</div>
              <div><strong>•</strong> Supplier</div>
              <div><strong>•</strong> Barcode</div>
              <div><strong>•</strong> Description</div>
            </div>
            <p className="text-xs text-blue-700 mt-3 italic">Alternative column names are supported (e.g., ItemCode, item_code, Product Name).</p>
          </div>

          {/* Preview */}
          {previewData.length > 0 && !importing && !stats && (
            <div>
              <h3 className="font-bold text-gray-800 mb-3 text-sm">🔍 Preview (First 10 rows)</h3>
              <div className="overflow-auto max-h-72 border-2 border-gray-300 rounded-xl shadow-inner bg-white">
                <table className="min-w-full text-xs border-collapse">
                  <tbody>
                    {previewData.map((row, i) => (
                      <tr key={i} className={i === 0 ? 'bg-indigo-100 font-bold sticky top-0' : i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        {Array.isArray(row) && row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                            {String(cell ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {importing && (
            <div>
              <div className="relative w-full bg-gray-200 rounded-full h-8 overflow-hidden shadow-inner">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 transition-all duration-300 flex items-center justify-center text-white text-sm font-bold"
                  style={{ width: `${progress}%` }}
                >
                  {progress}%
                </div>
              </div>
            </div>
          )}

          {/* Import Stats */}
          {stats && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-100 to-blue-200 border-2 border-blue-400 rounded-xl p-4 text-center shadow-sm">
                  <div className="text-4xl font-extrabold text-blue-800">{stats.total.toLocaleString()}</div>
                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total Rows</div>
                </div>
                <div className="bg-gradient-to-br from-green-100 to-green-200 border-2 border-green-400 rounded-xl p-4 text-center shadow-sm">
                  <div className="text-4xl font-extrabold text-green-800">{stats.successful.toLocaleString()}</div>
                  <div className="text-xs font-semibold text-green-600 uppercase tracking-wide">✅ Successful</div>
                </div>
                <div className="bg-gradient-to-br from-red-100 to-red-200 border-2 border-red-400 rounded-xl p-4 text-center shadow-sm">
                  <div className="text-4xl font-extrabold text-red-800">{stats.failed.toLocaleString()}</div>
                  <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">❌ Failed</div>
                </div>
                <div className="bg-gradient-to-br from-yellow-100 to-yellow-200 border-2 border-yellow-400 rounded-xl p-4 text-center shadow-sm">
                  <div className="text-4xl font-extrabold text-yellow-800">{stats.duplicates.toLocaleString()}</div>
                  <div className="text-xs font-semibold text-yellow-600 uppercase tracking-wide">⚠️ Duplicates</div>
                </div>
              </div>

              {/* Warnings */}
              {stats.warnings.length > 0 && (
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-5 shadow-sm">
                  <h3 className="font-bold text-yellow-900 mb-3 text-sm flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    ⚠️ Warnings ({stats.warnings.length})
                  </h3>
                  <div className="max-h-48 overflow-auto text-xs text-yellow-900 space-y-1">
                    {stats.warnings.map((warning, i) => (
                      <div key={i} className="flex items-start bg-yellow-100/50 p-2 rounded">
                        <span className="mr-2 flex-shrink-0">⚠</span>
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {stats.errors.length > 0 && (
                <div className="bg-gradient-to-br from-red-50 to-pink-50 border-2 border-red-300 rounded-xl p-5 shadow-sm">
                  <h3 className="font-bold text-red-900 mb-3 text-sm flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    ❌ Errors ({stats.errors.length})
                  </h3>
                  <div className="max-h-48 overflow-auto text-xs text-red-900 space-y-1">
                    {stats.errors.map((error, i) => (
                      <div key={i} className="flex items-start bg-red-100/50 p-2 rounded">
                        <span className="mr-2 flex-shrink-0">✖</span>
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t-2 bg-gradient-to-r from-gray-50 to-gray-100 flex justify-end space-x-3 rounded-b-2xl">
          {stats && stats.successful > 0 && (
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg transition-all text-sm"
            >
              🔄 Refresh Inventory
            </button>
          )}
          <button
            onClick={onClose}
            disabled={importing}
            className="px-6 py-2.5 bg-gray-300 text-gray-800 rounded-xl font-bold hover:bg-gray-400 transition-all disabled:opacity-50 text-sm"
          >
            {stats ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
