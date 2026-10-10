import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation, type Location } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LoadingState } from '../ui/LoadingState';

/** Router state passed to /login so the user returns where they were after signing in. */
export interface RedirectState {
  from: Location;
}

export interface ProtectedRouteProps {
  /** When omitted, nested routes render through <Outlet />. */
  children?: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState label="Restoring your session…" fullScreen />;
  }

  if (!user) {
    const state: RedirectState = { from: location };
    return <Navigate to="/login" replace state={state} />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export default ProtectedRoute;
