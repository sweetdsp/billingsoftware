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
import { api } from './api';

/** Error codes returned by the bills API (`{detail, code}` bodies). */
export const BILL_ERROR_CODES = {
  notFound: 'bill_not_found',
  notDraft: 'bill_not_draft',
  notSendable: 'bill_not_sendable',
  notRemindable: 'bill_not_remindable',
  hasPayments: 'bill_has_payments',
  cancelled: 'bill_cancelled',
  profileRequired: 'profile_required',
  customerArchived: 'customer_archived',
} as const;

/** `GET /bills` — paginated, filter by status, customer and issue date. */
async function listBills(params: BillListParams = {}): Promise<Page<BillListItem>> {
  const query: Record<string, string | number> = {};
  if (params.status !== undefined) query.status = params.status;
  if (params.customerId !== undefined) query.customerId = params.customerId;
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.page !== undefined) query.page = params.page;
  if (params.pageSize !== undefined) query.pageSize = params.pageSize;
  const { data } = await api.get<Page<BillListItem>>('/bills', { params: query });
  return data;
}

/** `GET /bills/{id}` — bill, lines, payments and email history. */
async function getBill(id: number): Promise<BillDetail> {
  const { data } = await api.get<BillDetail>(`/bills/${id}`);
  return data;
}

/** `POST /bills` → 201 (a draft one-off bill; totals are computed by the server). */
async function createBill(payload: BillCreate): Promise<Bill> {
  const { data } = await api.post<Bill>('/bills', payload);
  return data;
}

/** `PUT /bills/{id}` — draft bills only. */
async function updateBill(id: number, payload: BillUpdate): Promise<Bill> {
  const { data } = await api.put<Bill>(`/bills/${id}`, payload);
  return data;
}

/** `POST /bills/{id}/send` — (re)send to the customer. An email failure is logged, not thrown. */
async function sendBill(id: number): Promise<Bill> {
  const { data } = await api.post<Bill>(`/bills/${id}/send`);
  return data;
}

/** `POST /bills/{id}/remind` — payment reminder for sent / partially paid / overdue bills. */
async function remindBill(id: number): Promise<Bill> {
  const { data } = await api.post<Bill>(`/bills/${id}/remind`);
  return data;
}

/** `POST /bills/{id}/cancel` — 409 `bill_has_payments` if any payment exists. */
async function cancelBill(id: number): Promise<Bill> {
  const { data } = await api.post<Bill>(`/bills/${id}/cancel`);
  return data;
}

/** `GET /bills/{id}/pdf` as a Blob (needs the bearer token, so it cannot be a plain link). */
async function downloadPdf(id: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/bills/${id}/pdf`, { responseType: 'blob' });
  return data;
}

/** `GET /public/bills/{publicToken}` — no auth; 404 for unknown tokens and unsent drafts. */
async function getPublicBill(publicToken: string): Promise<PublicBill> {
  const { data } = await api.get<PublicBill>(`/public/bills/${encodeURIComponent(publicToken)}`);
  return data;
}

export const billService = {
  listBills,
  getBill,
  createBill,
  updateBill,
  sendBill,
  remindBill,
  cancelBill,
  downloadPdf,
  getPublicBill,
};

export default billService;
