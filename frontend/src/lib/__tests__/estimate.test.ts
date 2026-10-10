import { describe, expect, it } from 'vitest';
import { estimateTotals, fromHundredths, toHundredths } from '../estimate';

describe('toHundredths / fromHundredths', () => {
  it('parses non-negative decimals with up to 2 places exactly', () => {
    expect(toHundredths('12')).toBe(1200);
    expect(toHundredths('12.5')).toBe(1250);
    expect(toHundredths('0.07')).toBe(7);
    expect(toHundredths(' 3.10 ')).toBe(310);
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'abc', '-1', '1.234', '1,5', '1e3', '.5', '5.']) {
      expect(toHundredths(bad)).toBeNull();
    }
  });

  it('formats back to 2 decimals', () => {
    expect(fromHundredths(0)).toBe('0.00');
    expect(fromHundredths(7)).toBe('0.07');
    expect(fromHundredths(1250)).toBe('12.50');
  });
});

describe('estimateTotals (mirrors the backend billing engine)', () => {
  it('matches the backend example: 25.55 subtotal + 10% tax = 28.11', () => {
    const totals = estimateTotals(
      [
        { quantity: '2', unitPrice: '10.00' },
        { quantity: '1', unitPrice: '5.55' },
      ],
      '10',
    );
    expect(totals.subtotal).toBe('25.55');
    expect(totals.taxAmount).toBe('2.56'); // 2.555 rounds half up, not to even
    expect(totals.total).toBe('28.11');
  });

  it('rounds each line half up (1.5 x 33.33 = 49.995 -> 50.00)', () => {
    const totals = estimateTotals([{ quantity: '1.5', unitPrice: '33.33' }], '0');
    expect(totals.lines[0]?.amount).toBe('50.00');
    expect(totals.total).toBe('50.00');
  });

  it('avoids float drift (0.1 + 0.2 style sums stay exact)', () => {
    const totals = estimateTotals(
      [
        { quantity: '1', unitPrice: '0.10' },
        { quantity: '1', unitPrice: '0.20' },
      ],
      '0',
    );
    expect(totals.subtotal).toBe('0.30');
  });

  it('skips rows that are not valid yet and treats a bad tax rate as 0', () => {
    const totals = estimateTotals(
      [
        { quantity: '2', unitPrice: '' },
        { quantity: '1', unitPrice: '40' },
      ],
      'abc',
    );
    expect(totals.lines[0]?.amount).toBeNull();
    expect(totals.subtotal).toBe('40.00');
    expect(totals.taxAmount).toBe('0.00');
    expect(totals.total).toBe('40.00');
  });

  it('is zero for an empty list', () => {
    expect(estimateTotals([], '18').total).toBe('0.00');
  });
});
