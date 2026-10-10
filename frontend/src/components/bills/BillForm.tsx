import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Heading,
  Input,
  SimpleGrid,
  Stack,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import { applyServerError } from '../../lib/formErrors';
import { CurrencySelect } from '../billing/CurrencySelect';
import { CustomerSelect } from '../billing/CustomerSelect';
import { LineItemsEditor } from '../billing/LineItemsEditor';
import { GlassCard } from '../ui/GlassCard';
import { GradientButton } from '../ui/GradientButton';
import { BILL_FORM_FIELDS, billFormSchema, type BillFormValues } from './billSchema';

export interface BillFormProps {
  defaultValues: BillFormValues;
  submitLabel: string;
  /** Name of the bill's customer, shown while the customer list loads (edit only). */
  customerName?: string;
  /** Persist the values; reject with the API error to have it shown on the form. */
  onSubmit: (values: BillFormValues) => Promise<unknown>;
  onCancel?: () => void;
}

/** Shared create/edit form for one-off (draft) bills. Totals are computed by the server. */
export function BillForm({
  defaultValues,
  submitLabel,
  customerName,
  onSubmit,
  onCancel,
}: BillFormProps) {
  const form = useForm<BillFormValues>({
    resolver: zodResolver(billFormSchema),
    defaultValues,
  });
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = form;
  const currency = watch('currency');

  const submit = async (values: BillFormValues) => {
    try {
      await onSubmit(values);
    } catch (err) {
      applyServerError(err, setError, BILL_FORM_FIELDS);
    }
  };

  return (
    <FormProvider {...form}>
      <Stack as="form" spacing={6} onSubmit={handleSubmit(submit)} noValidate>
        {errors.root?.server?.message && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <AlertDescription>{errors.root.server.message}</AlertDescription>
          </Alert>
        )}

        <GlassCard hoverLift={false}>
          <Stack spacing={5}>
            <Heading as="h2" size="md">
              Bill details
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
              <CustomerSelect selectedLabel={customerName} />
              <CurrencySelect />
              <FormControl isRequired isInvalid={Boolean(errors.issueDate)}>
                <FormLabel htmlFor="bill-issue">Issue date</FormLabel>
                <Input id="bill-issue" type="date" {...register('issueDate')} />
                <FormErrorMessage>{errors.issueDate?.message}</FormErrorMessage>
              </FormControl>
              <FormControl isRequired isInvalid={Boolean(errors.dueDate)}>
                <FormLabel htmlFor="bill-due">Due date</FormLabel>
                <Input id="bill-due" type="date" {...register('dueDate')} />
                <FormErrorMessage>{errors.dueDate?.message}</FormErrorMessage>
              </FormControl>
              <FormControl isRequired isInvalid={Boolean(errors.taxRate)}>
                <FormLabel htmlFor="bill-tax">Tax rate (%)</FormLabel>
                <Input id="bill-tax" inputMode="decimal" {...register('taxRate')} />
                <FormErrorMessage>{errors.taxRate?.message}</FormErrorMessage>
              </FormControl>
            </SimpleGrid>
          </Stack>
        </GlassCard>

        <GlassCard hoverLift={false}>
          <Stack spacing={5}>
            <Heading as="h2" size="md">
              Line items
            </Heading>
            <LineItemsEditor currency={currency || 'USD'} />
          </Stack>
        </GlassCard>

        <Flex gap={3} justify="flex-end" wrap="wrap">
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
    </FormProvider>
  );
}

export default BillForm;
