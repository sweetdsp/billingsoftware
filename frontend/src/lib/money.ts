import type { CurrencyCode, Money } from '../types';

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: CurrencyCode, locale?: string): Intl.NumberFormat {
  const key = `${locale ?? 'default'}|${currency}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
  } catch {
    // Unknown/invalid currency code: fall back to a plain 2-decimal number.
    formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  formatterCache.set(key, formatter);
  return formatter;
}

/**
 * Format a server-provided money string for DISPLAY only.
 *
 * Money is a decimal string ("1250.00"). The numeric conversion here is used exclusively for
 * rendering; never use it for arithmetic that is sent to or persisted by the server.
 * All totals are computed server-side.
 */
export function formatMoney(
  amount: Money | null | undefined,
  currency: CurrencyCode,
  locale?: string,
): string {
  if (amount === null || amount === undefined || amount.trim() === '') return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return getFormatter(currency, locale).format(value);
}

/** True when a money string represents zero (e.g. "0", "0.00"). Display helper only. */
export function isZeroMoney(amount: Money | null | undefined): boolean {
  if (amount === null || amount === undefined) return true;
  return /^-?0*(\.0*)?$/.test(amount.trim());
}
