import { get, set } from 'idb-keyval';

export interface PaymentDetail {
  method: 'cash' | 'gpay' | 'phonepe' | 'paytm' | 'upi' | 'card' | 'netbanking';
  amount: number;
  reference?: string;
}

export interface InvoiceItem {
  productId: string;
  productName: string;
  productCode: string;
  hsnCode: string;
  batch: string;
  expiryDate: string;
  quantity: number;
  pack: string;
  mrp: number;
  price: number;
  rate: number;
  grossAmount: number;
  cgstPercent: number;
  cgstAmount: number;
  sgstPercent: number;
  sgstAmount: number;
  discount: number;
  taxRate: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  doctorName?: string;
  hospitalName?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  cgstTotal: number;
  sgstTotal: number;
  taxRate: number;
  taxAmount: number;
  roundOff: number;
  total: number;
  payments: PaymentDetail[];
  status: 'paid' | 'pending' | 'partial'; // This is the key fix
  notes?: string;
  terms?: string;
  createdAt: string;
  updatedAt: string;
}

const INVOICE_KEY = 'offline_invoices';

export const getAllInvoices = async (): Promise<Invoice[]> => {
  try {
    const invoices = await get(INVOICE_KEY);
    return invoices || [];
  } catch (error) {
    console.error('Error getting invoices:', error);
    return [];
  }
};

export const addInvoice = async (invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Promise<Invoice> => {
  const invoices = await getAllInvoices();
  
  const newInvoice: Invoice = {
    ...invoice,
    id: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  invoices.push(newInvoice);
  await set(INVOICE_KEY, invoices);
  
  return newInvoice;
};

export const getInvoiceById = async (id: string): Promise<Invoice | undefined> => {
  const invoices = await getAllInvoices();
  return invoices.find(inv => inv.id === id);
};

export const updateInvoice = async (id: string, updates: Partial<Invoice>): Promise<Invoice | null> => {
  const invoices = await getAllInvoices();
  const index = invoices.findIndex(inv => inv.id === id);
  
  if (index === -1) return null;
  
  invoices[index] = {
    ...invoices[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  await set(INVOICE_KEY, invoices);
  return invoices[index];
};

export const deleteInvoice = async (id: string): Promise<boolean> => {
  const invoices = await getAllInvoices();
  const filtered = invoices.filter(inv => inv.id !== id);
  
  if (filtered.length === invoices.length) return false;
  
  await set(INVOICE_KEY, filtered);
  return true;
};
