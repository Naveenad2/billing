import { useState } from 'react';
import * as XLSX from 'xlsx';
import { bulkAddProducts, Product } from '../services/inventoryDB';

interface ImportStats {
  total: number;
  successful: number;
  failed: number;
  errors: string[];
}

export default function StockImport({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStats(null);
      previewFile(selectedFile);
    }
  };

  const previewFile = async (file: File) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Show first 10 rows for preview
    setPreviewData(jsonData.slice(0, 10));
  };

  const parseExcelDate = (serial: number): string => {
    if (!serial || serial === 0) return '';
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toISOString().split('T')[0];
  };

  const parseBoolean = (value: any): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      return lower === 'true' || lower === 'yes' || lower === '1';
    }
    return value === 1 || value === true;
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setProgress(0);
    
    const errors: string[] = [];
    let successful = 0;
    let failed = 0;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

      const total = jsonData.length;
      const batchSize = 100; // Process 100 products at a time
      const batches = Math.ceil(total / batchSize);

      for (let i = 0; i < batches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, total);
        const batch = jsonData.slice(start, end);

        const productsToAdd: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[] = [];

        for (const row of batch) {
          try {
            const product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
              // Core fields
              itemCode: String(row['Item Code'] || row['ItemCode'] || '').trim(),
              itemName: String(row['Item Name'] || row['ItemName'] || '').trim(),
              regionalName: row['Regional Name'] || row['RegionalName'] || undefined,
              
              // Classification
              hsnCode: String(row['HSNCODE'] || row['HSNCode'] || row['HSN CODE'] || '').trim(),
              batch: row['Batch'] || undefined,
              category: String(row['Category'] || 'NONE').trim(),
              manufacturer: row['Manufacturer'] || row['Manufactur'] || undefined,
              
              // Pricing
              rol: parseFloat(row['ROL'] || 0),
              altUnit: row['Alt Unit'] || row['AltUnit'] || undefined,
              pack: String(row['Pack'] || '1').trim(),
              purchasePrice: parseFloat(row['PRate(Strip)'] || row['PurchasePrice'] || 0),
              sellingPriceTab: parseFloat(row['SRate(Tab)'] || row['SellingPrice'] || 0),
              mrp: parseFloat(row['MRP(Tab)'] || row['MRP'] || 0),
              
              // Stock
              stockQuantity: parseFloat(row['Quantity'] || row['Stock'] || 0),
              minStockLevel: parseFloat(row['ROL'] || 0),
              maxStockLevel: parseFloat(row['MaxStock'] || 0),
              
              // Tax
              cgstRate: parseFloat(row['CGST%'] || row['CGST'] || 2.5),
              sgstRate: parseFloat(row['SGST%'] || row['SGST'] || 2.5),
              igstRate: parseFloat(row['IGST%'] || row['IGST'] || 5.0),
              
              // Tax inclusion
              prTaxIncluded: parseBoolean(row['PR Taxincl'] || row['PRTaxIncl'] || false),
              slTaxIncluded: parseBoolean(row['SL Taxincl'] || row['SLTaxIncl'] || false),
              
              // Expiry
              hasExpiryDate: parseBoolean(row['Expiry'] || row['HasExpiry'] || false),
              expiryDate: row['Expiry Date'] 
                ? (typeof row['Expiry Date'] === 'number' 
                  ? parseExcelDate(row['Expiry Date']) 
                  : String(row['Expiry Date']))
                : undefined,
              
              // Optional fields
              shortKey: String(row['Item Code'] || '').trim().substring(0, 5),
              brand: row['Manufacturer'] || undefined,
              unit: String(row['Pack'] || '1').trim(),
              supplier: row['Supplier'] || undefined,
              barcode: row['Barcode'] || undefined,
              description: row['Description'] || undefined,
            };

            // Validation
            if (!product.itemCode || !product.itemName) {
              errors.push(`Row ${start + batch.indexOf(row) + 2}: Missing Item Code or Item Name`);
              failed++;
              continue;
            }

            productsToAdd.push(product);
          } catch (error) {
            errors.push(`Row ${start + batch.indexOf(row) + 2}: ${error}`);
            failed++;
          }
        }

        // Bulk add this batch
        if (productsToAdd.length > 0) {
          await bulkAddProducts(productsToAdd);
          successful += productsToAdd.length;
        }

        // Update progress
        setProgress(Math.round((end / total) * 100));
      }

      setStats({
        total: jsonData.length,
        successful,
        failed,
        errors: errors.slice(0, 100), // Show first 100 errors only
      });

    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import file. Please check the format.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
          <div>
            <h2 className="text-2xl font-bold">Import Stock from Excel</h2>
            <p className="text-sm text-blue-100 mt-1">Upload Excel file with 37,766+ products</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Select Excel File (.xlsx, .xls)
            </label>
            <div className="flex items-center space-x-4">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={importing}
              />
              <button
                onClick={handleImport}
                disabled={!file || importing}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg font-bold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {importing ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Importing... {progress}%</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Import Stock</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Expected Format */}
          <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <h3 className="font-bold text-blue-900 mb-2 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Expected Excel Columns
            </h3>
            <div className="grid grid-cols-3 gap-2 text-xs text-blue-800">
              <div>• Item Code</div>
              <div>• Item Name</div>
              <div>• Regional Name</div>
              <div>• HSNCODE</div>
              <div>• Batch</div>
              <div>• Category</div>
              <div>• Manufacturer</div>
              <div>• ROL</div>
              <div>• Pack</div>
              <div>• PRate(Strip)</div>
              <div>• SRate(Tab)</div>
              <div>• MRP(Tab)</div>
              <div>• Quantity</div>
              <div>• CGST%</div>
              <div>• SGST%</div>
              <div>• IGST%</div>
              <div>• PR Taxincl</div>
              <div>• SL Taxincl</div>
              <div>• Expiry</div>
              <div>• Expiry Date</div>
            </div>
          </div>

          {/* Preview */}
          {previewData.length > 0 && !importing && !stats && (
            <div className="mb-6">
              <h3 className="font-bold text-gray-800 mb-3">Preview (First 10 rows)</h3>
              <div className="overflow-auto max-h-64 border-2 border-gray-300 rounded-lg">
                <table className="min-w-full text-xs">
                  <tbody>
                    {previewData.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        {Array.isArray(row) && row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 border-r border-gray-200 whitespace-nowrap">
                            {String(cell)}
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
            <div className="mb-6">
              <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 h-6 rounded-full transition-all duration-300 flex items-center justify-center text-white text-xs font-bold"
                  style={{ width: `${progress}%` }}
                >
                  {progress}%
                </div>
              </div>
            </div>
          )}

          {/* Import Stats */}
          {stats && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-100 border-2 border-blue-300 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-blue-800">{stats.total}</div>
                  <div className="text-sm text-blue-600">Total Rows</div>
                </div>
                <div className="bg-green-100 border-2 border-green-300 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-800">{stats.successful}</div>
                  <div className="text-sm text-green-600">Successful</div>
                </div>
                <div className="bg-red-100 border-2 border-red-300 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-red-800">{stats.failed}</div>
                  <div className="text-sm text-red-600">Failed</div>
                </div>
              </div>

              {stats.errors.length > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                  <h3 className="font-bold text-red-900 mb-2">Errors (First 100)</h3>
                  <div className="max-h-48 overflow-auto text-xs text-red-800 space-y-1">
                    {stats.errors.map((error, i) => (
                      <div key={i} className="flex items-start">
                        <span className="mr-2">•</span>
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
        <div className="p-4 border-t bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
