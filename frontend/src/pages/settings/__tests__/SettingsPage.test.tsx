import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { businessProfileSchema, DEFAULT_PROFILE_FORM_VALUES } from '../../../components/settings/businessProfileSchema';
import { LogoUploader } from '../../../components/settings/LogoUploader';
import { getBusinessProfile, upsertBusinessProfile } from '../../../services/businessProfileService';
import { uploadFile } from '../../../services/uploadService';
import { renderWithProviders } from '../../../test/renderWithProviders';
import SettingsPage from '../SettingsPage';
import { makeProfile } from './fixtures';

vi.mock('../../../services/businessProfileService', () => ({
  PROFILE_NOT_FOUND_CODE: 'profile_not_found',
  getBusinessProfile: vi.fn(),
  upsertBusinessProfile: vi.fn(),
}));

vi.mock('../../../services/uploadService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/uploadService')>();
  return {
    ...actual,
    uploadFile: vi.fn(),
    fetchUploadBlob: vi.fn(),
    deleteUpload: vi.fn(),
  };
});

const mockedGet = vi.mocked(getBusinessProfile);
const mockedUpsert = vi.mocked(upsertBusinessProfile);
const mockedUpload = vi.mocked(uploadFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsPage', () => {
  it('renders the loaded profile and saves changes', async () => {
    const profile = makeProfile();
    mockedGet.mockResolvedValue(profile);
    mockedUpsert.mockImplementation(async (input) => ({ ...profile, businessName: input.businessName }));
    const user = userEvent.setup();

    renderWithProviders(<SettingsPage />);

    const name = await screen.findByLabelText(/business name/i);
    expect(name).toHaveValue('Acme Studio');
    expect(screen.getByTestId('settings-next-bill')).toHaveTextContent('INV-00042');

    const save = screen.getByRole('button', { name: /save changes/i });
    expect(save).toBeDisabled();

    await user.clear(name);
    await user.type(name, 'Acme Labs');
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    await user.click(save);

    await waitFor(() => expect(mockedUpsert).toHaveBeenCalledTimes(1));
    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: 'Acme Labs',
        defaultCurrency: 'USD',
        billNumberPrefix: 'INV-',
        defaultDueDays: 14,
        defaultTaxRate: '5.00',
        reminderDaysAfterDue: [1, 7, 14],
        logoFileId: null,
      }),
    );
    expect(await screen.findByText(/settings saved/i)).toBeInTheDocument();
  });

  it('shows validation errors for a bad currency, prefix and tax rate', async () => {
    mockedGet.mockResolvedValue(makeProfile());
    const user = userEvent.setup();

    renderWithProviders(<SettingsPage />);
    await screen.findByLabelText(/business name/i);

    await user.click(screen.getByRole('tab', { name: /billing defaults/i }));

    await user.selectOptions(screen.getByLabelText(/default currency/i), '__other__');
    await user.type(screen.getByLabelText(/currency code/i), 'US');

    const prefix = screen.getByLabelText(/bill number prefix/i);
    await user.clear(prefix);
    await user.type(prefix, 'BM #');

    const tax = screen.getByLabelText(/default tax rate/i);
    await user.clear(tax);
    await user.type(tax, '150');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/3-letter uppercase iso code/i)).toBeInTheDocument();
    expect(screen.getByText(/only letters, digits/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot exceed 100%/i)).toBeInTheDocument();
    expect(mockedUpsert).not.toHaveBeenCalled();
  });

  it('shows an onboarding hint when no profile exists yet', async () => {
    mockedGet.mockResolvedValue(null);
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText(/haven't set up your business profile/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/business name/i)).toHaveValue('');
  });
});

describe('businessProfileSchema', () => {
  const valid = { ...DEFAULT_PROFILE_FORM_VALUES, businessName: 'Acme' };

  it('accepts backend-compatible values', () => {
    expect(businessProfileSchema.safeParse(valid).success).toBe(true);
    expect(businessProfileSchema.safeParse({ ...valid, defaultTaxRate: '100' }).success).toBe(true);
  });

  it.each([
    ['lowercase currency', { defaultCurrency: 'usd' }],
    ['long prefix', { billNumberPrefix: 'A'.repeat(21) }],
    ['three-decimal tax', { defaultTaxRate: '5.125' }],
    ['due days > 365', { defaultDueDays: 366 }],
    ['duplicate reminders', { reminderDaysAfterDue: [1, 1] }],
    ['too many reminders', { reminderDaysAfterDue: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
  ])('rejects %s', (_label, override) => {
    expect(businessProfileSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe('LogoUploader', () => {
  it('rejects an oversize file without uploading it', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LogoUploader logoFileId={null} onUploaded={vi.fn()} onRemove={vi.fn()} />,
    );

    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'logo.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('logo-file-input'), big);

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('uploads a valid logo and hands it to the parent', async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn().mockResolvedValue(undefined);
    const uploaded = {
      id: 9,
      filename: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 3,
      purpose: 'logo' as const,
      createdAt: '2026-10-01T00:00:00Z',
      url: '/api/v1/uploads/9',
    };
    mockedUpload.mockResolvedValue(uploaded);
    renderWithProviders(<LogoUploader logoFileId={null} onUploaded={onUploaded} onRemove={vi.fn()} />);

    const small = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('logo-file-input'), small);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(uploaded));
    expect(mockedUpload).toHaveBeenCalledWith(small, 'logo');
  });
});
