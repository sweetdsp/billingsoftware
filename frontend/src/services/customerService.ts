import type {
  Customer,
  CustomerCreate,
  CustomerDetail,
  CustomerListItem,
  CustomerListParams,
  CustomerUpdate,
  Page,
} from '../types';
import { api } from './api';

/** Error codes returned by the customers API (`{detail, code}` bodies). */
export const CUSTOMER_ERROR_CODES = {
  emailExists: 'customer_email_exists',
  hasActivePlans: 'customer_has_active_plans',
  notFound: 'customer_not_found',
} as const;

/** `GET /customers` — paginated, searchable (name/email/company). */
async function listCustomers(params: CustomerListParams = {}): Promise<Page<CustomerListItem>> {
  const query: Record<string, string | number | boolean> = {};
  if (params.q && params.q.trim()) query.q = params.q.trim();
  if (params.active !== undefined) query.active = params.active;
  if (params.page !== undefined) query.page = params.page;
  if (params.pageSize !== undefined) query.pageSize = params.pageSize;
  const { data } = await api.get<Page<CustomerListItem>>('/customers', { params: query });
  return data;
}

/** `GET /customers/{id}` — customer + balance, plans, recent bills and payments. */
async function getCustomer(id: number): Promise<CustomerDetail> {
  const { data } = await api.get<CustomerDetail>(`/customers/${id}`);
  return data;
}

/** `POST /customers` → 201. */
async function createCustomer(payload: CustomerCreate): Promise<Customer> {
  const { data } = await api.post<Customer>('/customers', payload);
  return data;
}

/** `PUT /customers/{id}` — partial update; `isActive: true` restores an archived customer. */
async function updateCustomer(id: number, payload: CustomerUpdate): Promise<Customer> {
  const { data } = await api.put<Customer>(`/customers/${id}`, payload);
  return data;
}

/** `DELETE /customers/{id}` → 204 (archive). 409 `customer_has_active_plans`. */
async function archiveCustomer(id: number): Promise<void> {
  await api.delete(`/customers/${id}`);
}

export const customerService = {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  archiveCustomer,
};

export default customerService;
