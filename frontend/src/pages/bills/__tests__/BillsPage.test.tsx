import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { billService } from '../../../services/billService';
import { makeBillListItem, makePage } from '../../../test/billingFixtures';
import { renderWithProviders } from '../../../test/renderWithProviders';
import BillsPage from '../BillsPage';

vi.mock('../../../services/billService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/billService')>();
  return { ...actual, billService: { listBills: vi.fn() } };
});

const listBills = vi.mocked(billService.listBills);

describe('BillsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists bills with customer, total, balance and status', async () => {
    listBills.mockResolvedValue(
      makePage([
        makeBillListItem(),
        makeBillListItem({
          id: 12,
          billNumber: 'INV-00012',
          customerName: 'Bob',
          status: 'paid',
          balanceDue: '0.00',
          amountPaid: '110.00',
        }),
      ]),
    );
    renderWithProviders(<BillsPage />, { route: '/bills' });

    expect(await screen.findByText('INV-00011')).toBeInTheDocument();
    expect(screen.getByText('INV-00012')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    // Each status is both a filter button and the row's badge.
    expect(screen.getAllByText('Sent')).toHaveLength(2);
    expect(screen.getAllByText('Paid')).toHaveLength(2);
    expect(screen.getByText('Showing 1–2 of 2 bills')).toBeInTheDocument();
    expect(listBills).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined, page: 1, pageSize: 20 }),
    );
  });

  it('reads status, dates and page from the URL', async () => {
    listBills.mockResolvedValue(makePage([makeBillListItem({ status: 'overdue' })]));
    renderWithProviders(<BillsPage />, {
      route: '/bills?status=overdue&from=2026-10-01&to=2026-10-31&page=2',
    });

    await screen.findByText('INV-00011');
    expect(listBills).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'overdue', from: '2026-10-01', to: '2026-10-31', page: 2 }),
    );
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a bogus status or date in the URL', async () => {
    listBills.mockResolvedValue(makePage([makeBillListItem()]));
    renderWithProviders(<BillsPage />, { route: '/bills?status=hacked&from=not-a-date' });

    await screen.findByText('INV-00011');
    expect(listBills).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined, from: undefined }),
    );
  });

  it('shows a call to action when there are no bills at all', async () => {
    listBills.mockResolvedValue(makePage([]));
    renderWithProviders(<BillsPage />, { route: '/bills' });
    expect(await screen.findByText('No bills yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a bill/i })).toBeInTheDocument();
  });

  it('offers to clear filters when a filtered search is empty', async () => {
    listBills.mockResolvedValue(makePage([]));
    renderWithProviders(<BillsPage />, { route: '/bills?status=paid' });
    expect(await screen.findByText('No bills match these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });
});
