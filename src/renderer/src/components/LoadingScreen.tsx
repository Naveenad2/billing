import { useEffect, useState } from 'react';

interface LoadingScreenProps {
  message?: string;
}

export default function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center z-50">
      {/* Animated Background Shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="floating-shape bg-blue-400 w-72 h-72 -top-10 -left-10"></div>
        <div className="floating-shape bg-purple-400 w-96 h-96 top-1/2 -right-20 animation-delay-2000"></div>
        <div className="floating-shape bg-pink-400 w-80 h-80 -bottom-20 left-1/3 animation-delay-4000"></div>
      </div>

      <div className="relative z-10 text-center animate-scaleIn">
        {/* Logo with pulse animation */}
        <div className="inline-block bg-white p-8 rounded-3xl shadow-2xl mb-8 animate-pulse-glow">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-2xl">
            <svg className="w-20 h-20 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>

        <h1 className="text-5xl font-bold text-white mb-4">WhiteHillsIntl</h1>
        <p className="text-xl text-white/90 mb-8">Billing Management System</p>

        {/* Spinner */}
        <div className="flex items-center justify-center space-x-2 mb-4">
          <div className="w-4 h-4 bg-white rounded-full animate-bounce"></div>
          <div className="w-4 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-4 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>

        <p className="text-white text-lg font-medium">{message}{dots}</p>
      </div>
    </div>
  );
}
