import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { paymentService } from '../services/paymentService';
import type { ManualPaymentCreate, Page, Payment, PaymentListParams } from '../types';
import { invalidateBillData } from './useBills';

export const paymentKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
  list: (params: PaymentListParams) => [...paymentKeys.lists(), params] as const,
};

export function usePayments(params: PaymentListParams): UseQueryResult<Page<Payment>, Error> {
  return useQuery({
    queryKey: paymentKeys.list(params),
    queryFn: () => paymentService.listPayments(params),
    placeholderData: keepPreviousData,
  });
}

export interface RecordPaymentVariables {
  billId: number;
  data: ManualPaymentCreate;
}

/** Record a manual payment; refreshes the bill, payment lists, dashboard and balances. */
export function useRecordPayment(): UseMutationResult<Payment, Error, RecordPaymentVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ billId, data }: RecordPaymentVariables) =>
      paymentService.recordManualPayment(billId, data),
    onSuccess: async (_payment, { billId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentKeys.all }),
        invalidateBillData(queryClient, billId),
      ]);
    },
  });
}

/** Delete a manual payment. Variables: the payment id. */
export function useDeletePayment(): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => paymentService.deletePayment(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentKeys.all }),
        invalidateBillData(queryClient),
      ]);
    },
  });
}
