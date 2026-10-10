import type { DecimalString, Money } from '../types';

/**
 * DISPLAY-ONLY totals preview for forms. The server recomputes everything when saving and its
 * numbers are the only ones ever persisted or shown on saved bills.
 *
 * Uses exact integer arithmetic (cents / hundredths), never floats for the money math, and the
 * same rounding as the backend (`ROUND_HALF_UP` to 2 dp, tax on the subtotal).
 */

const DECIMAL_2DP = /^\d+(\.\d{1,2})?$/;

export interface EstimateLine {
  quantity: DecimalString;
  unitPrice: Money;
}

export interface EstimatedLine {
  /** `null` when the row is not a valid number yet. */
  amount: Money | null;
}

export interface EstimatedTotals {
  lines: EstimatedLine[];
  subtotal: Money;
  taxAmount: Money;
  total: Money;
}

/** "12.5" → 1250 (hundredths). `null` if the text is not a non-negative number with ≤ 2 dp. */
export function toHundredths(value: string): number | null {
  const text = value.trim();
  if (!DECIMAL_2DP.test(text)) return null;
  const [whole = '0', fraction = ''] = text.split('.');
  const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(hundredths) ? hundredths : null;
}

/** 1250 → "12.50". */
export function fromHundredths(value: number): Money {
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** Round `numerator / denominator` half up (non-negative integers). */
function divideHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

/**
 * Preview of `amount = qty × price` per line, the subtotal, tax and total.
 * Rows that are not valid numbers yet are skipped (their `amount` is `null`).
 * An invalid `taxRate` is treated as 0.
 */
export function estimateTotals(lines: EstimateLine[], taxRate: DecimalString): EstimatedTotals {
  let subtotal = 0;
  const estimated: EstimatedLine[] = lines.map((line) => {
    const quantity = toHundredths(line.quantity);
    const price = toHundredths(line.unitPrice);
    if (quantity === null || price === null) return { amount: null };
    const amount = divideHalfUp(quantity * price, 100);
    subtotal += amount;
    return { amount: fromHundredths(amount) };
  });
  const rate = toHundredths(taxRate) ?? 0;
  const tax = divideHalfUp(subtotal * rate, 10000);
  return {
    lines: estimated,
    subtotal: fromHundredths(subtotal),
    taxAmount: fromHundredths(tax),
    total: fromHundredths(subtotal + tax),
  };
}
