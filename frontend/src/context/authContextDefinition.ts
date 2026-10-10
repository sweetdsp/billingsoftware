import { createContext } from 'react';
import type { AuthTokens, RegisterRequest, UpdateMeRequest, User } from '../types';

export interface AuthContextValue {
  /** The signed-in user, or null when signed out. */
  user: User | null;
  /** True when a user is signed in. */
  isAuthenticated: boolean;
  /** True while the session is being restored on first load. */
  isLoading: boolean;
  /** Email/password login. Stores tokens and resolves with the current user. */
  login: (email: string, password: string) => Promise<User>;
  /** Revokes the refresh token server-side (best effort) and always clears local session state. */
  logout: () => Promise<void>;
  /** Creates an account, then signs in with the same credentials. Resolves with the new user. */
  register: (input: RegisterRequest) => Promise<User>;
  /** Re-fetches `/auth/me`. Resolves with null when there is no valid session. */
  refreshUser: () => Promise<User | null>;
  /** Stores tokens received from the Google OAuth callback and loads the user. */
  setTokensFromOAuth: (tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>) => Promise<User>;
  /** `PUT /auth/me` and update the cached user. */
  updateProfile: (input: UpdateMeRequest) => Promise<User>;
}

/** Thrown by `register` when the account was created but the automatic sign-in failed. */
export class AutoLoginError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('Your account was created, but we could not sign you in automatically. Please sign in.');
    this.name = 'AutoLoginError';
    this.cause = cause;
  }
}

export const AuthContext =createContext<AuthContextValue | undefined>(undefined);
