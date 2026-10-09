import { Navigate, Outlet, useLocation } from 'react-router';

import { ErrorState } from '@/components/common/ErrorState.jsx';
import { LoadingState } from '@/components/common/LoadingState.jsx';

import { useAuth } from '../hooks/useAuth.js';
export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <LoadingState />;
  if (auth.status === 'error') return <ErrorState onRetry={auth.retry} />;
  if (!auth.user)
    return (
      <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />
    );
  return <Outlet />;
}
