import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { planService } from '../../../services/planService';
import { makePage, makePlanListItem } from '../../../test/billingFixtures';
import { renderWithProviders } from '../../../test/renderWithProviders';
import PlansPage from '../PlansPage';

vi.mock('../../../services/planService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/planService')>();
  return { ...actual, planService: { listPlans: vi.fn() } };
});

const listPlans = vi.mocked(planService.listPlans);

describe('PlansPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists plans with customer, schedule, next bill and per-period total', async () => {
    listPlans.mockResolvedValue(
      makePage([
        makePlanListItem(),
        makePlanListItem({
          id: 22,
          name: 'Gym membership',
          customerName: 'Bob',
          frequency: 'weekly',
          intervalCount: 2,
          status: 'paused',
          total: '20.00',
        }),
      ]),
    );
    renderWithProviders(<PlansPage />, { route: '/plans' });

    expect(await screen.findByText('Website hosting')).toBeInTheDocument();
    expect(screen.getByText('Gym membership')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('Every 2 weeks')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    // "Paused" is both the filter button and the row's status badge.
    expect(screen.getAllByText('Paused')).toHaveLength(2);
  });

  it('filters by the status in the URL and ignores an invalid one', async () => {
    listPlans.mockResolvedValue(makePage([makePlanListItem()]));
    renderWithProviders(<PlansPage />, { route: '/plans?status=paused' });
    await screen.findByText('Website hosting');
    expect(listPlans).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }));
    expect(screen.getByRole('button', { name: 'Paused' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('treats an unknown status as "All"', async () => {
    listPlans.mockResolvedValue(makePage([makePlanListItem()]));
    renderWithProviders(<PlansPage />, { route: '/plans?status=bogus' });
    await screen.findByText('Website hosting');
    expect(listPlans).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
  });

  it('invites the user to create their first plan', async () => {
    listPlans.mockResolvedValue(makePage([]));
    renderWithProviders(<PlansPage />, { route: '/plans' });
    expect(await screen.findByText('No billing plans yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a plan/i })).toBeInTheDocument();
  });
});
