import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import type { CustomerDetail, CustomerListItem, Page } from '../../../types';

const TIMESTAMPS = { createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };

export function makeListItem(overrides: Partial<CustomerListItem> = {}): CustomerListItem {
  return {
    id: 1,
    name: 'Acme Tutoring',
    email: 'billing@acme.test',
    phone: null,
    companyName: 'Acme Ltd',
    billingAddress: null,
    taxId: null,
    notes: null,
    isActive: true,
    balanceDue: '150.00',
    activePlanCount: 2,
    ...TIMESTAMPS,
    ...overrides,
  };
}

export function makePage(items: CustomerListItem[], total = items.length): Page<CustomerListItem> {
  return { items, total, page: 1, pageSize: 20 };
}

export function makeDetail(overrides: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    id: 7,
    name: 'Jane Doe',
    email: 'jane@example.test',
    phone: '+1 555 0100',
    companyName: 'Doe Gym',
    billingAddress: '1 Main St\nSpringfield',
    taxId: 'TAX-1',
    notes: null,
    isActive: true,
    balanceDue: '250.00',
    plans: [
      {
        id: 11,
        name: 'Monthly membership',
        status: 'active',
        frequency: 'monthly',
        intervalCount: 1,
        nextBillingDate: '2026-11-01',
        currency: 'USD',
        total: '100.00',
      },
    ],
    recentBills: [
      {
        id: 21,
        billNumber: 'INV-0001',
        issueDate: '2026-10-01',
        dueDate: '2026-10-15',
        total: '250.00',
        amountPaid: '0.00',
        status: 'sent',
        currency: 'USD',
      },
    ],
    recentPayments: [
      {
        id: 31,
        billId: 20,
        amount: '100.00',
        currency: 'USD',
        method: 'bank_transfer',
        status: 'succeeded',
        paidAt: '2026-09-15T12:00:00Z',
      },
    ],
    ...TIMESTAMPS,
    ...overrides,
  };
}

/** An AxiosError shaped like a backend `{detail, code}` response. */
export function makeApiError(status: number, detail: string, code?: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = {
    data: { detail, code },
    status,
    statusText: String(status),
    headers: {},
    config,
  };
  return new AxiosError(detail, 'ERR_BAD_REQUEST', config, undefined, response);
}
