import type { AuthTokens } from '../types';

const ACCESS_TOKEN_KEY = 'billmaker.accessToken';
const REFRESH_TOKEN_KEY = 'billmaker.refreshToken';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode or blocked site data); the session will not persist.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

export const tokenStorage = {
  getAccessToken(): string | null {
    return safeGet(ACCESS_TOKEN_KEY);
  },
  getRefreshToken(): string | null {
    return safeGet(REFRESH_TOKEN_KEY);
  },
  setTokens(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): void {
    safeSet(ACCESS_TOKEN_KEY, tokens.accessToken);
    safeSet(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },
  clearTokens(): void {
    safeRemove(ACCESS_TOKEN_KEY);
    safeRemove(REFRESH_TOKEN_KEY);
  },
  hasTokens(): boolean {
    return safeGet(ACCESS_TOKEN_KEY) !== null;
  },
};
