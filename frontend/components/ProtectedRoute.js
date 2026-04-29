import { useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import { AuthContext } from '../context/AuthContext';

/**
 * Wrap any page that requires authentication.
 * Shows nothing while auth is being verified, then redirects to /login
 * if the session is invalid — no flash of protected content.
 */
const ProtectedRoute = ({ children }) => {
  const { user, isLoading } = useContext(AuthContext);
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login?message=Please log in to access this page');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  return children;
};

export default ProtectedRoute;
