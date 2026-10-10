import type {
  BillingPlan,
  BillingPlanCreate,
  BillingPlanDetail,
  BillingPlanListItem,
  BillingPlanListParams,
  BillingPlanUpdate,
  GeneratedBill,
  Page,
} from '../types';
import { api } from './api';

/** Error codes returned by the billing plans API (`{detail, code}` bodies). */
export const PLAN_ERROR_CODES = {
  notFound: 'plan_not_found',
  notActive: 'plan_not_active',
  alreadyGenerated: 'already_generated',
  ended: 'plan_ended',
  profileRequired: 'profile_required',
} as const;

/** `GET /billing-plans` — paginated, filter by customer and status. */
async function listPlans(params: BillingPlanListParams = {}): Promise<Page<BillingPlanListItem>> {
  const query: Record<string, string | number> = {};
  if (params.customerId !== undefined) query.customerId = params.customerId;
  if (params.status !== undefined) query.status = params.status;
  if (params.page !== undefined) query.page = params.page;
  if (params.pageSize !== undefined) query.pageSize = params.pageSize;
  const { data } = await api.get<Page<BillingPlanListItem>>('/billing-plans', { params: query });
  return data;
}

/** `GET /billing-plans/{id}` — plan, line items, next billing dates and recent bills. */
async function getPlan(id: number): Promise<BillingPlanDetail> {
  const { data } = await api.get<BillingPlanDetail>(`/billing-plans/${id}`);
  return data;
}

/** `POST /billing-plans` → 201. */
async function createPlan(payload: BillingPlanCreate): Promise<BillingPlan> {
  const { data } = await api.post<BillingPlan>('/billing-plans', payload);
  return data;
}

/** `PUT /billing-plans/{id}` — partial; applies to future bills only. */
async function updatePlan(id: number, payload: BillingPlanUpdate): Promise<BillingPlan> {
  const { data } = await api.put<BillingPlan>(`/billing-plans/${id}`, payload);
  return data;
}

async function pausePlan(id: number): Promise<BillingPlan> {
  const { data } = await api.post<BillingPlan>(`/billing-plans/${id}/pause`);
  return data;
}

async function resumePlan(id: number): Promise<BillingPlan> {
  const { data } = await api.post<BillingPlan>(`/billing-plans/${id}/resume`);
  return data;
}

async function cancelPlan(id: number): Promise<BillingPlan> {
  const { data } = await api.post<BillingPlan>(`/billing-plans/${id}/cancel`);
  return data;
}

/** `POST /billing-plans/{id}/generate-now` → 201. Creates the current period's draft bill. */
async function generateNow(id: number): Promise<GeneratedBill> {
  const { data } = await api.post<GeneratedBill>(`/billing-plans/${id}/generate-now`);
  return data;
}

export const planService = {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  pausePlan,
  resumePlan,
  cancelPlan,
  generateNow,
};

export default planService;
