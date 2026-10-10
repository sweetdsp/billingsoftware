import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { planService } from '../services/planService';
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
import { analyticsKeys } from './useAnalytics';
import { billKeys } from './useBills';
import { customerKeys } from './useCustomers';

export const planKeys = {
  all: ['plans'] as const,
  lists: () => [...planKeys.all, 'list'] as const,
  list: (params: BillingPlanListParams) => [...planKeys.lists(), params] as const,
  details: () => [...planKeys.all, 'detail'] as const,
  detail: (id: number) => [...planKeys.details(), id] as const,
};

/** Refresh everything a plan change can affect (lists, detail, dashboard, customer rows). */
async function invalidatePlanData(queryClient: QueryClient, id?: number): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: planKeys.lists() }),
    id !== undefined
      ? queryClient.invalidateQueries({ queryKey: planKeys.detail(id) })
      : queryClient.invalidateQueries({ queryKey: planKeys.details() }),
    queryClient.invalidateQueries({ queryKey: analyticsKeys.all }),
    queryClient.invalidateQueries({ queryKey: customerKeys.all }),
  ]);
}

export function usePlans(
  params: BillingPlanListParams,
): UseQueryResult<Page<BillingPlanListItem>, Error> {
  return useQuery({
    queryKey: planKeys.list(params),
    queryFn: () => planService.listPlans(params),
    placeholderData: keepPreviousData,
  });
}

export function usePlan(id: number | undefined): UseQueryResult<BillingPlanDetail, Error> {
  return useQuery({
    queryKey: planKeys.detail(id ?? 0),
    queryFn: () => planService.getPlan(id ?? 0),
    enabled: id !== undefined,
  });
}

export function useCreatePlan(): UseMutationResult<BillingPlan, Error, BillingPlanCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BillingPlanCreate) => planService.createPlan(payload),
    onSuccess: () => invalidatePlanData(queryClient),
  });
}

export interface UpdatePlanVariables {
  id: number;
  data: BillingPlanUpdate;
}

export function useUpdatePlan(): UseMutationResult<BillingPlan, Error, UpdatePlanVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: UpdatePlanVariables) => planService.updatePlan(id, data),
    onSuccess: (_plan, { id }) => invalidatePlanData(queryClient, id),
  });
}

export type PlanAction = 'pause' | 'resume' | 'cancel';

export interface PlanActionVariables {
  id: number;
  action: PlanAction;
}

/** Pause, resume or cancel a plan. */
export function usePlanAction(): UseMutationResult<BillingPlan, Error, PlanActionVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: PlanActionVariables) => {
      if (action === 'pause') return planService.pausePlan(id);
      if (action === 'resume') return planService.resumePlan(id);
      return planService.cancelPlan(id);
    },
    onSuccess: (_plan, { id }) => invalidatePlanData(queryClient, id),
  });
}

/** Generate the current period's draft bill now. Variables: the plan id. */
export function useGenerateNow(): UseMutationResult<GeneratedBill, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => planService.generateNow(id),
    onSuccess: async (_bill, id) => {
      await Promise.all([
        invalidatePlanData(queryClient, id),
        queryClient.invalidateQueries({ queryKey: billKeys.all }),
      ]);
    },
  });
}
