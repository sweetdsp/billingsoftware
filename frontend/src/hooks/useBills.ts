import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { billService } from '../services/billService';
import type {
  Bill,
  BillCreate,
  BillDetail,
  BillListItem,
  BillListParams,
  BillUpdate,
  Page,
  PublicBill,
} from '../types';
import { analyticsKeys } from './useAnalytics';
import { customerKeys } from './useCustomers';

export const billKeys = {
  all: ['bills'] as const,
  lists: () => [...billKeys.all, 'list'] as const,
  list: (params: BillListParams) => [...billKeys.lists(), params] as const,
  details: () => [...billKeys.all, 'detail'] as const,
  detail: (id: number) => [...billKeys.details(), id] as const,
  public: (token: string) => [...billKeys.all, 'public', token] as const,
};

/** Refresh everything a bill change can affect (lists, detail, dashboard, customer balances). */
export async function invalidateBillData(queryClient: QueryClient, id?: number): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: billKeys.lists() }),
    id !== undefined
      ? queryClient.invalidateQueries({ queryKey: billKeys.detail(id) })
      : queryClient.invalidateQueries({ queryKey: billKeys.details() }),
    queryClient.invalidateQueries({ queryKey: analyticsKeys.all }),
    queryClient.invalidateQueries({ queryKey: customerKeys.all }),
  ]);
}

export function useBills(params: BillListParams): UseQueryResult<Page<BillListItem>, Error> {
  return useQuery({
    queryKey: billKeys.list(params),
    queryFn: () => billService.listBills(params),
    placeholderData: keepPreviousData,
  });
}

export function useBill(id: number | undefined): UseQueryResult<BillDetail, Error> {
  return useQuery({
    queryKey: billKeys.detail(id ?? 0),
    queryFn: () => billService.getBill(id ?? 0),
    enabled: id !== undefined,
  });
}

/** The customer-facing bill. Not retried on 404 (an unknown token will not appear later). */
export function usePublicBill(token: string | undefined): UseQueryResult<PublicBill, Error> {
  return useQuery({
    queryKey: billKeys.public(token ?? ''),
    queryFn: () => billService.getPublicBill(token ?? ''),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useCreateBill(): UseMutationResult<Bill, Error, BillCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BillCreate) => billService.createBill(payload),
    onSuccess: () => invalidateBillData(queryClient),
  });
}

export interface UpdateBillVariables {
  id: number;
  data: BillUpdate;
}

export function useUpdateBill(): UseMutationResult<Bill, Error, UpdateBillVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: UpdateBillVariables) => billService.updateBill(id, data),
    onSuccess: (_bill, { id }) => invalidateBillData(queryClient, id),
  });
}

export type BillAction = 'send' | 'remind' | 'cancel';

export interface BillActionVariables {
  id: number;
  action: BillAction;
}

/** Send, remind or cancel a bill. */
export function useBillAction(): UseMutationResult<Bill, Error, BillActionVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: BillActionVariables) => {
      if (action === 'send') return billService.sendBill(id);
      if (action === 'remind') return billService.remindBill(id);
      return billService.cancelBill(id);
    },
    onSuccess: (_bill, { id }) => invalidateBillData(queryClient, id),
  });
}
