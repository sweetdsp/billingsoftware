import type {
  ManualPaymentCreate,
  Page,
  Payment,
  PaymentListParams,
} from '../types';
import { api } from './api';

/** Error codes returned by the payments API (`{detail, code}` bodies). */
export const PAYMENT_ERROR_CODES = {
  overpayment: 'overpayment',
  billNotPayable: 'bill_not_payable',
  invalidMethod: 'invalid_method',
  notFound: 'payment_not_found',
} as const;

/** `GET /payments` — paginated, newest first. `from`/`to` are inclusive dates on `paidAt`. */
async function listPayments(params: PaymentListParams = {}): Promise<Page<Payment>> {
  const query: Record<string, string | number> = {};
  if (params.customerId !== undefined) query.customerId = params.customerId;
  if (params.method !== undefined) query.method = params.method;
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.page !== undefined) query.page = params.page;
  if (params.pageSize !== undefined) query.pageSize = params.pageSize;
  const { data } = await api.get<Page<Payment>>('/payments', { params: query });
  return data;
}

/** `POST /bills/{id}/payments` → 201. 400 `overpayment` if the amount exceeds the balance. */
async function recordManualPayment(
  billId: number,
  payload: ManualPaymentCreate,
): Promise<Payment> {
  const { data } = await api.post<Payment>(`/bills/${billId}/payments`, payload);
  return data;
}

/** `DELETE /payments/{id}` → 204. Manual payments only; the bill is recalculated. */
async function deletePayment(id: number): Promise<void> {
  await api.delete(`/payments/${id}`);
}

export const paymentService = { listPayments, recordManualPayment, deletePayment };

export default paymentService;
