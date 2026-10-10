import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { AuthTokens, User } from '../../../types';

export const TEST_USER: User = {
  id: 1,
  email: 'ada@example.com',
  fullName: 'Ada Lovelace',
  isActive: true,
  isVerified: false,
  isAdmin: false,
  oauthProvider: null,
  hasPassword: true,
  createdAt: '2026-10-10T06:00:00Z',
};

export const TEST_TOKENS: AuthTokens = {
  accessToken: 'access-123',
  refreshToken: 'refresh-456',
  tokenType: 'bearer',
};

/** Build an AxiosError shaped like a backend `{detail, code}` error response. */
export function apiError(status: number, detail: string, code?: string): AxiosError {
  const config: InternalAxiosRequestConfig = { headers: new AxiosHeaders() };
  const response: AxiosResponse = {
    status,
    statusText: String(status),
    data: { detail, code },
    headers: {},
    config,
  };
  return new AxiosError(detail, String(status), config, undefined, response);
}
