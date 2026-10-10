import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customerService } from '../../../services/customerService';
import { renderWithProviders } from '../../../test/renderWithProviders';
import CustomersPage from '../CustomersPage';
import { makeListItem, makePage } from './fixtures';

vi.mock('../../../services/customerService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/customerService')>();
  return {
    ...actual,
    customerService: {
      listCustomers: vi.fn(),
      getCustomer: vi.fn(),
      createCustomer: vi.fn(),
      updateCustomer: vi.fn(),
      archiveCustomer: vi.fn(),
    },
  };
});

const listCustomers = vi.mocked(customerService.listCustomers);

describe('CustomersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a row per customer with company and active plan count', async () => {
    listCustomers.mockResolvedValue(
      makePage([
        makeListItem(),
        makeListItem({ id: 2, name: 'Bright Kids', companyName: null, activePlanCount: 1 }),
      ]),
    );

    renderWithProviders(<CustomersPage />, { route: '/customers' });

    expect(await screen.findByText('Acme Tutoring')).toBeInTheDocument();
    expect(screen.getByText('Bright Kids')).toBeInTheDocument();
    expect(screen.getByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2 customers')).toBeInTheDocument();
    expect(listCustomers).toHaveBeenCalledWith({
      q: undefined,
      active: true,
      page: 1,
      pageSize: 20,
    });
  });

  it('debounces the search box into the list query', async () => {
    listCustomers.mockResolvedValue(makePage([makeListItem()]));
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />, { route: '/customers' });
    await screen.findByText('Acme Tutoring');

    await user.type(screen.getByRole('searchbox', { name: /search customers/i }), 'acme');

    await waitFor(() =>
      expect(listCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'acme', page: 1, active: true }),
      ),
    );
    // Only the final debounced value reaches the API, not every keystroke.
    expect(listCustomers).not.toHaveBeenCalledWith(expect.objectContaining({ q: 'a' }));
  });

  it('reads archived filter and page from the URL', async () => {
    listCustomers.mockResolvedValue({ ...makePage([makeListItem()], 45), page: 2 });

    renderWithProviders(<CustomersPage />, { route: '/customers?active=false&page=2' });

    await screen.findByText('Acme Tutoring');
    expect(listCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, page: 2 }),
    );
    expect(screen.getByRole('button', { name: 'Archived' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('distinguishes "no customers yet" from "no search results"', async () => {
    listCustomers.mockResolvedValue(makePage([], 0));

    const first = renderWithProviders(<CustomersPage />, { route: '/customers' });
    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    first.unmount();

    renderWithProviders(<CustomersPage />, { route: '/customers?q=zzz' });
    expect(await screen.findByText('No customers match “zzz”')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });
});
