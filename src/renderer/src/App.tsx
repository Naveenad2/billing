import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db, auth } from './firebase';
import { signOut } from 'firebase/auth';
import './assets/main.css';


import Dashboard from './components/Dashboard';
import InventoryManagement from './components/inventory/InventoryManagement';
import SalesInvoice from './components/SalesInvoice';
import AllInvoices from './components/AllInvoices';
import StockImport from './components/StockImport';
// ADD THIS LINE after your other imports

import PurchaseInvoice from './components/PurchaseInvoice';  // ✅ ADD THIS LINE



import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthWrapper from './components/auth/AuthWrapper';
import LoadingScreen from './components/LoadingScreen';
import SuccessMessage from './components/SuccessMessage';

// Type Definitions
interface InvoiceItem {
  description: string;
  quantity: number;
  price: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
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
  invoiceDate: string;
  dueDate?: string;
  createdAt: string;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

function MainApp() {
  const { currentUser, userData, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [dataLoading, setDataLoading] = useState(true);
  const [showSalesInvoice, setShowSalesInvoice] = useState(false);
  const [showStockImport, setShowStockImport] = useState(false);
  const [showPurchaseImport, setShowPurchaseImport] = useState(false); // ✅ ADD THIS LINE


  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser]);

  // Keyboard Shortcut Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2 key - Open Sales Invoice
      if (e.key === 'F2') {
        e.preventDefault();
        setShowSalesInvoice(true);
      }

      // F3 key - Open Stock Import
      if (e.key === 'F3') {
        e.preventDefault();
        setShowStockImport(true);
      }

      // ✅ ADD THIS: F4 key - Open Purchase Import
      if (e.key === 'F4') {
        e.preventDefault();
        setShowPurchaseImport(true);
      }

