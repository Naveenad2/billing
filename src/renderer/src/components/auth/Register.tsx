import { useState } from 'react';
import { auth, db } from '../../firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

interface RegisterProps {
  onSwitchToLogin: () => void;
}

export default function Register({ onSwitchToLogin }: RegisterProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    companyName: '',
    branchLocation: '',
    gstin: '',
    adminName: '',
    businessEmail: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    termsAccepted: false,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.companyName || !formData.branchLocation || !formData.gstin || 
        !formData.adminName || !formData.businessEmail || !formData.password || 
        !formData.phoneNumber) {
      setError('Please fill all required fields');
      return;
    }

    if (!formData.termsAccepted) {
      setError('Please accept the terms and conditions');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.phoneNumber.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);

    try {
      // Create user with email and password
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.businessEmail,
        formData.password
      );

      // Update user profile with display name
      await updateProfile(userCredential.user, {
        displayName: formData.adminName,
      });

      // Save additional user data to Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        email: formData.businessEmail,
        companyName: formData.companyName,
        branchLocation: formData.branchLocation,
        gstin: formData.gstin,
        adminName: formData.adminName,
        phoneNumber: `+91${formData.phoneNumber}`,
        createdAt: new Date().toISOString(),
      });

      // User will be automatically logged in via AuthContext
    } catch (err: any) {
      let errorMessage = 'Failed to create account. Please try again.';
      
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please login instead.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address format.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Use at least 6 characters.';
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block bg-white p-6 rounded-3xl shadow-2xl">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 rounded-2xl">
              <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
          <h1 className="mt-6 text-4xl font-bold text-white">WhiteHillsIntl</h1>
          <p className="mt-2 text-lg text-white/90">Create Your Business Account</p>
        </div>

        {/* Registration Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-h-[85vh] overflow-y-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-800">Register Your Business</h2>
            <p className="mt-2 text-slate-600">Fill in your company details to get started</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-6">
            {/* Company Details */}
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Company Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="companyName"
                    required
                    className="input-field"
                    placeholder="WhiteHillsIntl Pvt Ltd"
                    value={formData.companyName}
                    onChange={handleInputChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Branch Location <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="branchLocation"
                    required
                    className="input-field"
                    placeholder="Kochi, Kerala"
                    value={formData.branchLocation}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    GSTIN <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="gstin"
                    required
                    maxLength={15}
                    className="input-field uppercase"
                    placeholder="22AAAAA0000A1Z5"
                    value={formData.gstin}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                  />
                  <p className="mt-1 text-xs text-slate-500">15-digit GST Identification Number</p>
                </div>
              </div>
            </div>

            {/* Admin Details */}
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Administrator Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Admin Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="adminName"
                    required
                    className="input-field"
                    placeholder="John Doe"
                    value={formData.adminName}
                    onChange={handleInputChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-slate-500 font-semibold">+91</span>
                    </div>
                    <input
                      type="tel"
                      name="phoneNumber"
                      required
                      maxLength={10}
                      className="input-field pl-14"
                      placeholder="98765 43210"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Login Credentials */}
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Login Credentials
              </h3>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Business Email (Login Email) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="businessEmail"
                    required
                    className="input-field"
                    placeholder="admin@whitehillsintl.com"
                    value={formData.businessEmail}
                    onChange={handleInputChange}
                    autoComplete="email"
                  />
                  <p className="mt-2 text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
                    <span className="font-semibold">⚠️ Important:</span> This email will be used for login
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      name="password"
                      required
                      minLength={6}
                      className="input-field"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={handleInputChange}
                      autoComplete="new-password"
                    />
                    <p className="mt-1 text-xs text-slate-500">Minimum 6 characters</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      name="confirmPassword"
                      required
                      minLength={6}
                      className="input-field"
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Terms and Conditions */}
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
              <label className="flex items-start cursor-pointer group">
                <input
                  type="checkbox"
                  name="termsAccepted"
                  required
                  checked={formData.termsAccepted}
                  onChange={handleInputChange}
                  className="mt-1 w-5 h-5 text-primary border-slate-300 rounded focus:ring-primary focus:ring-2"
                />
                <span className="ml-3 text-sm text-slate-700">
                  I agree to the{' '}
                  <a href="#" className="text-primary font-semibold hover:underline">
                    Terms and Conditions
                  </a>{' '}
                  and{' '}
                  <a href="#" className="text-primary font-semibold hover:underline">
                    Privacy Policy
                  </a>
                  . I understand that my email will be used for authentication and account management.
                  <span className="text-red-500"> *</span>
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !formData.termsAccepted}
              className="btn-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  <span>Create Business Account</span>
                </>
              )}
            </button>
          </form>

          {/* Switch to Login */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-center text-slate-600">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="font-semibold text-primary hover:text-indigo-700 transition-colors"
              >
                Login Here
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-white/80 text-sm">
          © 2025 WhiteHillsIntl. All rights reserved.
        </p>
      </div>
    </div>
  );
}
