import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authService from '../../../services/authService';
import { tokenStorage } from '../../../services/tokenStorage';
import { renderWithProviders } from '../../../test/renderWithProviders';
import OAuthCallbackPage from '../OAuthCallbackPage';
import { TEST_USER } from './authTestUtils';

vi.mock('../../../services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/authService')>();
  return { ...actual, getMe: vi.fn() };
});

const mockedGetMe = vi.mocked(authService.getMe);

function renderCallback() {
  return renderWithProviders(
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/dashboard" element={<div>Dashboard screen</div>} />
      <Route path="/login" element={<div>Login screen</div>} />
    </Routes>,
    { route: '/oauth/callback' },
  );
}

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('stores tokens from the URL hash, clears the hash and goes to the dashboard', async () => {
    mockedGetMe.mockResolvedValue({ ...TEST_USER, oauthProvider: 'google', isVerified: true });
    window.history.replaceState(
      null,
      '',
      '/oauth/callback#accessToken=oauth-access&refreshToken=oauth-refresh&tokenType=bearer',
    );

    renderCallback();

    expect(await screen.findByText('Dashboard screen')).toBeInTheDocument();
    expect(tokenStorage.getAccessToken()).toBe('oauth-access');
    expect(tokenStorage.getRefreshToken()).toBe('oauth-refresh');
    expect(window.location.hash).toBe('');
  });

  it('redirects to the login error page when the hash has no tokens', async () => {
    window.history.replaceState(null, '', '/oauth/callback');

    renderCallback();

    expect(await screen.findByText('Login screen')).toBeInTheDocument();
    expect(tokenStorage.getAccessToken()).toBeNull();
  });
});