      // Ctrl+N (Windows) or Cmd+N (Mac) - Open Sales Invoice
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setShowSalesInvoice(true);
      }

      // Ctrl+I (Windows) or Cmd+I (Mac) - Open Stock Import
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        setShowStockImport(true);
      }

      // ✅ ADD THIS: Ctrl+P (Windows) or Cmd+P (Mac) - Open Purchase Import
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setShowPurchaseImport(true);
      }

      // Escape - Close modals
      if (e.key === 'Escape') {
        if (showSalesInvoice) setShowSalesInvoice(false);
        if (showStockImport) setShowStockImport(false);
        if (showPurchaseImport) setShowPurchaseImport(false); // ✅ ADD THIS LINE
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSalesInvoice, showStockImport, showPurchaseImport]); // ✅ ADD showPurchaseImport to dependencies


  const loadData = async () => {
    setDataLoading(true);
    await Promise.all([fetchInvoices(), fetchCustomers()]);
    setTimeout(() => setDataLoading(false), 800);
  };

  const fetchInvoices = async () => {
    try {
      const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const invoiceData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invoice[];
      setInvoices(invoiceData);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'customers'));
      const customerData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      setCustomers(customerData);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const handleCreateInvoice = async (invoiceData: Omit<Invoice, 'id' | 'createdAt'>) => {
    try {
      await addDoc(collection(db, 'invoices'), {
        ...invoiceData,
        userId: currentUser?.uid,
        createdAt: new Date().toISOString()
      });

      setSuccessMessage('Invoice created successfully!');
      setShowSuccess(true);

      setTimeout(() => {
        setShowSuccess(false);
        fetchInvoices();
        setActiveTab('invoices');
      }, 2000);
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (authLoading) {
    return <LoadingScreen message="Initializing application" />;
  }

  if (!currentUser) {
    return <AuthWrapper />;
  }

  if (dataLoading) {
    return <LoadingScreen message="Loading your dashboard" />;
  }

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const shortcutKey = isMac ? '⌘' : 'Ctrl';

  return (
    <>
      {/* Success Message Overlay */}
      {showSuccess && (
        <SuccessMessage
          message={successMessage}
          onClose={() => setShowSuccess(false)}
        />
      )}
      {/* Sales Invoice Modal */}
      {showSalesInvoice && (
        <SalesInvoice onClose={() => setShowSalesInvoice(false)} />
      )}

      {/* Stock Import Modal */}
      {showStockImport && (
        <StockImport onClose={() => setShowStockImport(false)} />
      )}

      {/* ✅ ADD THIS: Purchase Import Modal */}
      {showPurchaseImport && (
        <PurchaseImport onClose={() => setShowPurchaseImport(false)} />
      )}

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        {/* Header */}
        <header className="bg-white shadow-lg border-b-4 border-primary sticky top-0 z-40 animate-slideInLeft">
          <div className="container mx-auto px-4 md:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-r from-primary to-indigo-600 p-3 rounded-xl shadow-lg hover:scale-110 transition-transform duration-300">
                  <svg className="w-6 h-6 md:w-8 md:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold gradient-text">
                    {userData?.companyName || 'WhiteHillsIntl'}
                  </h1>
                  <p className="text-xs md:text-sm text-slate-500">{userData?.branchLocation || 'Billing System'}</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 md:space-x-6">
                {/* Stats Badge - Hidden on mobile */}
                <div className="hidden lg:flex items-center space-x-4">
                  <div className="text-right bg-gradient-to-r from-primary/10 to-indigo-100 px-4 py-2 rounded-xl border border-primary/20">
                    <p className="text-xs font-medium text-slate-600">Total Invoices</p>
                    <p className="text-2xl font-bold text-primary">{invoices.length}</p>
                  </div>
                  <div className="text-right bg-gradient-to-r from-green-50 to-emerald-100 px-4 py-2 rounded-xl border border-green-200">
                    <p className="text-xs font-medium text-slate-600">Revenue</p>
                    <p className="text-2xl font-bold text-green-600">
                      ₹{invoices.reduce((sum, inv) => sum + (inv.total || 0), 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="hidden md:flex space-x-2">
                  <button
                    onClick={() => setShowSalesInvoice(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:shadow-lg hover:scale-105 transition-all duration-300"
                    title={`Press F2 or ${shortcutKey}+N`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="font-semibold">New Invoice</span>
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded">F2</span>
                  </button>

                  <button
                    onClick={() => setShowStockImport(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-xl hover:shadow-lg hover:scale-105 transition-all duration-300"
                    title={`Press F3 or ${shortcutKey}+I`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="font-semibold">Import</span>
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded">F3</span>
                  </button>

                </div>

                {/* User Info & Logout */}
                <div className="flex items-center space-x-2 md:space-x-3">
                  <div className="text-right hidden md:block">
                    <p className="text-sm font-semibold text-slate-700">{userData?.adminName}</p>
                    <p className="text-xs text-slate-500">{userData?.phoneNumber || currentUser?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-3 md:px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl hover:shadow-lg hover:scale-105 transition-all duration-300 flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="hidden md:inline">Logout</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="bg-white shadow-md border-b border-slate-200 animate-slideInRight overflow-x-auto">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex space-x-1">
              {[
                {
                  id: 'dashboard',
                  label: 'Dashboard',
                  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
                  mobileLabel: 'Home'
                },
                {
                  id: 'inventory',
                  label: 'Inventory',
                  icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
                  mobileLabel: 'Stock'
                },
                {
                  id: 'import',
                  label: 'Import Stock',
                  icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
                  mobileLabel: 'Import',
                  badge: 'F3',
                  action: () => setShowStockImport(true)
                },
                // ✅ ADD THIS ENTIRE OBJECT:
                { 
                  id: 'purchases', 
                  label: 'Purchase Entry', 
                  icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
                  mobileLabel: 'Purchases',
                  badge: 'F4'
                  // NO action property - it's now a regular tab
                },
                
                {
                  id: 'search',
                  label: 'Search Products',
                  icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
                  mobileLabel: 'Search'
                },
                {
                  id: 'sales',
                  label: 'Sales Invoice',
                  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
                  mobileLabel: 'Sales',
                  badge: 'F2',
                  action: () => setShowSalesInvoice(true)
                },
                {
                  id: 'invoices',
                  label: 'All Invoices',
                  icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
                  mobileLabel: 'Invoices'
                },
                {
                  id: 'admin',
                  label: 'Admin Panel',
                  icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
                  mobileLabel: 'Admin'
                }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.action) {
                      tab.action();
                    } else {
                      setActiveTab(tab.id);
                    }
                  }}
                  className={`px-4 md:px-6 py-4 font-semibold transition-all duration-300 relative flex items-center space-x-2 whitespace-nowrap ${activeTab === tab.id
                      ? 'text-primary border-b-4 border-primary'
                      : 'text-slate-600 hover:text-primary hover:bg-slate-50'
                    }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                  </svg>
                  <span className="hidden md:inline">{tab.label}</span>
                  <span className="md:hidden">{tab.mobileLabel}</span>
                  {tab.badge && (
                    <span className="hidden lg:inline text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold border border-primary/20">
                      {tab.badge}
                    </span>
                  )}
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-indigo-600 rounded-t-full"></span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Keyboard Shortcuts Help - Floating Badge */}
        <div className="fixed bottom-6 right-6 z-30 hidden lg:block">
          <div className="bg-white rounded-xl shadow-lg border-2 border-primary/20 p-3 backdrop-blur-sm">
            <p className="text-xs font-bold text-slate-700 mb-2">Keyboard Shortcuts</p>
            <div className="space-y-1 text-[10px]">
              <div className="flex items-center justify-between space-x-3">
                <span className="text-slate-600">New Invoice:</span>
                <div className="flex space-x-1">
                  <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono font-bold">F2</kbd>
                  <span className="text-slate-400">or</span>
                  <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono font-bold">{shortcutKey}+N</kbd>
                </div>
              </div>
              <div className="flex items-center justify-between space-x-3">
                <span className="text-slate-600">Import Stock:</span>
                <div className="flex space-x-1">
                  <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono font-bold">F3</kbd>
                  <span className="text-slate-400">or</span>
                  <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono font-bold">{shortcutKey}+I</kbd>
                </div>
              </div>
              <div className="flex items-center justify-between space-x-3">
                <span className="text-slate-600">Close:</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono font-bold">ESC</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
       {/* Main Content */}
<main className="container mx-auto px-4 md:px-6 py-6 md:py-8">
  <div className="animate-fadeIn">
    {activeTab === 'dashboard' && <Dashboard invoices={invoices} />}
    {activeTab === 'inventory' && <InventoryManagement />}
    {activeTab === 'create' && <InvoiceForm onSubmit={handleCreateInvoice} customers={customers} />}
    {activeTab === 'invoices' && <AllInvoices/>}
    {/* ✅ ADD THIS LINE BELOW */}
    {activeTab === 'purchases' && <PurchaseInvoice />}
  </div>
</main>


        {/* Footer */}
        <footer className="bg-white border-t border-slate-200 mt-12 animate-fadeIn">
          <div className="container mx-auto px-4 md:px-6 py-6">
            <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
              <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-6">
                <p className="text-slate-600 text-sm text-center md:text-left">
                  © 2025 {userData?.companyName || 'WhiteHillsIntl'}. All rights reserved.
                </p>
                <div className="hidden md:flex items-center space-x-4 text-sm text-slate-500">
                  <a href="#" className="hover:text-primary transition-colors">Terms</a>
                  <span>•</span>
                  <a href="#" className="hover:text-primary transition-colors">Privacy</a>
                  <span>•</span>
                  <a href="#" className="hover:text-primary transition-colors">Support</a>
                </div>
              </div>
              <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-4 text-center md:text-left">
                <div className="text-sm text-slate-500">
                  <span className="font-semibold">GSTIN:</span> {userData?.gstin || 'N/A'}
                </div>
                <div className="text-sm text-slate-500 flex items-center space-x-1">
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>WhiteHillsIntl</span>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

function App() {

  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
