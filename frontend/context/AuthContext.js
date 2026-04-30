import { createContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { getCsrfHeader, invalidateCsrfToken } from '../utils/csrf';

export const AuthContext = createContext();

const authFetch = async (url, options = {}, retry = false) => {
  const method = (options.method || 'GET').toUpperCase();
  const csrfHeader = await getCsrfHeader(method);

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.headers || {}),
      ...csrfHeader
    }
  });

  if (response.status === 403 && !retry) {
    const cloned = response.clone();
    const peek = await cloned.json().catch(() => ({}));
    if (peek?.code === 'CSRF_INVALID') {
      invalidateCsrfToken();
      return authFetch(url, options, true);
    }
  }

  return response;
};

export const AuthProvider = ({ children }) => {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionTerminated, setSessionTerminated] = useState(false);
  const [terminationReason, setTerminationReason] = useState(null);

  // Placeholder hook for instrumenting auth state transitions. No-op in
  // production; kept for future diagnostic wiring.
  const logState = (action) => {};

  /**
   * Sanitize user data from localStorage to prevent XSS
   * @param {Object} userData - Raw user data from localStorage
   * @returns {Object|null} - Sanitized user data or null if invalid
   */
  const sanitizeUserData = (userData) => {
    if (!userData || typeof userData !== 'object') return null;
    
    // Only include expected fields with type validation and length limits
    const sanitized = {};
    
    if (userData._id && typeof userData._id === 'string') {
      sanitized._id = String(userData._id).slice(0, 24); // MongoDB ObjectId length
    }
    
    if (userData.id && typeof userData.id === 'string') {
      sanitized.id = String(userData.id).slice(0, 24);
    }
    
    if (userData.username && typeof userData.username === 'string') {
      sanitized.username = String(userData.username).slice(0, 50);
    }
    
    if (userData.email && typeof userData.email === 'string') {
      sanitized.email = String(userData.email).slice(0, 100);
    }
    
    if (userData.fullName && typeof userData.fullName === 'string') {
      sanitized.fullName = String(userData.fullName).slice(0, 100);
    }
    
    if (userData.location && typeof userData.location === 'string') {
      sanitized.location = String(userData.location).slice(0, 100);
    }
    
    if (userData.bio && typeof userData.bio === 'string') {
      sanitized.bio = String(userData.bio).slice(0, 500);
    }
    
    if (userData.avatar && typeof userData.avatar === 'string') {
      sanitized.avatar = String(userData.avatar).slice(0, 500);
    }
    
    // Ensure at least _id or id exists
    if (!sanitized._id && !sanitized.id) {
      return null;
    }
    
    return sanitized;
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // The httpOnly auth cookie is the source of truth — verify it first.
        // We intentionally do NOT pre-populate user from localStorage here because
        // that caused the profile icon to flash when the cookie was invalid/expired.
        // localStorage is only used as a cache AFTER the cookie is confirmed valid.
        await fetchUserData();
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
        logState('After initialization');
      }
    };

    initializeAuth();
  }, []);

  const fetchUserData = useCallback(async () => {
    try {
      const response = await authFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`,
        {}
      );

      const userData = await response.json();
      if (response.ok) {
        const sanitizedUser = sanitizeUserData(userData);
        if (sanitizedUser) {
          setUser(sanitizedUser);
          setToken(userData.token || true); // truthy sentinel; real token stays in-memory only
          localStorage.setItem('user', JSON.stringify(sanitizedUser));
          logState('After setting user data');
        } else {
          console.warn('Invalid user data from API');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        }
      } else {
        // Any non-OK response means we can't confirm the session — clear auth state.
        // Invalidate the CSRF token too so the next login fetches a fresh one.
        localStorage.removeItem('user');
        invalidateCsrfToken();
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      // Network errors don't mean the session is invalid, just unreachable.
      // Leave existing state intact so a brief connectivity blip doesn't log the user out.
      console.error('Network error fetching user data:', error);
    }
  }, []);

  // Re-verify the session on every client-side route change so protected pages
  // never render with stale auth state after a session expiry.
  useEffect(() => {
    const handleRouteChange = () => {
      setIsLoading(true);
      fetchUserData().finally(() => setIsLoading(false));
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => router.events.off('routeChangeComplete', handleRouteChange);
  }, [router.events, fetchUserData]);

  // Detect when another tab logs in as a different user (or logs out).
  // localStorage.user is written on every login/logout, so a storage event
  // fires in all other same-origin tabs. If the identity changed, redirect
  // to login immediately so the stale tab can't keep acting as the old user.
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key !== 'user') return;
      const prev = user?._id || user?.id;
      let nextId = null;
      try { nextId = e.newValue ? JSON.parse(e.newValue)?._id : null; } catch {}
      if (prev && nextId !== prev) {
        // Different user (or logged out) in another tab — clean up and redirect.
        invalidateCsrfToken();
        setToken(null);
        setUser(null);
        window.location.href = '/login?message=' + encodeURIComponent('You were signed out because another account was used in a different tab.');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [user]);

  const login = async (newToken, userData) => {
    if (!newToken) return;

    setToken(newToken); // memory only — never persisted to localStorage

    if (userData) {
      // Ensure consistent user ID field (some endpoints return _id, others return id)
      const normalizedUserData = {
        ...userData,
        _id: userData._id || userData.id, // Ensure _id exists
        id: userData._id || userData.id   // Ensure id exists
      };
      const sanitizedUser = sanitizeUserData(normalizedUserData);
      if (sanitizedUser) {
        setUser(sanitizedUser);
        localStorage.setItem('user', JSON.stringify(sanitizedUser));
        logState('After login with user data');
      }
    } else {
      await fetchUserData();
    }
  };

  // Function to check if a response indicates session was terminated
  const isSessionTerminatedResponse = (response) => {
    if (response && response.status === 401) {
      return response.json().then(data => {
        return data && data.code === 'SESSION_TERMINATED';
      }).catch(() => false);
    }
    return false;
  };

  // Handle API requests with session verification
  const makeAuthenticatedRequest = async (url, options = {}) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const response = await authFetch(url, options);

      // Check if session was terminated
      if (response.status === 401) {
        const data = await response.json();
        if (data.code === 'SESSION_TERMINATED' || data.sessionTerminated) {
          // Force logout if session was terminated
          const reason = 'Your session has been terminated from another device';
          setSessionTerminated(true);
          setTerminationReason(reason);
          await logout(true, reason);
          return { sessionTerminated: true, error: data.msg || 'Session terminated' };
        }

        return { error: data.msg || 'Unauthorized' };
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  const logout = async (skipApiCall = false, logoutReason = null) => {
    try {
      if (!skipApiCall && user) {
        await authFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/logout`,
          { method: 'POST' }
        );
      }
    } catch (error) {
      // Continue with logout even if API call fails
    } finally {
      localStorage.removeItem('user');
      invalidateCsrfToken();

      if (logoutReason) {
        // Hard redirect so the entire app re-initialises cleanly — no stale
        // React state (user, token, CSRF) can survive a full page load.
        window.location.href = `/login?message=${encodeURIComponent(logoutReason)}`;
      } else {
        setToken(null);
        setUser(null);
        setSessions([]);
      }
    }
  };

  // Verify current session status
  const checkSession = async () => {
    if (!user) return { active: false };
    
    try {
      const response = await authFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/session-check`,
        {}
      );
      
      if (response.ok) {
        return { active: true };
      }
      
      // Check if session was terminated
      if (response.status === 401) {
        const data = await response.json();
        if (data.code === 'SESSION_TERMINATED' || data.sessionTerminated) {
          const reason = 'Your session has been terminated from another device';
          setSessionTerminated(true);
          setTerminationReason(reason);
          await logout(true, reason);
          return { active: false, terminated: true, reason: data.msg };
        }
        
        // Session is invalid for other reasons
        await logout(true);
        return { active: false, error: data.msg };
      }
      
      return { active: false };
    } catch (error) {
      return { active: false, error: error.message };
    }
  };

  // Session management
  const fetchSessions = async () => {
    if (!user) return;
    
    setSessionsLoading(true);
    try {
      const response = await makeAuthenticatedRequest(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions`);
      
      // If session was terminated, response will contain sessionTerminated flag
      if (response.sessionTerminated) {
        setSessions([]);
        return;
      }
      
      if (response.ok) {
        const data = await response.json();
        // Keep only active sessions
        const activeSessions = data.sessions?.filter(session => session.isActive !== false) || [];
        setSessions(activeSessions);
      } else {
        setSessions([]);
      }
    } catch (error) {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };
  
  const terminateSession = async (sessionId) => {
    if (!user) return { success: false, error: 'Not authenticated' };
    
    try {
      const response = await makeAuthenticatedRequest(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      
      // If session was terminated, response will contain sessionTerminated flag
      if (response.sessionTerminated) {
        return { success: false, error: 'Your session has been terminated' };
      }
      
      if (response.ok) {
        // Return success without fetching sessions again
        return { success: true };
      } else {
        const errorData = await response.json();
        return { 
          success: false, 
          error: errorData.error || 'Error terminating session' 
        };
      }
    } catch (error) {
      return { success: false, error: 'Network error while terminating session' };
    }
  };
  
  const terminateAllOtherSessions = async () => {
    if (!user) return { success: false, error: 'Not authenticated' };
    
    try {
      const response = await makeAuthenticatedRequest(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions`, {
        method: 'DELETE'
      });
      
      // If session was terminated, response will contain sessionTerminated flag
      if (response.sessionTerminated) {
        return { success: false, error: 'Your session has been terminated' };
      }
      
      if (response.ok) {
        // Return success without fetching sessions again
        return { success: true };
      } else {
        const errorData = await response.json();
        return { 
          success: false, 
          error: errorData.error || 'Error terminating sessions' 
        };
      }
    } catch (error) {
      return { success: false, error: 'Network error while terminating sessions' };
    }
  };

  const changePassword = async (currentPassword, newPassword, confirmPassword) => {
    try {
      if (!user) throw new Error('User not authenticated');

      const response = await authFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/change-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error,
          details: data.details
        };
      }

      return {
        success: true,
        message: data.message
      };
    } catch (error) {
      return {
        success: false,
        error: 'Error during password change'
      };
    }
  };

  const deleteAccount = async (password) => {
    try {
      if (!user) throw new Error('User not authenticated');

      const response = await authFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/delete-account`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error,
          details: data.details
        };
      }

      // Return success without auto logout
      // The calling component will handle redirection before calling logout
      return {
        success: true,
        message: data.message
      };
    } catch (error) {
      return {
        success: false,
        error: 'Error deleting account'
      };
    }
  };

  const checkUsernameAvailability = async (username) => {
    try {
      if (!user) throw new Error('User not authenticated');

      const response = await authFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/check-username`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username })
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        return {
          available: false,
          error: data.error
        };
      }

      return {
        available: true
      };
    } catch (error) {
      return {
        available: false,
        error: 'Error during username availability check'
      };
    }
  };

  const changeUsername = async (username) => {
    try {
      if (!user) throw new Error('User not authenticated');

      const response = await authFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/change-username`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username })
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error,
          field: data.field
        };
      }

      // Update user in context and localStorage
      const updatedUser = { ...user, username: data.user.username };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      return {
        success: true,
        message: data.message,
        user: data.user
      };
    } catch (error) {
      return {
        success: false,
        error: 'Error during username change'
      };
    }
  };

  const updateProfile = async (userData) => {
    try {
      if (!user) throw new Error('User not authenticated');

      const response = await authFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/update-profile`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userData)
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error,
          details: data.details
        };
      }

      // Update user in context and localStorage
      const updatedUser = { ...user, ...data.user };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      return {
        success: true,
        message: data.message,
        user: data.user
      };
    } catch (error) {
      return {
        success: false,
        error: 'Error during profile update'
      };
    }
  };

  // Function to reset session termination state
  const resetSessionTermination = () => {
    setSessionTerminated(false);
    setTerminationReason(null);
  };

  // Log state changes
  useEffect(() => {
    logState('State changed');
  }, [token, user, isLoading]);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isInitialized,
      login,
      logout,
      refreshAuth: fetchUserData,
      changePassword,
      deleteAccount,
      checkUsernameAvailability,
      changeUsername,
      updateProfile,
      sessions,
      sessionsLoading,
      fetchSessions,
      terminateSession,
      terminateAllOtherSessions,
      setSessions,
      checkSession,
      sessionTerminated,
      terminationReason,
      resetSessionTermination
    }}>
      {children}
    </AuthContext.Provider>
  );
};