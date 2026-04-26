import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { semantic } from '../../utils/tokens';

const formatLastActive = (date) => {
  try {
    const diffMs = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return 'a few seconds ago';
    if (mins < 60) return `${mins} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    return `${days} days ago`;
  } catch { return 'unknown date'; }
};

const DeviceIcon = ({ type }) => {
  const iconPath = type === 'mobile'
    ? 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z'
    : type === 'tablet'
    ? 'M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z'
    : 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z';
  return (
    <div className="w-8 h-8 flex items-center justify-center rounded-md shrink-0 bg-surface-alt">
      <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath} />
      </svg>
    </div>
  );
};

const Toggle = ({ checked }) => (
  <div
    className="relative inline-flex items-center h-5 rounded-full w-10"
    style={{ backgroundColor: checked ? 'var(--color-amber)' : 'var(--color-border)' }}
  >
    <span
      className="inline-block w-3.5 h-3.5 rounded-full bg-white"
      style={{ transform: checked ? 'translateX(22px)' : 'translateX(3px)', transition: 'transform 0.2s' }}
    />
  </div>
);

const PrivacyPanel = ({ onSuccess }) => {
  const { sessions, sessionsLoading, fetchSessions, terminateSession, terminateAllOtherSessions, setSessions } = useContext(AuthContext);
  const [terminatingSession, setTerminatingSession] = useState(null);
  const [terminatingAllSessions, setTerminatingAllSessions] = useState(false);
  const [sessionError, setSessionError] = useState(null);

  useEffect(() => { fetchSessions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showError = (msg) => { setSessionError(msg); setTimeout(() => setSessionError(null), 3000); };

  const handleTerminateSession = async (sessionId) => {
    setTerminatingSession(sessionId);
    try {
      const result = await terminateSession(sessionId);
      if (result.success) {
        setSessions(prev => prev.filter(s => s._id !== sessionId));
        onSuccess('Session terminated. The device will be logged out.');
      } else showError(result.error || 'Error terminating session');
    } catch { showError('A network error occurred'); }
    finally { setTerminatingSession(null); }
  };

  const handleTerminateAllSessions = async () => {
    setTerminatingAllSessions(true);
    try {
      const result = await terminateAllOtherSessions();
      if (result.success) {
        setSessions(prev => prev.filter(s => s.isCurrentSession));
        onSuccess('All other sessions terminated.');
      } else showError(result.error || 'Error terminating sessions');
    } catch { showError('A network error occurred'); }
    finally { setTerminatingAllSessions(false); }
  };

  return (
    <div className="space-y-8">
      <h2 className="font-display font-semibold text-2xl text-text-primary">Privacy &amp; Security</h2>

      {/* 2FA & Login Notifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 2FA */}
        <div className="p-5 bg-surface-alt border border-border rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 flex items-center justify-center rounded-md bg-amber-bg">
              <svg className="w-4 h-4 text-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-sans font-semibold text-sm text-text-primary">Two-Factor Authentication</h3>
          </div>
          <p className="font-sans text-sm mb-4 text-text-muted">Add an extra layer of security to your account.</p>
          <div className="flex items-center justify-between p-3 rounded-md mb-3 bg-card border border-border">
            <div>
              <p className="font-sans text-sm font-medium text-text-primary">Status</p>
              <p className="font-sans text-xs" style={{ color: semantic.error.border }}>Not enabled</p>
            </div>
            <button className="px-4 py-1.5 font-sans text-sm font-semibold rounded-md bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150">
              Enable
            </button>
          </div>
          <p className="font-sans text-xs text-text-muted">Enter a verification code from your auth app on each login.</p>
        </div>

        {/* Login Notifications */}
        <div className="p-5 bg-surface-alt border border-border rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 flex items-center justify-center rounded-md bg-amber-bg">
              <svg className="w-4 h-4 text-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-sans font-semibold text-sm text-text-primary">Login Notifications</h3>
          </div>
          <p className="font-sans text-sm mb-4 text-text-muted">Get alerted when someone logs in from a new device.</p>
          <div className="space-y-3">
            {[
              { label: 'Email Alerts',       desc: 'Email notifications for new logins', on: true },
              { label: 'Push Notifications', desc: 'Push notifications on your devices',  on: false },
            ].map(({ label, desc, on }) => (
              <div key={label} className="flex items-center justify-between">
                <div>
                  <p className="font-sans text-sm font-medium text-text-primary">{label}</p>
                  <p className="font-sans text-xs text-text-muted">{desc}</p>
                </div>
                <Toggle checked={on} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Session Management */}
      <div className="p-6 bg-card border border-border rounded-lg">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-xl text-text-primary">Active Sessions</h3>
          <button
            onClick={handleTerminateAllSessions}
            disabled={terminatingAllSessions || !sessions || sessions.length <= 1}
            className="flex items-center gap-1.5 px-3 py-1.5 font-sans text-xs font-medium rounded-md transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ border: '1px solid #fecaca', color: semantic.error.text, backgroundColor: semantic.error.bg }}
          >
            {terminatingAllSessions
              ? <><div className="animate-spin rounded-full h-3 w-3 border border-t-transparent border-red-600" />Logging out…</>
              : 'Logout all other devices'
            }
          </button>
        </div>

        {sessionError && (
          <div className="mb-4 p-3 rounded-md flex items-start gap-2" style={{ backgroundColor: semantic.error.bg, border: '1px solid #fecaca', color: semantic.error.text }}>
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p className="font-sans text-sm">{sessionError}</p>
          </div>
        )}

        {sessionsLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-amber border-t-transparent" />
          </div>
        ) : sessions && sessions.length > 0 ? (
          <div className="space-y-2">
            {sessions.map(session => (
              <div key={session._id} className="flex items-start justify-between p-3 rounded-md bg-surface-alt border border-border">
                <div className="flex items-start gap-3">
                  <DeviceIcon type={session.deviceInfo.type} />
                  <div>
                    <p className="font-sans text-sm font-medium text-text-primary">
                      {session.isCurrentSession ? 'Current session' : session.deviceInfo.deviceName}
                    </p>
                    <p className="font-sans text-xs mt-0.5 text-text-muted">
                      {session.deviceInfo.operatingSystem} · {session.deviceInfo.browser} ·{' '}
                      {session.isCurrentSession ? 'Active now' : `Last: ${formatLastActive(session.lastActive)}`}
                    </p>
                    <p className="font-sans text-xs mt-0.5 text-text-muted">{session.location} · {session.ipAddress}</p>
                  </div>
                </div>
                {session.isCurrentSession ? (
                  <span className="flex items-center gap-1 font-sans text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: semantic.success.bg, color: semantic.success.text }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Active
                  </span>
                ) : (
                  <button
                    onClick={() => handleTerminateSession(session._id)}
                    disabled={terminatingSession === session._id}
                    className="font-sans text-xs px-2.5 py-1 rounded-md transition-colors duration-150 disabled:opacity-50"
                    style={{ border: '1px solid #fecaca', color: semantic.error.text, backgroundColor: semantic.error.bg }}
                  >
                    {terminatingSession === session._id
                      ? <span className="flex items-center gap-1"><div className="animate-spin rounded-full h-3 w-3 border border-t-transparent border-red-600" />…</span>
                      : 'Logout'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="font-sans text-sm text-center py-6 text-text-muted">No active sessions found.</p>
        )}
      </div>
    </div>
  );
};

export default PrivacyPanel;
