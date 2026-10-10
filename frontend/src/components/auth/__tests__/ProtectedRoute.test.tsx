import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authService from '../../../services/authService';
import { tokenStorage } from '../../../services/tokenStorage';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { User } from '../../../types';
import { ProtectedRoute } from '../ProtectedRoute';

vi.mock('../../../services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/authService')>();
  return { ...actual, getMe: vi.fn() };
});

const mockedGetMe = vi.mocked(authService.getMe);

const USER: User = {
  id: 7,
  email: 'grace@example.com',
  fullName: 'Grace Hopper',
  isActive: true,
  isVerified: true,
  isAdmin: false,
  oauthProvider: null,
  hasPassword: true,
  createdAt: '2026-10-10T06:00:00Z',
};

function renderProtected() {
  return renderWithProviders(
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<div>Secret dashboard</div>} />
      </Route>
      <Route path="/login" element={<div>Login screen</div>} />
    </Routes>,
    { route: '/dashboard' },
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects signed-out users to /login', async () => {
    renderProtected();

    expect(await screen.findByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText('Secret dashboard')).not.toBeInTheDocument();
    expect(mockedGetMe).not.toHaveBeenCalled();
  });

  it('renders the protected content once the session is restored', async () => {
    tokenStorage.setTokens({ accessToken: 'a', refreshToken: 'r' });
    mockedGetMe.mockResolvedValue(USER);

    renderProtected();

    expect(await screen.findByText('Secret dashboard')).toBeInTheDocument();
  });
});
