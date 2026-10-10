import type {
  AuthTokens,
  ForgotPasswordRequest,
  LoginRequest,
  LogoutRequest,
  MessageResponse,
  RefreshRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateMeRequest,
  User,
  VerifyEmailRequest,
} from '../types';
import { API_BASE_URL, api } from './api';

/** Typed wrappers for Module 1 (`/api/v1/auth/*`). */

/** `POST /auth/register` → 201 UserOut (no tokens; log in afterwards). */
export async function register(body: RegisterRequest): Promise<User> {
  const { data } = await api.post<User>('/auth/register', body);
  return data;
}

/** `POST /auth/login` → token pair. 401 `invalid_credentials`, 403 `inactive`. */
export async function login(body: LoginRequest): Promise<AuthTokens> {
  const { data } = await api.post<AuthTokens>('/auth/login', body);
  return data;
}

/** `POST /auth/refresh` → rotated token pair. */
export async function refresh(body: RefreshRequest): Promise<AuthTokens> {
  const { data } = await api.post<AuthTokens>('/auth/refresh', body);
  return data;
}

/** `POST /auth/logout` → 204. */
export async function logout(body: LogoutRequest): Promise<void> {
  await api.post('/auth/logout', body);
}

/** `POST /auth/verify-email` → UserOut. 400 `invalid_token`. */
export async function verifyEmail(body: VerifyEmailRequest): Promise<User> {
  const { data } = await api.post<User>('/auth/verify-email', body);
  return data;
}

/** `POST /auth/forgot-password` → always 200. */
export async function forgotPassword(body: ForgotPasswordRequest): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>('/auth/forgot-password', body);
  return data;
}

/** `POST /auth/reset-password` → 200. 400 `invalid_token`. */
export async function resetPassword(body: ResetPasswordRequest): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>('/auth/reset-password', body);
  return data;
}

/** `GET /auth/me`. */
export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me');
  return data;
}

/** `PUT /auth/me`. 400 `invalid_current_password`. */
export async function updateMe(body: UpdateMeRequest): Promise<User> {
  const { data } = await api.put<User>('/auth/me', body);
  return data;
}

/** Full-page navigation target for Google sign-in (not an XHR endpoint). */
export function getGoogleAuthUrl(): string {
  return `${API_BASE_URL}/auth/google`;
}

/** Tokens parsed from the OAuth callback URL fragment. */
export function parseOAuthHash(hash: string): AuthTokens | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const accessToken = params.get('accessToken');
  const refreshToken = params.get('refreshToken');
  if (!accessToken || !refreshToken) {
    return null;
  }
  return { accessToken, refreshToken, tokenType: params.get('tokenType') ?? 'bearer' };
}

export const authService = {
  register,
  login,
  refresh,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getMe,
  updateMe,
  getGoogleAuthUrl,
  parseOAuthHash,
};

export default authService;
