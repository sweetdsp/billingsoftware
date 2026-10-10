import { z } from 'zod';
import { CURRENCY_CODE_RE } from '../../lib/currencies';
import type { BusinessProfile, BusinessProfileInput } from '../../types';

/**
 * Client-side mirror of backend `BusinessProfileIn` (backend/app/schemas/business_profile.py).
 * The backend remains the source of truth; these limits only give early feedback.
 */
export const BUSINESS_NAME_MAX = 200;
export const ADDRESS_MAX = 2000;
export const PHONE_MAX = 50;
export const TAX_ID_MAX = 64;
export const FOOTER_NOTE_MAX = 1000;
export const BILL_PREFIX_MAX = 20;
export const BILL_PREFIX_RE = /^[A-Za-z0-9\-_/]*$/;
export const DUE_DAYS_MIN = 0;
export const DUE_DAYS_MAX = 365;
export const TAX_RATE_RE = /^\d{1,3}(\.\d{1,2})?$/;
export const REMINDER_DAY_MIN = 1;
export const REMINDER_DAY_MAX = 365;
export const MAX_REMINDER_DAYS = 10;
export const BILL_NUMBER_PAD = 5;

const optionalText = (max: number) =>
  z.string().trim().max(max, `Must be at most ${max} characters`);

export const businessProfileSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, 'Business name is required')
    .max(BUSINESS_NAME_MAX, `Must be at most ${BUSINESS_NAME_MAX} characters`),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address'),
  phone: optionalText(PHONE_MAX),
  address: optionalText(ADDRESS_MAX),
  taxId: optionalText(TAX_ID_MAX),
  footerNote: optionalText(FOOTER_NOTE_MAX),
  defaultCurrency: z
    .string()
    .trim()
    .regex(CURRENCY_CODE_RE, 'Use a 3-letter uppercase ISO code, e.g. USD'),
  billNumberPrefix: z
    .string()
    .max(BILL_PREFIX_MAX, `Must be at most ${BILL_PREFIX_MAX} characters`)
    .regex(BILL_PREFIX_RE, "Only letters, digits, '-', '_' and '/' are allowed"),
  defaultDueDays: z
    .number({ invalid_type_error: 'Enter a number of days' })
    .int('Use whole days')
    .min(DUE_DAYS_MIN, `Must be between ${DUE_DAYS_MIN} and ${DUE_DAYS_MAX}`)
    .max(DUE_DAYS_MAX, `Must be between ${DUE_DAYS_MIN} and ${DUE_DAYS_MAX}`),
  defaultTaxRate: z
    .string()
    .trim()
    .regex(TAX_RATE_RE, 'Enter a percentage with up to 2 decimals, e.g. 5 or 5.25')
    .refine((v) => Number(v) <= 100, 'Tax rate cannot exceed 100%'),
  reminderDaysAfterDue: z
    .array(z.number().int().min(REMINDER_DAY_MIN).max(REMINDER_DAY_MAX))
    .max(MAX_REMINDER_DAYS, `At most ${MAX_REMINDER_DAYS} reminder days`)
    .refine((days) => new Set(days).size === days.length, 'Reminder days must be unique'),
});

export type BusinessProfileFormValues = z.infer<typeof businessProfileSchema>;

export const DEFAULT_PROFILE_FORM_VALUES: BusinessProfileFormValues = {
  businessName: '',
  email: '',
  phone: '',
  address: '',
  taxId: '',
  footerNote: '',
  defaultCurrency: 'USD',
  billNumberPrefix: 'BM-',
  defaultDueDays: 7,
  defaultTaxRate: '0.00',
  reminderDaysAfterDue: [1, 7, 14],
};

/** Form values for an existing profile (or the backend defaults before onboarding). */
export function toFormValues(profile: BusinessProfile | null | undefined): BusinessProfileFormValues {
  if (!profile) return { ...DEFAULT_PROFILE_FORM_VALUES };
  return {
    businessName: profile.businessName,
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    address: profile.address ?? '',
    taxId: profile.taxId ?? '',
    footerNote: profile.footerNote ?? '',
    defaultCurrency: profile.defaultCurrency,
    billNumberPrefix: profile.billNumberPrefix,
    defaultDueDays: profile.defaultDueDays,
    defaultTaxRate: profile.defaultTaxRate,
    reminderDaysAfterDue: [...profile.reminderDaysAfterDue].sort((a, b) => a - b),
  };
}

const blankToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** `PUT /business-profile` body from form values. `logoFileId` must be passed explicitly (upsert replaces it). */
export function toProfileInput(
  values: BusinessProfileFormValues,
  logoFileId: number | null,
): BusinessProfileInput {
  return {
    businessName: values.businessName.trim(),
    email: blankToNull(values.email),
    phone: blankToNull(values.phone),
    address: blankToNull(values.address),
    taxId: blankToNull(values.taxId),
    footerNote: blankToNull(values.footerNote),
    defaultCurrency: values.defaultCurrency.trim().toUpperCase(),
    billNumberPrefix: values.billNumberPrefix,
    defaultDueDays: values.defaultDueDays,
    defaultTaxRate: Number(values.defaultTaxRate).toFixed(2),
    reminderDaysAfterDue: [...values.reminderDaysAfterDue].sort((a, b) => a - b),
    logoFileId,
  };
}

/** Full upsert body that keeps every stored value of an existing profile. */
export function profileToInput(profile: BusinessProfile): BusinessProfileInput {
  return toProfileInput(toFormValues(profile), profile.logoFileId);
}

/** e.g. ("BM-", 1) → "BM-00001". */
export function formatBillNumber(prefix: string, nextBillNumber: number): string {
  return `${prefix}${String(nextBillNumber).padStart(BILL_NUMBER_PAD, '0')}`;
}
