import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBusinessProfile, upsertBusinessProfile } from '../../../services/businessProfileService';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { makeProfile } from '../../settings/__tests__/fixtures';
import { createFirstCustomer } from '../onboardingApi';
import OnboardingPage from '../OnboardingPage';

vi.mock('../../../services/businessProfileService', () => ({
  PROFILE_NOT_FOUND_CODE: 'profile_not_found',
  getBusinessProfile: vi.fn(),
  upsertBusinessProfile: vi.fn(),
}));

vi.mock('../onboardingApi', () => ({
  createFirstCustomer: vi.fn(),
}));

const mockedGet = vi.mocked(getBusinessProfile);
const mockedUpsert = vi.mocked(upsertBusinessProfile);
const mockedCreateCustomer = vi.mocked(createFirstCustomer);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OnboardingPage', () => {
  it('starts at the business step when no profile exists and advances after saving', async () => {
    mockedGet.mockResolvedValue(null);
    mockedUpsert.mockImplementation(async (input) =>
      makeProfile({ businessName: input.businessName, billNumberPrefix: input.billNumberPrefix ?? 'BM-' }),
    );
    const user = userEvent.setup();

    renderWithProviders(<OnboardingPage />, { route: '/onboarding' });

    expect(await screen.findByRole('heading', { name: /tell us about your business/i })).toBeInTheDocument();
    expect(screen.getByTestId('next-bill-preview')).toHaveTextContent('BM-00001');

    await user.type(screen.getByLabelText(/business name/i), 'Acme Studio');
    await user.selectOptions(screen.getByLabelText(/default currency/i), 'INR');
    await user.click(screen.getByRole('button', { name: /save & continue/i }));

    await waitFor(() => expect(mockedUpsert).toHaveBeenCalledTimes(1));
    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: 'Acme Studio',
        defaultCurrency: 'INR',
        billNumberPrefix: 'BM-',
        defaultDueDays: 7,
      }),
    );
    expect(await screen.findByRole('heading', { name: /add your first customer/i })).toBeInTheDocument();
  });

  it('requires a business name before continuing', async () => {
    mockedGet.mockResolvedValue(null);
    const user = userEvent.setup();

    renderWithProviders(<OnboardingPage />, { route: '/onboarding' });
    await user.click(await screen.findByRole('button', { name: /save & continue/i }));

    expect(await screen.findByText(/business name is required/i)).toBeInTheDocument();
    expect(mockedUpsert).not.toHaveBeenCalled();
  });

  it('starts at the customer step when the profile already exists', async () => {
    mockedGet.mockResolvedValue(makeProfile());
    mockedCreateCustomer.mockResolvedValue({
      id: 5,
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: null,
      companyName: null,
      billingAddress: null,
      taxId: null,
      notes: null,
      isActive: true,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });
    const user = userEvent.setup();

    renderWithProviders(<OnboardingPage />, { route: '/onboarding' });

    expect(await screen.findByRole('heading', { name: /add your first customer/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/customer name/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/customer email/i), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: /add customer/i }));

    await waitFor(() =>
      expect(mockedCreateCustomer).toHaveBeenCalledWith({
        name: 'Jane Doe',
        email: 'jane@example.com',
        companyName: null,
      }),
    );
    expect(await screen.findByRole('button', { name: /create your first plan/i })).toBeInTheDocument();
  });
});
