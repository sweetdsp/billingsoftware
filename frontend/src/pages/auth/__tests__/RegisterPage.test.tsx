import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authService from '../../../services/authService';
import { renderWithProviders } from '../../../test/renderWithProviders';
import RegisterPage from '../RegisterPage';
import { TEST_TOKENS, TEST_USER } from './authTestUtils';

vi.mock('../../../services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/authService')>();
  return { ...actual, register: vi.fn(), login: vi.fn(), getMe: vi.fn() };
});

const mockedRegister = vi.mocked(authService.register);
const mockedLogin = vi.mocked(authService.login);
const mockedGetMe = vi.mocked(authService.getMe);

function renderRegister() {
  return renderWithProviders(
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/onboarding" element={<div>Onboarding screen</div>} />
    </Routes>,
    { route: '/register' },
  );
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error when the passwords do not match', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/^full name$/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'secret999');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('registers, logs in automatically and goes to onboarding', async () => {
    mockedRegister.mockResolvedValue(TEST_USER);
    mockedLogin.mockResolvedValue(TEST_TOKENS);
    mockedGetMe.mockResolvedValue(TEST_USER);
    const user = userEvent.setup();
    renderRegister();

    await user.type(await screen.findByLabelText(/^full name$/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/^email$/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByText('Onboarding screen')).toBeInTheDocument();
    expect(mockedRegister).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'secret123',
      fullName: 'Ada Lovelace',
    });
    expect(mockedLogin).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret123' });
  });
});
