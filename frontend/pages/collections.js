import { useEffect, useContext } from 'react';
import { useRouter } from 'next/router';
import { AuthContext } from '../context/AuthContext';

const CollectionsRedirect = () => {
  const router = useRouter();
  const { user, isLoading } = useContext(AuthContext);

  useEffect(() => {
    if (!isLoading) {
      if (user) router.replace(`/profile?id=${user._id}`);
      else router.replace('/login');
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 mb-4 border-3 border-border border-t-amber"></div>
        <p className="font-sans text-sm text-text-muted">Redirecting to your profile…</p>
      </div>
    </div>
  );
};

export default CollectionsRedirect; 