import React, { useEffect, useState } from 'react';

const SEMANTIC = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#059669' },
  error:   { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
  warning: { bg: '#f0e8d4', border: '#b8843a', text: '#9a6e2e' },
  info:    { bg: '#f0e8d4', border: '#b8843a', text: '#9a6e2e' },
};

const icons = {
  success: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />,
  error:   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />,
  warning: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z" />,
  info:    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
};

const NotificationToast = ({ message, type = 'info', duration = 3000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose?.(), 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const s = SEMANTIC[type] || SEMANTIC.info;

  return (
    <div
      className={`fixed top-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.text, maxWidth: 360, boxShadow: '0 4px 12px rgba(46,40,32,0.10)' }}
    >
      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icons[type] || icons.info}
      </svg>
      <p className="font-sans text-sm flex-1">{message}</p>
      <button
        onClick={() => { setIsVisible(false); setTimeout(() => onClose?.(), 300); }}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default NotificationToast;
