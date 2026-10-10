import { z } from 'zod';
import { todayISODate } from '../../lib/date';
import {
  BILLING_FREQUENCIES,
  type BillingPlan,
  type BillingPlanCreate,
  type BillingPlanUpdate,
  type BusinessProfile,
} from '../../types';
import { lineItemsSchema, taxRateSchema, toLineItemInputs, EMPTY_LINE_ITEM } from '../billing/lineItems';

/** Limits mirror backend/app/schemas/billing_plan.py. */
export const PLAN_LIMITS = { name: 200, description: 2000, maxInterval: 24, maxDueDays: 365 } as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const planFormSchema = z
  .object({
    customerId: z.string().min(1, 'Select a customer'),
    name: z
      .string()
      .trim()
      .min(1, 'Plan name is required')
      .max(PLAN_LIMITS.name, `At most ${PLAN_LIMITS.name} characters`),
    description: z
      .string()
      .trim()
      .max(PLAN_LIMITS.description, `At most ${PLAN_LIMITS.description} characters`),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code, e.g. USD'),
    frequency: z.enum(BILLING_FREQUENCIES),
    intervalCount: z
      .string()
      .trim()
      .regex(/^\d+$/, 'Enter a whole number')
      .refine(
        (value) => Number(value) >= 1 && Number(value) <= PLAN_LIMITS.maxInterval,
        `Between 1 and ${PLAN_LIMITS.maxInterval}`,
      ),
    startDate: z.string().regex(ISO_DATE, 'Pick a start date'),
    endDate: z.string().refine((value) => value === '' || ISO_DATE.test(value), 'Invalid date'),
    dueDays: z
      .string()
      .trim()
      .regex(/^\d+$/, 'Enter a whole number')
      .refine((value) => Number(value) <= PLAN_LIMITS.maxDueDays, `At most ${PLAN_LIMITS.maxDueDays}`),
    taxRate: taxRateSchema,
    autoSend: z.boolean(),
    lineItems: lineItemsSchema,
  })
  .superRefine((values, ctx) => {
    if (values.endDate && values.startDate && values.endDate < values.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be on or after the start date',
      });
    }
  });

export type PlanFormValues = z.infer<typeof planFormSchema>;

export type PlanFormField = keyof PlanFormValues;

export const PLAN_FORM_FIELDS: readonly PlanFormField[] = [
  'customerId',
  'name',
  'description',
  'currency',
  'frequency',
  'intervalCount',
  'startDate',
  'endDate',
  'dueDays',
  'taxRate',
  'autoSend',
  'lineItems',
];

/** Defaults for a new plan: the business profile's currency, due days and tax rate. */
export function defaultPlanValues(
  profile: BusinessProfile | null | undefined,
  customerId = '',
): PlanFormValues {
  return {
    customerId,
    name: '',
    description: '',
    currency: profile?.defaultCurrency ?? 'USD',
    frequency: 'monthly',
    intervalCount: '1',
    startDate: todayISODate(),
    endDate: '',
    dueDays: String(profile?.defaultDueDays ?? 14),
    taxRate: profile?.defaultTaxRate ?? '0',
    autoSend: true,
    lineItems: [{ ...EMPTY_LINE_ITEM }],
  };
}

/** Form values for editing an existing plan. */
export function planToFormValues(plan: BillingPlan): PlanFormValues {
  return {
    customerId: String(plan.customerId),
    name: plan.name,
    description: plan.description ?? '',
    currency: plan.currency,
    frequency: plan.frequency,
    intervalCount: String(plan.intervalCount),
    startDate: plan.startDate,
    endDate: plan.endDate ?? '',
    dueDays: String(plan.dueDays),
    taxRate: plan.taxRate,
    autoSend: plan.autoSend,
    lineItems: plan.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}

export function toPlanCreate(values: PlanFormValues): BillingPlanCreate {
  return {
    customerId: Number(values.customerId),
    name: values.name.trim(),
    description: values.description.trim() || null,
    currency: values.currency.trim().toUpperCase(),
    frequency: values.frequency,
    intervalCount: Number(values.intervalCount),
    startDate: values.startDate,
    endDate: values.endDate || null,
    dueDays: Number(values.dueDays),
    taxRate: values.taxRate.trim(),
    autoSend: values.autoSend,
    lineItems: toLineItemInputs(values.lineItems),
  };
}

/**
 * Update payload. The customer cannot change, and the start date is only sent when it changed
 * (the server only allows changing it while the plan has no bills).
 */
export function toPlanUpdate(values: PlanFormValues, original: BillingPlan): BillingPlanUpdate {
  const { customerId: _customerId, startDate, ...rest } = toPlanCreate(values);
  return startDate === original.startDate ? rest : { ...rest, startDate };
}
