import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyticsService } from '../../../services/analyticsService';
import { paymentService } from '../../../services/paymentService';
import { apiError, makePage, makePayment, makeSummary } from '../../../test/billingFixtures';
import { renderWithProviders } from '../../../test/renderWithProviders';
import DashboardPage from '../DashboardPage';

vi.mock('../../../services/analyticsService', () => ({
  analyticsService: {
    getSummary: vi.fn(),
    getRevenue: vi.fn(),
    getAging: vi.fn(),
    getTopCustomers: vi.fn(),
  },
}));
vi.mock('../../../services/paymentService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/paymentService')>();
  return { ...actual, paymentService: { listPayments: vi.fn() } };
});
// Recharts needs real layout (ResizeObserver, sizes) that jsdom lacks; the charts are covered visually.
vi.mock('../../../components/dashboard/RevenueChart', () => ({
  RevenueChart: () => <div>revenue chart</div>,
}));
vi.mock('../../../components/dashboard/AgingChart', () => ({
  AgingChart: () => <div>aging chart</div>,
}));

const getSummary = vi.mocked(analyticsService.getSummary);

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyticsService.getRevenue).mockResolvedValue([]);
    vi.mocked(analyticsService.getAging).mockResolvedValue({ currency: 'USD', buckets: [] });
    vi.mocked(analyticsService.getTopCustomers).mockResolvedValue([
      { customerId: 3, customerName: 'Jane Doe', collected: '500.00' },
    ]);
    vi.mocked(paymentService.listPayments).mockResolvedValue(makePage([makePayment()]));
  });

  it('shows the headline numbers from the server', async () => {
    getSummary.mockResolvedValue(makeSummary());
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('$845.01')).toBeInTheDocument(); // MRR
    expect(screen.getByText('$37.50')).toBeInTheDocument(); // collected
    expect(screen.getByText('$1,362.00')).toBeInTheDocument(); // outstanding
    expect(screen.getByText('$792.00')).toBeInTheDocument(); // overdue
    expect(screen.getByText('7 bills')).toBeInTheDocument();
    expect(screen.getByText('3 active plans')).toBeInTheDocument();
  });

  it('lists upcoming bills, recent payments and top customers', async () => {
    getSummary.mockResolvedValue(makeSummary());
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('link', { name: 'Website hosting' })).toHaveAttribute(
      'href',
      '/plans/21',
    );
    expect(await screen.findByRole('link', { name: 'INV-00011' })).toHaveAttribute('href', '/bills/11');
    expect(await screen.findByRole('link', { name: 'Jane Doe' })).toHaveAttribute(
      'href',
      '/customers/3',
    );
    expect(await screen.findByText('revenue chart')).toBeInTheDocument();
    expect(await screen.findByText('aging chart')).toBeInTheDocument();
  });

  it('guides a new user through setup when there are no active plans', async () => {
    getSummary.mockResolvedValue(
      makeSummary({ activePlans: 0, activeCustomers: 0, upcomingBills: [], mrr: '0.00' }),
    );
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Get started')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a customer/i })).toBeInTheDocument();
    expect(screen.getByText('Nothing is scheduled to bill in the next 7 days.')).toBeInTheDocument();
  });

  it('points to creating a plan once a customer exists', async () => {
    getSummary.mockResolvedValue(makeSummary({ activePlans: 0, activeCustomers: 2 }));
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole('button', { name: /create a plan/i })).toBeInTheDocument();
  });

  it('explains which currencies are excluded from the figures', async () => {
    getSummary.mockResolvedValue(makeSummary({ excludedCurrencies: ['EUR', 'GBP'] }));
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/EUR, GBP are/i)).toBeInTheDocument();
  });

  it('shows a retryable error if the summary fails', async () => {
    getSummary.mockRejectedValue(apiError(500, 'Server exploded'));
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
