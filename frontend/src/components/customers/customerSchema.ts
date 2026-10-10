import { z } from 'zod';
import { emailSchema } from '../../lib/validation';
import type { Customer, CustomerCreate, CustomerUpdate } from '../../types';

/** Limits mirror backend/app/schemas/customer.py. */
export const CUSTOMER_LIMITS = {
  name: 200,
  email: 320,
  phone: 50,
  companyName: 200,
  billingAddress: 1000,
  taxId: 50,
  notes: 2000,
} as const;

const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`);

export const customerFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(CUSTOMER_LIMITS.name, `Name must be at most ${CUSTOMER_LIMITS.name} characters`),
  email: emailSchema.max(
    CUSTOMER_LIMITS.email,
    `Email must be at most ${CUSTOMER_LIMITS.email} characters`,
  ),
  phone: optionalText('Phone', CUSTOMER_LIMITS.phone),
  companyName: optionalText('Company name', CUSTOMER_LIMITS.companyName),
  billingAddress: optionalText('Billing address', CUSTOMER_LIMITS.billingAddress),
  taxId: optionalText('Tax ID', CUSTOMER_LIMITS.taxId),
  notes: optionalText('Notes', CUSTOMER_LIMITS.notes),
});

/** Form values: every field is a (possibly empty) string. */
export type CustomerFormValues = z.infer<typeof customerFormSchema>;

export type CustomerFormField = keyof CustomerFormValues;

export const CUSTOMER_FORM_FIELDS: readonly CustomerFormField[] = [
  'name',
  'email',
  'phone',
  'companyName',
  'billingAddress',
  'taxId',
  'notes',
];

export const EMPTY_CUSTOMER_FORM: CustomerFormValues = {
  name: '',
  email: '',
  phone: '',
  companyName: '',
  billingAddress: '',
  taxId: '',
  notes: '',
};

export function customerToFormValues(customer: Customer): CustomerFormValues {
  return {
    name: customer.name,
    email: customer.email,
    phone: customer.phone ?? '',
    companyName: customer.companyName ?? '',
    billingAddress: customer.billingAddress ?? '',
    taxId: customer.taxId ?? '',
    notes: customer.notes ?? '',
  };
}

const emptyToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

/** Create payload: blank optional fields are omitted. */
export function toCustomerCreate(values: CustomerFormValues): CustomerCreate {
  const payload: CustomerCreate = { name: values.name.trim(), email: values.email.trim() };
  const phone = emptyToNull(values.phone);
  const companyName = emptyToNull(values.companyName);
  const billingAddress = emptyToNull(values.billingAddress);
  const taxId = emptyToNull(values.taxId);
  const notes = emptyToNull(values.notes);
  if (phone) payload.phone = phone;
  if (companyName) payload.companyName = companyName;
  if (billingAddress) payload.billingAddress = billingAddress;
  if (taxId) payload.taxId = taxId;
  if (notes) payload.notes = notes;
  return payload;
}

/** Update payload: blank optional fields are sent as `null` so they are cleared. */
export function toCustomerUpdate(values: CustomerFormValues): CustomerUpdate {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    phone: emptyToNull(values.phone),
    companyName: emptyToNull(values.companyName),
    billingAddress: emptyToNull(values.billingAddress),
    taxId: emptyToNull(values.taxId),
    notes: emptyToNull(values.notes),
  };
}

export function isCustomerFormField(value: unknown): value is CustomerFormField {
  return typeof value === 'string' && (CUSTOMER_FORM_FIELDS as readonly string[]).includes(value);
}
