import type { CurrencyCode } from '../types';

export interface CurrencyOption {
  code: CurrencyCode;
  label: string;
}

/** Common ISO-4217 currencies offered in selects. Any other 3-letter code is still accepted. */
export const COMMON_CURRENCIES: readonly CurrencyOption[] = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'JPY', label: 'Japanese Yen' },
  { code: 'CNY', label: 'Chinese Yuan' },
  { code: 'CHF', label: 'Swiss Franc' },
  { code: 'NZD', label: 'New Zealand Dollar' },
  { code: 'HKD', label: 'Hong Kong Dollar' },
  { code: 'SEK', label: 'Swedish Krona' },
  { code: 'NOK', label: 'Norwegian Krone' },
  { code: 'DKK', label: 'Danish Krone' },
  { code: 'ZAR', label: 'South African Rand' },
  { code: 'BRL', label: 'Brazilian Real' },
  { code: 'MXN', label: 'Mexican Peso' },
  { code: 'SAR', label: 'Saudi Riyal' },
  { code: 'MYR', label: 'Malaysian Ringgit' },
  { code: 'PHP', label: 'Philippine Peso' },
];

/** ISO-4217 shape accepted by the backend: exactly 3 uppercase letters. */
export const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

export function isCommonCurrency(code: string): boolean {
  return COMMON_CURRENCIES.some((c) => c.code === code);
}

export function currencyLabel(code: string): string {
  const match = COMMON_CURRENCIES.find((c) => c.code === code);
  return match ? `${match.code} — ${match.label}` : code;
}
