import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import { applyServerError } from '../../lib/formErrors';
import { BILLING_FREQUENCIES } from '../../types';
import { CurrencySelect } from '../billing/CurrencySelect';
import { CustomerSelect } from '../billing/CustomerSelect';
import { LineItemsEditor } from '../billing/LineItemsEditor';
import { GlassCard } from '../ui/GlassCard';
import { GradientButton } from '../ui/GradientButton';
import {
  PLAN_FORM_FIELDS,
  PLAN_LIMITS,
  planFormSchema,
  type PlanFormValues,
} from './planSchema';

const FREQUENCY_LABELS = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
} as const;

export interface PlanFormProps {
  defaultValues: PlanFormValues;
  submitLabel: string;
  /** The customer of an existing plan cannot be changed. */
  lockCustomer?: boolean;
  /** Name of the plan's customer, shown while the customer list loads (edit only). */
  customerName?: string;
  /** Persist the values; reject with the API error to have it shown on the form. */
  onSubmit: (values: PlanFormValues) => Promise<unknown>;
  onCancel?: () => void;
}

/** Shared create/edit form for billing plans (react-hook-form + zod, mirrors backend limits). */
export function PlanForm({
  defaultValues,
  submitLabel,
  lockCustomer = false,
  customerName,
  onSubmit,
  onCancel,
}: PlanFormProps) {
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
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

  const submit = async (values: PlanFormValues) => {
    try {
      await onSubmit(values);
    } catch (err) {
      applyServerError(err, setError, PLAN_FORM_FIELDS);
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
              Plan details
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
              <CustomerSelect isDisabled={lockCustomer} selectedLabel={customerName} />
              <FormControl isRequired isInvalid={Boolean(errors.name)}>
                <FormLabel htmlFor="plan-name">Plan name</FormLabel>
                <Input
                  id="plan-name"
                  maxLength={PLAN_LIMITS.name}
                  placeholder="e.g. Website hosting"
                  {...register('name')}
                />
                <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
              </FormControl>
            </SimpleGrid>
            <FormControl isInvalid={Boolean(errors.description)}>
              <FormLabel htmlFor="plan-description">Description</FormLabel>
              <Textarea
                id="plan-description"
                rows={2}
                maxLength={PLAN_LIMITS.description}
                {...register('description')}
              />
              <FormErrorMessage>{errors.description?.message}</FormErrorMessage>
            </FormControl>
          </Stack>
        </GlassCard>

        <GlassCard hoverLift={false}>
          <Stack spacing={5}>
            <Heading as="h2" size="md">
              Schedule
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
              <FormControl isRequired isInvalid={Boolean(errors.frequency)}>
                <FormLabel htmlFor="plan-frequency">Frequency</FormLabel>
                <Select id="plan-frequency" {...register('frequency')}>
                  {BILLING_FREQUENCIES.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {FREQUENCY_LABELS[frequency]}
                    </option>
                  ))}
                </Select>
                <FormErrorMessage>{errors.frequency?.message}</FormErrorMessage>
              </FormControl>
              <FormControl isRequired isInvalid={Boolean(errors.intervalCount)}>
                <FormLabel htmlFor="plan-interval">Repeat every</FormLabel>
                <Input
                  id="plan-interval"
                  inputMode="numeric"
                  {...register('intervalCount')}
                />
                <FormHelperText>
                  1 = every period, 2 = every other period, and so on.
                </FormHelperText>
                <FormErrorMessage>{errors.intervalCount?.message}</FormErrorMessage>
              </FormControl>
              <FormControl isRequired isInvalid={Boolean(errors.startDate)}>
                <FormLabel htmlFor="plan-start">First billing date</FormLabel>
                <Input id="plan-start" type="date" {...register('startDate')} />
                <FormErrorMessage>{errors.startDate?.message}</FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={Boolean(errors.endDate)}>
                <FormLabel htmlFor="plan-end">End date (optional)</FormLabel>
                <Input id="plan-end" type="date" {...register('endDate')} />
                <FormErrorMessage>{errors.endDate?.message}</FormErrorMessage>
              </FormControl>
              <FormControl isRequired isInvalid={Boolean(errors.dueDays)}>
                <FormLabel htmlFor="plan-due-days">Payment due after (days)</FormLabel>
                <Input id="plan-due-days" inputMode="numeric" {...register('dueDays')} />
                <FormErrorMessage>{errors.dueDays?.message}</FormErrorMessage>
              </FormControl>
              <FormControl>
                <FormLabel htmlFor="plan-auto-send">Delivery</FormLabel>
                <Checkbox id="plan-auto-send" {...register('autoSend')}>
                  Email each bill automatically
                </Checkbox>
                <FormHelperText>
                  When off, bills are created as drafts for you to review and send.
                </FormHelperText>
              </FormControl>
            </SimpleGrid>
          </Stack>
        </GlassCard>

        <GlassCard hoverLift={false}>
          <Stack spacing={5}>
            <Heading as="h2" size="md">
              Pricing
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
              <CurrencySelect />
              <FormControl isRequired isInvalid={Boolean(errors.taxRate)}>
                <FormLabel htmlFor="plan-tax">Tax rate (%)</FormLabel>
                <Input id="plan-tax" inputMode="decimal" {...register('taxRate')} />
                <FormErrorMessage>{errors.taxRate?.message}</FormErrorMessage>
              </FormControl>
            </SimpleGrid>
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

export default PlanForm;
