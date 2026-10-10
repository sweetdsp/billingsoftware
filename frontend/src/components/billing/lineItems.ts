import { z } from 'zod';
import type { LineItemInput } from '../../types';

/** Limits mirror backend/app/schemas/bill.py and billing_plan.py. */
export const LINE_ITEM_LIMITS = { description: 500, maxItems: 50, maxTaxRate: 100 } as const;

const DECIMAL_2DP = /^\d+(\.\d{1,2})?$/;
const NUMBER_MESSAGE = 'Enter a number with at most 2 decimals';

export const lineItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(LINE_ITEM_LIMITS.description, `At most ${LINE_ITEM_LIMITS.description} characters`),
  quantity: z
    .string()
    .trim()
    .regex(DECIMAL_2DP, NUMBER_MESSAGE)
    .refine((value) => Number(value) > 0, 'Must be greater than 0'),
  unitPrice: z.string().trim().regex(DECIMAL_2DP, NUMBER_MESSAGE),
});

export const lineItemsSchema = z
  .array(lineItemSchema)
  .min(1, 'Add at least one line item')
  .max(LINE_ITEM_LIMITS.maxItems, `At most ${LINE_ITEM_LIMITS.maxItems} line items`);

/** A tax percentage as text, e.g. "18" or "7.5" (0–100, up to 2 decimals). */
export const taxRateSchema = z
  .string()
  .trim()
  .regex(DECIMAL_2DP, NUMBER_MESSAGE)
  .refine((value) => Number(value) <= LINE_ITEM_LIMITS.maxTaxRate, 'Must be 100 or less');

export type LineItemFormValue = z.infer<typeof lineItemSchema>;

/** The slice of any form that the line items editor reads and writes. */
export interface LineItemsFormValues {
  lineItems: LineItemFormValue[];
  taxRate: string;
}

export const EMPTY_LINE_ITEM: LineItemFormValue = { description: '', quantity: '1', unitPrice: '' };

export function toLineItemInputs(items: LineItemFormValue[]): LineItemInput[] {
  return items.map((item) => ({
    description: item.description.trim(),
    quantity: item.quantity.trim(),
    unitPrice: item.unitPrice.trim(),
  }));
}
