import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_LOGOUT_EVENT } from '../services/api';
import * as authService from '../services/authService';
import { tokenStorage } from '../services/tokenStorage';
import type { AuthTokens, RegisterRequest, UpdateMeRequest, User } from '../types';
import { AuthContext, AutoLoginError, type AuthContextValue } from './authContextDefinition';

export interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Session state for the whole app.
 * - Restores the session from stored tokens via `GET /auth/me` on first load.
 * - Token refresh/rotation is handled by the api interceptor; when it gives up it dispatches
 *   `auth:logout`, which clears the user here.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearSession = useCallback((): void => {
    tokenStorage.clearTokens();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    if (!tokenStorage.hasTokens()) {
      setUser(null);
      return null;
    }
    try {
      const me = await authService.getMe();
      setUser(me);
      return me;
    } catch {
      // Invalid/expired session: the api interceptor has already tried to refresh.
      setUser(null);
      return null;
    }
  }, []);

  // Restore the session on first load.
  useEffect(() => {
    let isActive = true;
    void refreshUser().finally(() => {
      if (isActive) setIsLoading(false);
    });
    return () => {
      isActive = false;
    };
  }, [refreshUser]);

  // The api client dispatches this when a token refresh fails.
  useEffect(() => {
    const handleForcedLogout = (): void => {
      tokenStorage.clearTokens();
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
  }, [queryClient]);

  const startSession = useCallback(
    async (tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): Promise<User> => {
      tokenStorage.setTokens(tokens);
      try {
        const me = await authService.getMe();
        setUser(me);
        return me;
      } catch (err) {
        tokenStorage.clearTokens();
        setUser(null);
        throw err;
      }
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const tokens = await authService.login({ email, password });
      return startSession(tokens);
    },
    [startSession],
  );

  const register = useCallback(
    async (input: RegisterRequest): Promise<User> => {
      await authService.register(input);
      // Registration returns no tokens: sign in straight away with the same credentials.
      try {
        return await login(input.email, input.password);
      } catch (err) {
        throw new AutoLoginError(err);
      }
    },
    [login],
  );

  const setTokensFromOAuth = useCallback(
    (tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): Promise<User> => startSession(tokens),
    [startSession],
  );

  const updateProfile = useCallback(async (input: UpdateMeRequest): Promise<User> => {
    const updated = await authService.updateMe(input);
    setUser(updated);
    return updated;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    const refreshToken = tokenStorage.getRefreshToken();
    try {
      if (refreshToken) {
        await authService.logout({ refreshToken });
      }
    } catch {
      // Best effort: the local session is cleared regardless of the server response.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      register,
      refreshUser,
      setTokensFromOAuth,
      updateProfile,
    }),
    [user, isLoading, login, logout, register, refreshUser, setTokensFromOAuth, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
