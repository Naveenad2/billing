interface SuccessMessageProps {
    message: string;
    onClose?: () => void;
  }
  
  export default function SuccessMessage({ message, onClose }: SuccessMessageProps) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md mx-4 animate-scaleIn">
          {/* Success Checkmark */}
          <div className="mb-6 relative">
            <div className="w-24 h-24 mx-auto bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center animate-pulse-glow">
              <svg className="w-16 h-16 text-white checkmark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            {/* Confetti effect */}
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full bg-gradient-to-r from-yellow-400 to-pink-500"
                  style={{
                    top: '50%',
                    left: '50%',
                    animation: `confetti 1s ease-out ${i * 0.1}s forwards`,
                    transform: `rotate(${i * 30}deg) translateY(-80px)`,
                    opacity: 0,
                  }}
                />
              ))}
            </div>
          </div>
  
          <h3 className="text-2xl font-bold text-slate-800 text-center mb-2">Success!</h3>
          <p className="text-slate-600 text-center mb-6">{message}</p>
  
          {onClose && (
            <button onClick={onClose} className="btn-primary w-full">
              Continue
            </button>
          )}
        </div>
      </div>
    );
  }
  