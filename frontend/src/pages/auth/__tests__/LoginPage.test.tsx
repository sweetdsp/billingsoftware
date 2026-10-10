import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authService from '../../../services/authService';
import { tokenStorage } from '../../../services/tokenStorage';
import { renderWithProviders } from '../../../test/renderWithProviders';
import LoginPage from '../LoginPage';
import { TEST_TOKENS, TEST_USER, apiError } from './authTestUtils';

vi.mock('../../../services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/authService')>();
  return { ...actual, login: vi.fn(), getMe: vi.fn(), logout: vi.fn() };
});

const mockedLogin = vi.mocked(authService.login);
const mockedGetMe = vi.mocked(authService.getMe);

function renderLogin(route = '/login') {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<div>Dashboard screen</div>} />
    </Routes>,
    { route },
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows validation errors and does not call the API for an empty form', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it('rejects an invalid email address', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/^email$/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password$/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it('logs in, stores the tokens and navigates to the dashboard', async () => {
    mockedLogin.mockResolvedValue(TEST_TOKENS);
    mockedGetMe.mockResolvedValue(TEST_USER);
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText('Dashboard screen')).toBeInTheDocument();
    expect(mockedLogin).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret123' });
    expect(tokenStorage.getAccessToken()).toBe(TEST_TOKENS.accessToken);
    expect(tokenStorage.getRefreshToken()).toBe(TEST_TOKENS.refreshToken);
  });

  it('shows a friendly message for invalid_credentials', async () => {
    mockedLogin.mockRejectedValue(apiError(401, 'Incorrect email or password', 'invalid_credentials'));
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(
      await screen.findByText('Incorrect email or password. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Dashboard screen')).not.toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.getAccessToken()).toBeNull());
  });

  it('shows a message when Google sign-in failed', async () => {
    renderLogin('/login?error=oauth_failed');

    expect(await screen.findByText(/google sign-in failed/i)).toBeInTheDocument();
  });
});
