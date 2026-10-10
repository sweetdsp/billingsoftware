import axios, { type InternalAxiosRequestConfig } from 'axios';
import type { AuthTokens, RefreshRequest, ValidationErrorItem } from '../types';
import { tokenStorage } from './tokenStorage';

const API_ORIGIN: string = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const API_BASE_URL = `${API_ORIGIN}/api/v1`;

/** Window event dispatched when the session can no longer be refreshed. AuthProvider listens to it. */
export const AUTH_LOGOUT_EVENT = 'auth:logout';

/** Endpoints for which a 401 must NOT trigger a refresh attempt. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

/**
 * Single in-flight refresh promise. Every request that receives a 401 while a refresh is running
 * awaits this same promise (i.e. is queued) and is replayed once it resolves.
 */
let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }
  const body: RefreshRequest = { refreshToken };
  // Bare axios so the refresh call bypasses our interceptors.
  const { data } = await axios.post<AuthTokens>(`${API_BASE_URL}/auth/refresh`, body);
  tokenStorage.setTokens(data);
  return data.accessToken;
}

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function shouldSkipRefresh(url: string | undefined): boolean {
  if (!url) return false;
  return NO_REFRESH_PATHS.some((path) => url.includes(path));
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }
    const original: RetriableRequestConfig = error.config;
    if (error.response?.status !== 401 || original._retry || shouldSkipRefresh(original.url)) {
      return Promise.reject(error);
    }

    original._retry = true;
    let newToken: string;
    try {
      newToken = await refreshAccessToken();
    } catch {
      // Refresh failed: the session is over.
      tokenStorage.clearTokens();
      window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
      return Promise.reject(error);
    }
    original.headers.set('Authorization', `Bearer ${newToken}`);
    return api(original);
  },
);

function isValidationErrorList(detail: unknown): detail is ValidationErrorItem[] {
  return (
    Array.isArray(detail) &&
    detail.length > 0 &&
    detail.every((item: unknown) => typeof item === 'object' && item !== null && 'msg' in item)
  );
}

function readField(data: unknown, field: string): unknown {
  if (typeof data === 'object' && data !== null && field in data) {
    return (data as Record<string, unknown>)[field];
  }
  return undefined;
}

/** Human-readable message for any error thrown by an API call (or anything else). */
export function getErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return 'Unable to reach the server. Check your connection and try again.';
    }
    const detail = readField(err.response.data, 'detail');
    if (typeof detail === 'string' && detail.length > 0) {
      return detail;
    }
    if (isValidationErrorList(detail)) {
      const first = detail[0];
      if (first) {
        const field = first.loc.filter((part) => part !== 'body').join('.');
        return field ? `${field}: ${first.msg}` : first.msg;
      }
    }
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'string' && err.length > 0) {
    return err;
  }
  return fallback;
}

/** Machine-readable error code from `{detail, code}` responses, if any. */
export function getErrorCode(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) {
    const code = readField(err.response?.data, 'code');
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** HTTP status of an API error, if any. */
export function getErrorStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

export default api;
