import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  GridItem,
  Input,
  SimpleGrid,
  Stack,
  Textarea,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { useForm } from 'react-hook-form';
import { getErrorCode, getErrorMessage, getErrorStatus } from '../../services/api';
import { CUSTOMER_ERROR_CODES } from '../../services/customerService';
import { GlassCard } from '../ui/GlassCard';
import { GradientButton } from '../ui/GradientButton';
import {
  CUSTOMER_LIMITS,
  EMPTY_CUSTOMER_FORM,
  customerFormSchema,
  isCustomerFormField,
  type CustomerFormValues,
} from './customerSchema';

export interface CustomerFormProps {
  /** Initial values (edit). Defaults to an empty form (create). */
  defaultValues?: CustomerFormValues;
  submitLabel: string;
  /**
   * Persist the values. Reject with the API error to have it mapped onto the form:
   * 409 `customer_email_exists` → inline email error, 422 → per-field errors, else a form alert.
   */
  onSubmit: (values: CustomerFormValues) => Promise<unknown>;
  onCancel?: () => void;
}

export const EMAIL_EXISTS_MESSAGE = 'A customer with this email already exists.';

/** 422 `loc` → form field, e.g. ["body", "companyName"] → "companyName". */
function validationErrors(err: unknown): Array<{ field: string; message: string }> {
  if (!axios.isAxiosError(err) || err.response?.status !== 422) return [];
  const data: unknown = err.response.data;
  if (typeof data !== 'object' || data === null || !('detail' in data)) return [];
  const detail: unknown = data.detail;
  if (!Array.isArray(detail)) return [];
  const result: Array<{ field: string; message: string }> = [];
  for (const item of detail as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const loc: unknown = 'loc' in item ? item.loc : undefined;
    const msg: unknown = 'msg' in item ? item.msg : undefined;
    if (!Array.isArray(loc) || typeof msg !== 'string') continue;
    const field: unknown = loc[loc.length - 1];
    if (typeof field === 'string') result.push({ field, message: msg });
  }
  return result;
}

/** Shared create/edit form for customers (react-hook-form + zod, mirrors backend limits). */
export function CustomerForm({
  defaultValues = EMPTY_CUSTOMER_FORM,
  submitLabel,
  onSubmit,
  onCancel,
}: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues,
  });

  const submit = async (values: CustomerFormValues) => {
    try {
      await onSubmit(values);
    } catch (err) {
      if (getErrorCode(err) === CUSTOMER_ERROR_CODES.emailExists) {
        setError('email', { type: 'server', message: EMAIL_EXISTS_MESSAGE }, { shouldFocus: true });
        return;
      }
      const fieldErrors = validationErrors(err).filter((e) => isCustomerFormField(e.field));
      if (getErrorStatus(err) === 422 && fieldErrors.length > 0) {
        fieldErrors.forEach(({ field, message }, index) => {
          if (isCustomerFormField(field)) {
            setError(field, { type: 'server', message }, { shouldFocus: index === 0 });
          }
        });
        return;
      }
      setError('root.server', { type: 'server', message: getErrorMessage(err) });
    }
  };

  return (
    <GlassCard hoverLift={false}>
      <Stack as="form" spacing={6} onSubmit={handleSubmit(submit)} noValidate>
        {errors.root?.server?.message && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <AlertDescription>{errors.root.server.message}</AlertDescription>
          </Alert>
        )}

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
          <FormControl isRequired isInvalid={Boolean(errors.name)}>
            <FormLabel htmlFor="customer-name">Name</FormLabel>
            <Input
              id="customer-name"
              autoComplete="name"
              maxLength={CUSTOMER_LIMITS.name}
              {...register('name')}
            />
            <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
          </FormControl>

          <FormControl isRequired isInvalid={Boolean(errors.email)}>
            <FormLabel htmlFor="customer-email">Email</FormLabel>
            <Input id="customer-email" type="email" autoComplete="email" {...register('email')} />
            {errors.email ? (
              <FormErrorMessage>{errors.email.message}</FormErrorMessage>
            ) : (
              <FormHelperText>Bills are delivered to this address.</FormHelperText>
            )}
          </FormControl>

          <FormControl isInvalid={Boolean(errors.companyName)}>
            <FormLabel htmlFor="customer-company">Company</FormLabel>
            <Input
              id="customer-company"
              autoComplete="organization"
              maxLength={CUSTOMER_LIMITS.companyName}
              {...register('companyName')}
            />
            <FormErrorMessage>{errors.companyName?.message}</FormErrorMessage>
          </FormControl>

          <FormControl isInvalid={Boolean(errors.phone)}>
            <FormLabel htmlFor="customer-phone">Phone</FormLabel>
            <Input
              id="customer-phone"
              type="tel"
              autoComplete="tel"
              maxLength={CUSTOMER_LIMITS.phone}
              {...register('phone')}
            />
            <FormErrorMessage>{errors.phone?.message}</FormErrorMessage>
          </FormControl>

          <FormControl isInvalid={Boolean(errors.taxId)}>
            <FormLabel htmlFor="customer-tax-id">Tax ID</FormLabel>
            <Input id="customer-tax-id" maxLength={CUSTOMER_LIMITS.taxId} {...register('taxId')} />
            <FormErrorMessage>{errors.taxId?.message}</FormErrorMessage>
          </FormControl>

          <GridItem colSpan={{ base: 1, md: 2 }}>
            <FormControl isInvalid={Boolean(errors.billingAddress)}>
              <FormLabel htmlFor="customer-address">Billing address</FormLabel>
              <Textarea
                id="customer-address"
                rows={3}
                autoComplete="street-address"
                maxLength={CUSTOMER_LIMITS.billingAddress}
                {...register('billingAddress')}
              />
              <FormErrorMessage>{errors.billingAddress?.message}</FormErrorMessage>
            </FormControl>
          </GridItem>

          <GridItem colSpan={{ base: 1, md: 2 }}>
            <FormControl isInvalid={Boolean(errors.notes)}>
              <FormLabel htmlFor="customer-notes">Notes</FormLabel>
              <Textarea
                id="customer-notes"
                rows={4}
                maxLength={CUSTOMER_LIMITS.notes}
                {...register('notes')}
              />
              <FormErrorMessage>{errors.notes?.message}</FormErrorMessage>
            </FormControl>
          </GridItem>
        </SimpleGrid>

        <Flex justify="flex-end" gap={3} wrap="wrap">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} isDisabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <GradientButton type="submit" isLoading={isSubmitting} loadingText="Saving…">
            {submitLabel}
          </GradientButton>
        </Flex>
      </Stack>
    </GlassCard>
  );
}

export default CustomerForm;
