import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { customerService } from '../services/customerService';
import type {
  Customer,
  CustomerCreate,
  CustomerDetail,
  CustomerListItem,
  CustomerListParams,
  CustomerUpdate,
  Page,
} from '../types';

/** Centralized React Query keys for customers. Invalidate `customerKeys.all` to refresh everything. */
export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (params: CustomerListParams) => [...customerKeys.lists(), params] as const,
  details: () => [...customerKeys.all, 'detail'] as const,
  detail: (id: number) => [...customerKeys.details(), id] as const,
};

/** The `:id` route param as a positive integer, or `undefined` when missing/invalid. */
export function useCustomerIdParam(): number | undefined {
  const { id } = useParams<{ id: string }>();
  if (!id || !/^\d+$/.test(id)) return undefined;
  const parsed = Number(id);
  return parsed > 0 ? parsed : undefined;
}

/** Paginated customer list. Keeps the previous page visible while the next one loads. */
export function useCustomers(
  params: CustomerListParams,
): UseQueryResult<Page<CustomerListItem>, Error> {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => customerService.listCustomers(params),
    placeholderData: keepPreviousData,
  });
}

/** Customer detail. Disabled until `id` is a positive integer. */
export function useCustomer(id: number | undefined): UseQueryResult<CustomerDetail, Error> {
  const enabled = id !== undefined && Number.isInteger(id) && id > 0;
  return useQuery({
    queryKey: customerKeys.detail(id ?? 0),
    queryFn: () => customerService.getCustomer(id ?? 0),
    enabled,
  });
}

export function useCreateCustomer(): UseMutationResult<Customer, Error, CustomerCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomerCreate) => customerService.createCustomer(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
  });
}

export interface UpdateCustomerVariables {
  id: number;
  data: CustomerUpdate;
}

export function useUpdateCustomer(): UseMutationResult<Customer, Error, UpdateCustomerVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: UpdateCustomerVariables) => customerService.updateCustomer(id, data),
    onSuccess: async (_customer, { id }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: customerKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) }),
      ]);
    },
  });
}

/** Archive (soft delete). Variables: the customer id. */
export function useArchiveCustomer(): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customerService.archiveCustomer(id),
    onSuccess: async (_result, id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: customerKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) }),
      ]);
    },
  });
}
