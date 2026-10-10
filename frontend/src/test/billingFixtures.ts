import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import type {
  AnalyticsSummary,
  BillDetail,
  BillListItem,
  BillingPlanDetail,
  BillingPlanListItem,
  BusinessProfile,
  Page,
  Payment,
  PublicBill,
} from '../types';

const TIMESTAMPS = { createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };

export function makePage<T>(items: T[], total = items.length): Page<T> {
  return { items, total, page: 1, pageSize: 20 };
}

/** An Axios error shaped like a FastAPI `{detail, code}` response. */
export function apiError(status: number, detail: string, code?: string): AxiosError {
  const response: AxiosResponse = {
    status,
    statusText: String(status),
    data: code ? { detail, code } : { detail },
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return new AxiosError(detail, String(status), undefined, undefined, response);
}

export function makeProfile(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    id: 1,
    businessName: 'Acme Ltd',
    logoFileId: null,
    logoUrl: null,
    address: null,
    phone: null,
    email: 'hello@acme.test',
    taxId: null,
    defaultCurrency: 'USD',
    billNumberPrefix: 'INV-',
    nextBillNumber: 1,
    defaultDueDays: 14,
    defaultTaxRate: '0.00',
    reminderDaysAfterDue: [],
    footerNote: null,
    ...TIMESTAMPS,
    ...overrides,
  };
}

export function makeBillListItem(overrides: Partial<BillListItem> = {}): BillListItem {
  return {
    id: 11,
    billNumber: 'INV-00011',
    customerId: 3,
    customerName: 'Jane Doe',
    planId: null,
    planName: null,
    issueDate: '2026-10-01',
    dueDate: '2026-10-15',
    periodStart: null,
    periodEnd: null,
    currency: 'USD',
    total: '110.00',
    amountPaid: '0.00',
    balanceDue: '110.00',
    status: 'sent',
    sentAt: '2026-10-01T10:00:00Z',
    paidAt: null,
    createdAt: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

export function makeBillDetail(overrides: Partial<BillDetail> = {}): BillDetail {
  return {
    ...makeBillListItem(),
    subtotal: '100.00',
    taxRate: '10.00',
    taxAmount: '10.00',
    paymentLinkUrl: null,
    publicUrl: 'http://localhost:5173/pay/tok_abc',
    hasPdf: true,
    updatedAt: '2026-10-01T10:00:00Z',
    lineItems: [
      {
        id: 1,
        description: 'Consulting',
        quantity: '2.00',
        unitPrice: '50.00',
        amount: '100.00',
        position: 0,
      },
    ],
    payments: [],
    emailLogs: [],
    ...overrides,
  };
}

export function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 5,
    billId: 11,
    billNumber: 'INV-00011',
    customerId: 3,
    customerName: 'Jane Doe',
    amount: '40.00',
    currency: 'USD',
    method: 'cash',
    provider: 'manual',
    providerPaymentId: null,
    status: 'succeeded',
    paidAt: '2026-10-05T09:00:00Z',
    notes: null,
    createdAt: '2026-10-05T09:00:00Z',
    ...overrides,
  };
}

export function makePublicBill(overrides: Partial<PublicBill> = {}): PublicBill {
  return {
    billNumber: 'INV-00011',
    issueDate: '2026-10-01',
    dueDate: '2026-10-15',
    periodStart: null,
    periodEnd: null,
    currency: 'USD',
    lineItems: [{ description: 'Consulting', quantity: '2.00', unitPrice: '50.00', amount: '100.00' }],
    subtotal: '100.00',
    taxRate: '10.00',
    taxAmount: '10.00',
    total: '110.00',
    amountPaid: '0.00',
    balanceDue: '110.00',
    status: 'sent',
    paymentLinkUrl: 'https://checkout.example.test/pay/abc',
    customer: { name: 'Jane Doe', companyName: null },
    business: {
      name: 'Acme Ltd',
      address: null,
      email: 'hello@acme.test',
      phone: null,
      taxId: null,
      logoUrl: null,
    },
    footerNote: 'Thanks for your business',
    ...overrides,
  };
}

export function makePlanListItem(overrides: Partial<BillingPlanListItem> = {}): BillingPlanListItem {
  return {
    id: 21,
    customerId: 3,
    customerName: 'Jane Doe',
    name: 'Website hosting',
    description: null,
    currency: 'USD',
    frequency: 'monthly',
    intervalCount: 1,
    startDate: '2026-10-01',
    endDate: null,
    nextBillingDate: '2026-11-01',
    dueDays: 14,
    taxRate: '0.00',
    autoSend: true,
    status: 'active',
    subtotal: '50.00',
    taxAmount: '0.00',
    total: '50.00',
    ...TIMESTAMPS,
    ...overrides,
  };
}

export function makePlanDetail(overrides: Partial<BillingPlanDetail> = {}): BillingPlanDetail {
  return {
    ...makePlanListItem(),
    lineItems: [
      {
        id: 1,
        position: 0,
        description: 'Hosting',
        quantity: '1.00',
        unitPrice: '50.00',
        amount: '50.00',
      },
    ],
    upcomingDates: ['2026-11-01', '2026-12-01'],
    recentBills: [],
    ...overrides,
  };
}

export function makeSummary(overrides: Partial<AnalyticsSummary> = {}): AnalyticsSummary {
  return {
    currency: 'USD',
    mrr: '845.01',
    collectedThisMonth: '37.50',
    outstanding: '1362.00',
    overdueAmount: '792.00',
    overdueCount: 7,
    activePlans: 3,
    activeCustomers: 2,
    upcomingBills: [
      {
        planId: 21,
        planName: 'Website hosting',
        customerId: 3,
        customerName: 'Jane Doe',
        nextBillingDate: '2026-10-12',
        total: '50.00',
        currency: 'USD',
      },
    ],
    excludedCurrencies: [],
    ...overrides,
  };
}
