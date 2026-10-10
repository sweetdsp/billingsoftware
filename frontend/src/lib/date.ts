import type { ISODate, ISODateTime } from '../types';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse an API date. `YYYY-MM-DD` values are parsed as LOCAL calendar dates so they never shift
 * by a day due to timezone conversion; datetimes (ISO-8601 with `Z`) are parsed as instants.
 */
export function parseApiDate(value: ISODate | ISODateTime): Date {
  const match = DATE_ONLY.exec(value);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(value);
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

/** e.g. "Oct 10, 2026". Returns "—" for empty or invalid input. */
export function formatDate(
  value: ISODate | ISODateTime | null | undefined,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
  locale?: string,
): string {
  if (!value) return '—';
  const date = parseApiDate(value);
  if (!isValidDate(date)) return '—';
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** e.g. "Oct 10, 2026, 6:00 AM" in the viewer's local timezone. */
export function formatDateTime(value: ISODateTime | null | undefined, locale?: string): string {
  return formatDate(
    value,
    { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
    locale,
  );
}

/** Today's local date as `YYYY-MM-DD` (for date inputs and API filters). */
export function todayISODate(): ISODate {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
