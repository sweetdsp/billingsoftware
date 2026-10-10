import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customerService } from '../../../services/customerService';
import { renderWithProviders } from '../../../test/renderWithProviders';
import CustomerDetailPage from '../CustomerDetailPage';
import { makeApiError, makeDetail } from './fixtures';

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

const getCustomer = vi.mocked(customerService.getCustomer);
const archiveCustomer = vi.mocked(customerService.archiveCustomer);

function renderPage(id = 7) {
  return renderWithProviders(
    <Routes>
      <Route path="/customers/:id" element={<CustomerDetailPage />} />
      <Route path="/customers" element={<p>Customers list route</p>} />
    </Routes>,
    { route: `/customers/${id}` },
  );
}

describe('CustomerDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header, balance and plans / bills / payments sections', async () => {
    getCustomer.mockResolvedValue(makeDetail());
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Jane Doe' })).toBeInTheDocument();
    expect(getCustomer).toHaveBeenCalledWith(7);
    expect(screen.getByText('Doe Gym')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'jane@example.test' })).toHaveAttribute(
      'href',
      'mailto:jane@example.test',
    );
    // Single currency across plans/bills → balance is labelled with it.
    const balanceTile = screen.getByText('Balance due').closest('.chakra-stat');
    expect(balanceTile).not.toBeNull();
    expect(within(balanceTile as HTMLElement).getByText('$250.00')).toBeInTheDocument();

    const plans = screen.getByRole('region', { name: 'Plans' });
    expect(within(plans).getByRole('link', { name: 'Monthly membership' })).toHaveAttribute(
      'href',
      '/plans/11',
    );
    expect(within(plans).getByRole('link', { name: 'New plan' })).toHaveAttribute(
      'href',
      '/plans/new?customerId=7',
    );

    const bills = screen.getByRole('region', { name: 'Recent bills' });
    expect(within(bills).getByRole('link', { name: 'INV-0001' })).toHaveAttribute('href', '/bills/21');
    expect(within(bills).getByText('Sent')).toBeInTheDocument();

    const payments = screen.getByRole('region', { name: 'Recent payments' });
    expect(within(payments).getByText('Bank transfer')).toBeInTheDocument();
    expect(within(payments).getByRole('link', { name: 'View bill' })).toHaveAttribute(
      'href',
      '/bills/20',
    );
  });

  it('explains why archiving failed when the customer has active plans', async () => {
    getCustomer.mockResolvedValue(makeDetail());
    archiveCustomer.mockRejectedValue(
      makeApiError(
        409,
        "Cancel this customer's active or paused billing plans before archiving",
        'customer_has_active_plans',
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(await within(dialog).findByText('This customer still has billing plans')).toBeInTheDocument();
    expect(within(dialog).getByText(/cancel the plans below first/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Monthly membership' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(archiveCustomer).toHaveBeenCalledWith(7);
  });

  it('archives and returns to the customer list', async () => {
    getCustomer.mockResolvedValue(makeDetail({ plans: [] }));
    archiveCustomer.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Customers list route')).toBeInTheDocument();
  });

  it('shows "Customer not found" for a 404', async () => {
    getCustomer.mockRejectedValue(makeApiError(404, 'Customer not found', 'customer_not_found'));
    renderPage(999);

    expect(await screen.findByText('Customer not found')).toBeInTheDocument();
  });

  it('shows the archived banner with a Restore action', async () => {
    getCustomer.mockResolvedValue(makeDetail({ isActive: false }));
    renderPage();

    expect(await screen.findByText(/this customer is archived/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });
});
