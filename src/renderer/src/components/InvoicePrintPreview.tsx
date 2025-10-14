import { useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceItem {
  productId: string;
  productName: string;
  productCode: string;
  quantity: number;
  price: number;
  discount: number;
  taxRate: number;
  total: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: 'paid' | 'pending';
  notes?: string;
  terms?: string;
}

interface CompanyData {
  companyName?: string;
  adminName?: string;
  phoneNumber?: string;
  email?: string;
  branchLocation?: string;
  gstin?: string;
  address?: string;
}

interface InvoicePrintPreviewProps {
  invoice: Invoice;
  companyData?: CompanyData | null;
  onClose: () => void;
}

export default function InvoicePrintPreview({ invoice, companyData, onClose }: InvoicePrintPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const amountInWords = (amount: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    if (amount === 0) return 'Zero Rupees Only';

    const convertLessThanThousand = (num: number): string => {
      if (num === 0) return '';
      if (num < 10) return ones[num];
      if (num < 20) return teens[num - 10];
      if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
      return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' ' + convertLessThanThousand(num % 100) : '');
    };

    const crore = Math.floor(amount / 10000000);
    const lakh = Math.floor((amount % 10000000) / 100000);
    const thousand = Math.floor((amount % 100000) / 1000);
    const remainder = Math.floor(amount % 1000);

    let result = '';
    if (crore > 0) result += convertLessThanThousand(crore) + ' Crore ';
    if (lakh > 0) result += convertLessThanThousand(lakh) + ' Lakh ';
    if (thousand > 0) result += convertLessThanThousand(thousand) + ' Thousand ';
    if (remainder > 0) result += convertLessThanThousand(remainder);

    return result.trim() + ' Rupees Only';
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Company Header
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(companyData?.companyName || 'WhiteHillsIntl', 15, 15);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    let yPos = 22;
    if (companyData?.branchLocation) {
      doc.text(`${companyData.branchLocation}`, 15, yPos);
      yPos += 4;
    }
    if (companyData?.phoneNumber) {
      doc.text(`Phone: ${companyData.phoneNumber}`, 15, yPos);
      yPos += 4;
    }
    if (companyData?.gstin) {
      doc.text(`GSTIN: ${companyData.gstin}`, 15, yPos);
    }

    // Invoice Title
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 35, pageWidth, 15, 'F');
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('TAX INVOICE', pageWidth / 2, 45, { align: 'center' });

    // Invoice Details Box
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice Details:', 15, 60);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Invoice No: ${invoice.invoiceNumber}`, 15, 67);
    doc.text(`Date: ${formatDate(invoice.invoiceDate)}`, 15, 73);
    if (invoice.dueDate) {
      doc.text(`Due Date: ${formatDate(invoice.dueDate)}`, 15, 79);
    }

    // Customer Details Box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Bill To:', 110, 60);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(invoice.customerName, 110, 67);
    if (invoice.customerPhone) {
      doc.text(`Phone: ${invoice.customerPhone}`, 110, 73);
    }
    if (invoice.customerAddress) {
      doc.text(invoice.customerAddress, 110, 79);
    }

    // Items Table
    const tableData = invoice.items.map((item, index) => {
      const itemBeforeTax = (item.price * item.quantity) - item.discount;
      const itemTaxAmount = itemBeforeTax * (item.taxRate / 100);
      
      return [
        index + 1,
        item.productName,
        item.quantity,
        `₹${item.price.toFixed(2)}`,
        item.discount > 0 ? `₹${item.discount.toFixed(2)}` : '-',
        `${item.taxRate}%`,
        `₹${itemTaxAmount.toFixed(2)}`,
        `₹${item.total.toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 90,
      head: [['#', 'Product', 'Qty', 'Price', 'Discount', 'Tax%', 'Tax Amt', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 8,
        cellPadding: 3
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left', cellWidth: 60 },
        2: { halign: 'center', cellWidth: 15 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 25 },
        5: { halign: 'center', cellWidth: 15 },
        6: { halign: 'right', cellWidth: 25 },
        7: { halign: 'right', cellWidth: 25 }
      }
    });

    // Get Y position after table
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totals Section
    const totalsX = 130;
    doc.setFontSize(9);
    
    doc.text('Subtotal:', totalsX, finalY);
    doc.text(`₹${invoice.subtotal.toFixed(2)}`, 195, finalY, { align: 'right' });
    
    if (invoice.discount > 0) {
      doc.text('Discount:', totalsX, finalY + 6);
      doc.text(`-₹${invoice.discount.toFixed(2)}`, 195, finalY + 6, { align: 'right' });
    }
    
    doc.text(`Tax (${invoice.taxRate}%):`, totalsX, finalY + (invoice.discount > 0 ? 12 : 6));
    doc.text(`₹${invoice.taxAmount.toFixed(2)}`, 195, finalY + (invoice.discount > 0 ? 12 : 6), { align: 'right' });

    // Grand Total Box
    const grandTotalY = finalY + (invoice.discount > 0 ? 18 : 12);
    doc.setFillColor(16, 185, 129);
    doc.rect(totalsX - 5, grandTotalY - 4, 70, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('GRAND TOTAL:', totalsX, grandTotalY + 3);
    doc.text(`₹${invoice.total.toFixed(2)}`, 195, grandTotalY + 3, { align: 'right' });

    // Amount in Words
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Amount in Words: ${amountInWords(invoice.total)}`, 15, grandTotalY + 15);

    // Notes and Terms
    if (invoice.notes || invoice.terms) {
      let notesY = grandTotalY + 25;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      
      if (invoice.notes) {
        doc.text('Notes:', 15, notesY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const notesLines = doc.splitTextToSize(invoice.notes, 85);
        doc.text(notesLines, 15, notesY + 5);
        notesY += notesLines.length * 4 + 5;
      }
      
      if (invoice.terms) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Terms & Conditions:', 110, grandTotalY + 25);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const termsLines = doc.splitTextToSize(invoice.terms, 85);
        doc.text(termsLines, 110, grandTotalY + 30);
      }
    }

    // Signature Section
    const sigY = pageHeight - 40;
    doc.setDrawColor(0);
    doc.line(15, sigY, 70, sigY);
    doc.line(140, sigY, 195, sigY);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Customer Signature', 42.5, sigY + 5, { align: 'center' });
    doc.text('Authorized Signatory', 167.5, sigY + 5, { align: 'center' });

    // Footer
    doc.setFillColor(30, 41, 59);
    doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 12, { align: 'center' });
    doc.setFontSize(7);
    doc.text('This is a computer-generated invoice.', pageWidth / 2, pageHeight - 6, { align: 'center' });

    // Save PDF
    doc.save(`Invoice-${invoice.invoiceNumber}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-primary to-indigo-600 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Invoice Preview</h2>
            <p className="text-white/80 text-sm mt-1">Review and download your invoice</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-xl transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Invoice Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div ref={printRef} className="bg-white shadow-xl max-w-4xl mx-auto" id="invoice-content">
            {/* Invoice Header */}
            <div className="bg-gradient-to-r from-primary to-indigo-600 text-white p-8">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-3xl font-bold mb-2">{companyData?.companyName || 'WhiteHillsIntl'}</h1>
                  <div className="text-sm space-y-1 text-white/90">
                    {companyData?.branchLocation && <p>📍 {companyData.branchLocation}</p>}
                    {companyData?.phoneNumber && <p>📞 {companyData.phoneNumber}</p>}
                    {companyData?.email && <p>✉️ {companyData.email}</p>}
                    {companyData?.gstin && <p><strong>GSTIN:</strong> {companyData.gstin}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`inline-block px-4 py-2 rounded-lg font-bold text-sm ${
                    invoice.status === 'paid' 
                      ? 'bg-green-500' 
                      : 'bg-orange-500'
                  }`}>
                    {invoice.status === 'paid' ? '✓ PAID' : '⏳ PENDING'}
                  </div>
                </div>
              </div>
              <div className="text-center mt-6 bg-white/10 backdrop-blur-sm py-3 rounded-lg">
                <h2 className="text-2xl font-bold">TAX INVOICE</h2>
              </div>
            </div>

            {/* Invoice Info Section */}
            <div className="grid grid-cols-2 gap-6 p-8 bg-slate-50">
              <div className="bg-white p-6 rounded-xl border-2 border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Invoice Details</h3>
                <div className="space-y-2">
                  <p className="text-2xl font-bold text-primary">{invoice.invoiceNumber}</p>
                  <p className="text-sm"><strong>Date:</strong> {formatDate(invoice.invoiceDate)}</p>
                  {invoice.dueDate && (
                    <p className="text-sm"><strong>Due Date:</strong> {formatDate(invoice.dueDate)}</p>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border-2 border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Bill To</h3>
                <div className="space-y-1">
                  <p className="text-lg font-bold text-slate-800">{invoice.customerName}</p>
                  {invoice.customerPhone && <p className="text-sm">📞 {invoice.customerPhone}</p>}
                  {invoice.customerEmail && <p className="text-sm">✉️ {invoice.customerEmail}</p>}
                  {invoice.customerAddress && <p className="text-sm">📍 {invoice.customerAddress}</p>}
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="px-8">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-primary to-indigo-600 text-white">
                    <th className="text-left py-4 px-4 text-sm font-bold">#</th>
                    <th className="text-left py-4 px-4 text-sm font-bold">Product Details</th>
                    <th className="text-center py-4 px-3 text-sm font-bold">Price</th>
                    <th className="text-center py-4 px-3 text-sm font-bold">Qty</th>
                    <th className="text-center py-4 px-3 text-sm font-bold">Disc</th>
                    <th className="text-center py-4 px-3 text-sm font-bold">Tax%</th>
                    <th className="text-center py-4 px-3 text-sm font-bold">Tax Amt</th>
                    <th className="text-right py-4 px-4 text-sm font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {invoice.items.map((item, index) => {
                    const itemBeforeTax = (item.price * item.quantity) - item.discount;
                    const itemTaxAmount = itemBeforeTax * (item.taxRate / 100);
                    return (
                      <tr key={index} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="py-3 px-4 text-center text-slate-600">{index + 1}</td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-800">{item.productName}</p>
                          <span className="text-xs bg-slate-100 px-2 py-1 rounded">{item.productCode}</span>
                        </td>
                        <td className="py-3 px-3 text-center text-slate-700">₹{item.price.toFixed(2)}</td>
                        <td className="py-3 px-3 text-center font-semibold text-slate-800">{item.quantity}</td>
                        <td className="py-3 px-3 text-center text-orange-600">
                          {item.discount > 0 ? `₹${item.discount.toFixed(2)}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-center text-blue-600 font-semibold">{item.taxRate}%</td>
                        <td className="py-3 px-3 text-center text-slate-700">₹{itemTaxAmount.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-bold text-green-600">₹{item.total.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals Section */}
            <div className="p-8 bg-slate-50">
              <div className="max-w-md ml-auto space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-300">
                  <span className="font-semibold text-slate-700">Subtotal:</span>
                  <span className="text-lg font-bold text-slate-800">₹{invoice.subtotal.toFixed(2)}</span>
                </div>
                {invoice.discount > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-slate-300">
                    <span className="font-semibold text-slate-700">Discount:</span>
                    <span className="text-lg font-bold text-orange-600">-₹{invoice.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-slate-300">
                  <span className="font-semibold text-slate-700">Tax ({invoice.taxRate}%):</span>
                  <span className="text-lg font-bold text-blue-600">₹{invoice.taxAmount.toFixed(2)}</span>
                </div>
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl p-4 shadow-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">GRAND TOTAL:</span>
                    <span className="text-3xl font-bold">₹{invoice.total.toFixed(2)}</span>
                  </div>
                  <p className="text-xs mt-2 text-white/90">
                    <strong>In Words:</strong> {amountInWords(invoice.total)}
                  </p>
                </div>
              </div>
            </div>

            {/* Notes and Terms */}
            {(invoice.notes || invoice.terms) && (
              <div className="grid grid-cols-2 gap-6 px-8 pb-8">
                {invoice.notes && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-bold text-blue-800 mb-2 text-sm">📝 Notes</h4>
                    <p className="text-xs text-blue-700">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms && (
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <h4 className="font-bold text-purple-800 mb-2 text-sm">📋 Terms & Conditions</h4>
                    <p className="text-xs text-purple-700">{invoice.terms}</p>
                  </div>
                )}
              </div>
            )}

            {/* Signature Section */}
            <div className="px-8 pb-8">
              <div className="grid grid-cols-2 gap-8">
                <div className="text-center">
                  <div className="border-t-2 border-slate-800 pt-2 mt-16">
                    <p className="font-bold text-slate-700">Customer Signature</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-right mb-2">
                    <p className="text-xs text-slate-600">For {companyData?.companyName || 'WhiteHillsIntl'}</p>
                  </div>
                  <div className="border-t-2 border-slate-800 pt-2 mt-12">
                    <p className="font-bold text-slate-700">Authorized Signatory</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-800 text-white py-4 text-center">
              <p className="text-sm font-semibold">Thank you for your business!</p>
              <p className="text-xs text-slate-400 mt-1">This is a computer-generated invoice.</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white border-t border-slate-200 p-6 flex items-center justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-100 transition-all"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            className="px-6 py-3 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #invoice-content,
          #invoice-content * {
            visibility: visible;
          }
          #invoice-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
