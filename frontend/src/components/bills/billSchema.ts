import { z } from 'zod';
import { addDaysISO, todayISODate } from '../../lib/date';
import type { BillCreate, BillDetail, BillUpdate, BusinessProfile } from '../../types';
import {
  EMPTY_LINE_ITEM,
  lineItemsSchema,
  taxRateSchema,
  toLineItemInputs,
} from '../billing/lineItems';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const billFormSchema = z
  .object({
    customerId: z.string().min(1, 'Select a customer'),
    issueDate: z.string().regex(ISO_DATE, 'Pick an issue date'),
    dueDate: z.string().regex(ISO_DATE, 'Pick a due date'),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code, e.g. USD'),
    taxRate: taxRateSchema,
    lineItems: lineItemsSchema,
  })
  .superRefine((values, ctx) => {
    if (values.issueDate && values.dueDate && values.dueDate < values.issueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDate'],
        message: 'Due date must be on or after the issue date',
      });
    }
  });

export type BillFormValues = z.infer<typeof billFormSchema>;

export const BILL_FORM_FIELDS = [
  'customerId',
  'issueDate',
  'dueDate',
  'currency',
  'taxRate',
  'lineItems',
] as const;

/** Defaults for a new one-off bill, from the business profile. */
export function defaultBillValues(
  profile: BusinessProfile | null | undefined,
  customerId = '',
): BillFormValues {
  const today = todayISODate();
  return {
    customerId,
    issueDate: today,
    dueDate: addDaysISO(today, profile?.defaultDueDays ?? 14),
    currency: profile?.defaultCurrency ?? 'USD',
    taxRate: profile?.defaultTaxRate ?? '0',
    lineItems: [{ ...EMPTY_LINE_ITEM }],
  };
}

export function billToFormValues(bill: BillDetail): BillFormValues {
  return {
    customerId: String(bill.customerId),
    issueDate: bill.issueDate,
    dueDate: bill.dueDate,
    currency: bill.currency,
    taxRate: bill.taxRate,
    lineItems: bill.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}

export function toBillCreate(values: BillFormValues): BillCreate {
  return {
    customerId: Number(values.customerId),
    issueDate: values.issueDate,
    dueDate: values.dueDate,
    currency: values.currency.trim().toUpperCase(),
    taxRate: values.taxRate.trim(),
    lineItems: toLineItemInputs(values.lineItems),
  };
}

export function toBillUpdate(values: BillFormValues): BillUpdate {
  return toBillCreate(values);
}
