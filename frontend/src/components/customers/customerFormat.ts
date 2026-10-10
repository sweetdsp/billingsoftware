import { formatMoney } from '../../lib/money';
import type {
  BillingFrequency,
  CurrencyCode,
  CustomerDetail,
  Money,
  PaymentMethod,
  PaymentStatus,
} from '../../types';

const plainAmountFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a money string without a currency symbol (2 dp). Display only. */
export function formatPlainAmount(amount: Money | null | undefined): string {
  if (amount === null || amount === undefined || amount.trim() === '') return '—';
  const value = Number(amount);
  return Number.isFinite(value) ? plainAmountFormatter.format(value) : amount;
}

/**
 * `balanceDue` has no currency: the backend sums outstanding bills across currencies.
 * Format with `currency` when it is known to be the only one, otherwise as a plain number.
 */
export function formatBalanceDue(amount: Money, currency: CurrencyCode | null): string {
  return currency ? formatMoney(amount, currency) : formatPlainAmount(amount);
}

/** Tooltip/help text shown wherever a currency-less balance is displayed. */
export const MIXED_CURRENCY_HINT =
  'Balance due is the sum of unpaid bills. If bills use different currencies, the amounts are summed without conversion.';

/**
 * The single currency used by this customer's plans and recent bills, or `null` when there are
 * none or more than one (the balance can then not be labelled with one currency).
 */
export function inferCustomerCurrency(customer: CustomerDetail): CurrencyCode | null {
  const currencies = new Set<CurrencyCode>();
  customer.plans.forEach((plan) => currencies.add(plan.currency));
  customer.recentBills.forEach((bill) => currencies.add(bill.currency));
  if (currencies.size !== 1) return null;
  const [only] = Array.from(currencies);
  return only ?? null;
}

const FREQUENCY_UNIT: Record<BillingFrequency, { one: string; many: string; adverb: string }> = {
  weekly: { one: 'week', many: 'weeks', adverb: 'Weekly' },
  monthly: { one: 'month', many: 'months', adverb: 'Monthly' },
  quarterly: { one: 'quarter', many: 'quarters', adverb: 'Quarterly' },
  yearly: { one: 'year', many: 'years', adverb: 'Yearly' },
};

/** e.g. "Monthly", "Every 2 weeks". */
export function formatFrequency(frequency: BillingFrequency, intervalCount: number): string {
  const unit = FREQUENCY_UNIT[frequency];
  return intervalCount <= 1 ? unit.adverb : `Every ${intervalCount} ${unit.many}`;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  online: 'Online',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  other: 'Other',
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, { colorScheme: string; label: string }> = {
  succeeded: { colorScheme: 'green', label: 'Succeeded' },
  failed: { colorScheme: 'red', label: 'Failed' },
  refunded: { colorScheme: 'gray', label: 'Refunded' },
};
