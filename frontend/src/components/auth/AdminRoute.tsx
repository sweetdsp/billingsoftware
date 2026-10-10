import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LoadingState } from '../ui/LoadingState';
import type { RedirectState } from './ProtectedRoute';

export interface AdminRouteProps {
  /** When omitted, nested routes render through <Outlet />. */
  children?: ReactNode;
}

/** Signed-out users go to /login (preserving `from`); signed-in non-admins go to /dashboard. */
export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState label="Checking permissions…" />;
  }

  if (!user) {
    const state: RedirectState = { from: location };
    return <Navigate to="/login" replace state={state} />;
  }

  if (!user.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default AdminRoute;
