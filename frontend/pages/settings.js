import React, { useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { AuthContext } from '../context/AuthContext';
import AccountPanel from '../components/settings/AccountPanel';
import NotificationsPanel from '../components/settings/NotificationsPanel';
import PrivacyPanel from '../components/settings/PrivacyPanel';
import { semantic } from '../utils/tokens';

const TABS = [
  {
    id: 'account',
    label: 'Account',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />,
  },
  {
    id: 'privacy',
    label: 'Privacy & Security',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />,
  },
];

const Settings = () => {
  const { user, isLoading } = useContext(AuthContext);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('account');
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [user, isLoading, router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('settingsActiveTab');
    if (saved) setActiveTab(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('settingsActiveTab', activeTab);
  }, [activeTab]);

  const showSuccessMessage = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Head>
        <title>Settings — NumisRoma</title>
      </Head>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="font-display font-semibold text-4xl mb-8 text-text-primary">Settings</h1>

        {successMessage && (
          <div className="mb-6 p-3.5 rounded-md flex items-start gap-3 text-sm animate-fade-in" style={{ backgroundColor: semantic.success.bg, border: '1px solid #bbf7d0', color: semantic.success.text }}>
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span className="font-sans">{successMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="md:col-span-1">
            <nav className="p-2 bg-card border border-border rounded-lg">
              {TABS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md flex items-center gap-3 transition-colors duration-150 font-sans text-sm mb-0.5 ${
                    activeTab === id
                      ? 'bg-amber-bg text-amber'
                      : 'text-text-secondary hover:bg-surface-alt'
                  }`}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Panel */}
          <div className="md:col-span-3 p-6 bg-card border border-border rounded-lg">
            {activeTab === 'account'       && <AccountPanel onSuccess={showSuccessMessage} />}
            {activeTab === 'notifications' && <NotificationsPanel onSuccess={showSuccessMessage} />}
            {activeTab === 'privacy'       && <PrivacyPanel onSuccess={showSuccessMessage} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
