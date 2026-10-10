import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayISODate } from '../../../lib/date';
import { getBusinessProfile } from '../../../services/businessProfileService';
import { customerService } from '../../../services/customerService';
import { planService } from '../../../services/planService';
import { apiError, makePlanDetail, makeProfile } from '../../../test/billingFixtures';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { makeListItem, makePage } from '../../customers/__tests__/fixtures';
import { PlanForm } from '../../../components/plans/PlanForm';
import { defaultPlanValues } from '../../../components/plans/planSchema';
import PlanCreatePage from '../PlanCreatePage';

vi.mock('../../../services/planService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/planService')>();
  return { ...actual, planService: { createPlan: vi.fn(), getPlan: vi.fn() } };
});
vi.mock('../../../services/customerService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/customerService')>();
  return { ...actual, customerService: { listCustomers: vi.fn() } };
});
vi.mock('../../../services/businessProfileService', () => ({
  getBusinessProfile: vi.fn(),
  upsertBusinessProfile: vi.fn(),
}));

const createPlan = vi.mocked(planService.createPlan);
const listCustomers = vi.mocked(customerService.listCustomers);

function renderPage(route = '/plans/new') {
  return renderWithProviders(
    <Routes>
      <Route path="/plans/new" element={<PlanCreatePage />} />
      <Route path="/plans/:id" element={<div>plan detail page</div>} />
    </Routes>,
    { route },
  );
}

describe('PlanCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBusinessProfile).mockResolvedValue(
      makeProfile({ defaultCurrency: 'EUR', defaultDueDays: 30, defaultTaxRate: '18.00' }),
    );
    listCustomers.mockResolvedValue(
      makePage([makeListItem({ id: 3, name: 'Jane Doe', companyName: null })]),
    );
  });

  it('pre-fills currency, due days and tax rate from the business profile', async () => {
    renderPage();
    expect(await screen.findByLabelText(/payment due after/i)).toHaveValue('30');
    expect(screen.getByLabelText(/tax rate/i)).toHaveValue('18.00');
    expect(screen.getByLabelText(/currency/i)).toHaveValue('EUR');
    expect(screen.getByLabelText(/first billing date/i)).toHaveValue(todayISODate());
  });

  it('shows required-field errors and does not call the API', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /create plan/i }));

    expect(await screen.findByText('Plan name is required')).toBeInTheDocument();
    expect(screen.getByLabelText(/^customer/i)).toBeInvalid();
    expect(screen.getByText('Description is required')).toBeInTheDocument();
    expect(createPlan).not.toHaveBeenCalled();
  });

  it('shows a live estimate and submits the payload, then opens the new plan', async () => {
    createPlan.mockResolvedValue(makePlanDetail({ id: 77 }));
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'Jane Doe' });
    await user.selectOptions(screen.getByLabelText(/^customer/i), 'Jane Doe');
    await user.type(screen.getByLabelText(/plan name/i), 'Website hosting');
    const row = screen.getByTestId('line-item-row');
    await user.type(within(row).getByLabelText(/description/i), 'Hosting');
    await user.clear(within(row).getByLabelText(/quantity/i));
    await user.type(within(row).getByLabelText(/quantity/i), '2');
    await user.type(within(row).getByLabelText(/unit price/i), '50');

    // 2 x 50 = 100, + 18% tax = 118 (estimate only)
    expect(await screen.findByText('€118.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create plan/i }));

    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    expect(createPlan).toHaveBeenCalledWith({
      customerId: 3,
      name: 'Website hosting',
      description: null,
      currency: 'EUR',
      frequency: 'monthly',
      intervalCount: 1,
      startDate: todayISODate(),
      endDate: null,
      dueDays: 30,
      taxRate: '18.00',
      autoSend: true,
      lineItems: [{ description: 'Hosting', quantity: '2', unitPrice: '50' }],
    });
    expect(await screen.findByText('plan detail page')).toBeInTheDocument();
  });

  it('pre-selects the customer from ?customerId=', async () => {
    renderPage('/plans/new?customerId=3');
    await screen.findByRole('option', { name: 'Jane Doe' });
    await waitFor(() => expect(screen.getByLabelText(/^customer/i)).toHaveValue('3'));
  });

  it('keeps the customer of an existing plan selected while the list loads (edit mode)', async () => {
    // The customer is not in the list at all (e.g. archived): the label passed in is shown.
    listCustomers.mockResolvedValue(makePage([makeListItem({ id: 9, name: 'Someone Else' })]));
    renderWithProviders(
      <PlanForm
        defaultValues={{ ...defaultPlanValues(makeProfile(), '3'), name: 'Existing' }}
        submitLabel="Save"
        lockCustomer
        customerName="Jane Doe"
        onSubmit={vi.fn()}
      />,
    );
    await screen.findByRole('option', { name: /Someone Else/ });
    const select = screen.getByLabelText(/^customer/i);
    expect(select).toHaveValue('3');
    expect(screen.getByRole('option', { name: 'Jane Doe' })).toBeInTheDocument();
    expect(select).toBeDisabled();
  });

  it('puts a server validation error on the matching field', async () => {
    createPlan.mockRejectedValue({
      ...apiError(422, 'Unprocessable'),
      response: {
        status: 422,
        data: { detail: [{ loc: ['body', 'name'], msg: 'name already used', type: 'value_error' }] },
      },
      isAxiosError: true,
    });
    const user = userEvent.setup();
    renderPage('/plans/new?customerId=3');

    await screen.findByRole('option', { name: 'Jane Doe' });
    await user.type(screen.getByLabelText(/plan name/i), 'Dup');
    const row = screen.getByTestId('line-item-row');
    await user.type(within(row).getByLabelText(/description/i), 'x');
    await user.type(within(row).getByLabelText(/unit price/i), '1');
    await user.click(screen.getByRole('button', { name: /create plan/i }));

    expect(await screen.findByText('name already used')).toBeInTheDocument();
  });
});
