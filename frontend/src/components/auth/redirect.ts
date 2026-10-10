import type { RedirectState } from './ProtectedRoute';

export const DEFAULT_AUTHENTICATED_PATH = '/dashboard';

const AUTH_ONLY_PATHS = ['/login', '/register', '/oauth/callback'];

function isRedirectState(state: unknown): state is RedirectState {
  if (typeof state !== 'object' || state === null || !('from' in state)) return false;
  const { from } = state as { from: unknown };
  return (
    typeof from === 'object' &&
    from !== null &&
    'pathname' in from &&
    typeof (from as { pathname: unknown }).pathname === 'string'
  );
}

/** Where to send the user after signing in: `location.state.from` (set by ProtectedRoute) or /dashboard. */
export function getPostLoginPath(state: unknown): string {
  if (!isRedirectState(state)) return DEFAULT_AUTHENTICATED_PATH;
  const { pathname, search, hash } = state.from;
  if (AUTH_ONLY_PATHS.includes(pathname)) return DEFAULT_AUTHENTICATED_PATH;
  return `${pathname}${search ?? ''}${hash ?? ''}`;
}
