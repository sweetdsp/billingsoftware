import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingState } from '../../components/ui/LoadingState';
import { useAuth } from '../../hooks/useAuth';
import { parseOAuthHash } from '../../services/authService';

export const OAUTH_FAILED_PATH = '/login?error=oauth_failed';

/**
 * Landing page for `${APP_BASE_URL}/oauth/callback#accessToken=..&refreshToken=..&tokenType=bearer`.
 * Stores the tokens, strips them from the URL and continues to the dashboard.
 */
export default function OAuthCallbackPage() {
  const { setTokensFromOAuth } = useAuth();
  const navigate = useNavigate();
  // The hash is cleared on the first run, so React StrictMode's second effect run must be a no-op.
  const hasHandled = useRef<boolean>(false);

  useEffect(() => {
    if (hasHandled.current) return;
    hasHandled.current = true;

    const tokens = parseOAuthHash(window.location.hash);
    // Never leave tokens in the address bar or browser history.
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );

    if (!tokens) {
      navigate(OAUTH_FAILED_PATH, { replace: true });
      return;
    }

    setTokensFromOAuth(tokens)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => navigate(OAUTH_FAILED_PATH, { replace: true }));
  }, [navigate, setTokensFromOAuth]);

  return <LoadingState label="Signing you in…" />;
}
