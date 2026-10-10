import {
  Box,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Heading,
  Input,
  Stack,
  Step,
  StepDescription,
  StepIcon,
  StepIndicator,
  StepNumber,
  StepSeparator,
  StepStatus,
  StepTitle,
  Stepper,
  Text,
  useSteps,
  useToast,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { BillingDefaultsForm } from '../../components/settings/BillingDefaultsForm';
import { BusinessProfileForm } from '../../components/settings/BusinessProfileForm';
import {
  businessProfileSchema,
  toFormValues,
  toProfileInput,
  type BusinessProfileFormValues,
} from '../../components/settings/businessProfileSchema';
import { EmptyState } from '../../components/ui/EmptyState';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { useBusinessProfile, useUpsertBusinessProfile } from '../../hooks/useBusinessProfile';
import { getErrorMessage } from '../../services/api';
import { createFirstCustomer } from './onboardingApi';

const STEPS = [
  { title: 'Business', description: 'Your details' },
  { title: 'Customer', description: 'Who you bill' },
  { title: 'Plan', description: 'What you charge' },
] as const;

// ---------------------------------------------------------------------------
// Step 1: business profile (name, currency, prefix, due days)
// ---------------------------------------------------------------------------

interface StepProps {
  onDone: () => void;
}

function BusinessStep({ onDone }: StepProps) {
  const toast = useToast();
  const { data: profile } = useBusinessProfile();
  const upsert = useUpsertBusinessProfile();
  const form = useForm<BusinessProfileFormValues>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: toFormValues(profile),
    mode: 'onTouched',
  });

  const onSubmit = async (values: BusinessProfileFormValues): Promise<void> => {
    try {
      // Hidden fields keep the stored (or default) values, so an existing profile is not reset.
      await upsert.mutateAsync(toProfileInput(values, profile?.logoFileId ?? null));
      onDone();
    } catch (err: unknown) {
      toast({ status: 'error', title: 'Could not save your business', description: getErrorMessage(err) });
    }
  };

  return (
    <FormProvider {...form}>
      <Box as="form" noValidate onSubmit={form.handleSubmit(onSubmit)} aria-label="Business details">
        <Stack spacing={5}>
          <Box>
            <Heading as="h2" size="md">
              Tell us about your business
            </Heading>
            <Text color="text-muted" fontSize="sm">
              These appear on every bill. You can change them later in Settings.
            </Text>
          </Box>
          <BusinessProfileForm variant="minimal" />
          <BillingDefaultsForm showTaxRate={false} nextBillNumber={profile?.nextBillNumber ?? 1} />
          <Flex justify="flex-end">
            <GradientButton type="submit" isLoading={upsert.isPending} loadingText="Saving…">
              Save &amp; continue
            </GradientButton>
          </Flex>
        </Stack>
      </Box>
    </FormProvider>
  );
}

// ---------------------------------------------------------------------------
// Step 2: first customer
// ---------------------------------------------------------------------------

const customerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(200, 'Must be at most 200 characters'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  companyName: z.string().trim().max(200, 'Must be at most 200 characters'),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

interface CustomerStepProps extends StepProps {
  onBack: () => void;
}

function CustomerStep({ onDone, onBack }: CustomerStepProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', email: '', companyName: '' },
    mode: 'onTouched',
  });

  const onSubmit = async (values: CustomerFormValues): Promise<void> => {
    try {
      const customer = await createFirstCustomer({
        name: values.name,
        email: values.email,
        companyName: values.companyName === '' ? null : values.companyName,
      });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ status: 'success', title: `${customer.name} added` });
      onDone();
    } catch (err: unknown) {
      toast({ status: 'error', title: 'Could not add the customer', description: getErrorMessage(err) });
    }
  };

  return (
    <Box as="form" noValidate onSubmit={handleSubmit(onSubmit)} aria-label="First customer">
      <Stack spacing={5}>
        <Box>
          <Heading as="h2" size="md">
            Add your first customer
          </Heading>
          <Text color="text-muted" fontSize="sm">
            Bills are emailed to your customers, so an email address is required.
          </Text>
        </Box>
        <FormControl isRequired isInvalid={Boolean(errors.name)}>
          <FormLabel htmlFor="customerName">Customer name</FormLabel>
          <Input id="customerName" {...register('name')} />
          <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
        </FormControl>
        <FormControl isRequired isInvalid={Boolean(errors.email)}>
          <FormLabel htmlFor="customerEmail">Customer email</FormLabel>
          <Input id="customerEmail" type="email" {...register('email')} />
          <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
        </FormControl>
        <FormControl isInvalid={Boolean(errors.companyName)}>
          <FormLabel htmlFor="customerCompany">Company (optional)</FormLabel>
          <Input id="customerCompany" {...register('companyName')} />
          <FormErrorMessage>{errors.companyName?.message}</FormErrorMessage>
        </FormControl>
        <Flex justify="space-between" gap={3} wrap="wrap">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Flex gap={3}>
            <Button variant="outline" onClick={onDone}>
              Skip for now
            </Button>
            <GradientButton type="submit" isLoading={isSubmitting} loadingText="Adding…">
              Add customer
            </GradientButton>
          </Flex>
        </Flex>
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step 3: first plan (placeholder until the billing plans module lands)
// ---------------------------------------------------------------------------

function PlanStep({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  return (
    <Stack spacing={5} textAlign="center" align="center">
      <Heading as="h2" size="md">
        Set up your first billing plan
      </Heading>
      <Text color="text-muted" maxW="sm">
        A plan bills a customer automatically every week, month, quarter or year. You can create
        one now or come back to it from the Plans page.
      </Text>
      <GradientButton onClick={() => navigate('/plans/new')}>Create your first plan</GradientButton>
      <Flex gap={3}>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>
          Skip for now
        </Button>
      </Flex>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

function OnboardingWizard({ initialStep }: { initialStep: number }) {
  const navigate = useNavigate();
  const { activeStep, goToNext, goToPrevious } = useSteps({ index: initialStep, count: STEPS.length });

  return (
    <Stack spacing={6}>
      <Stepper index={activeStep} colorScheme="purple" size="sm">
        {STEPS.map((step) => (
          <Step key={step.title}>
            <StepIndicator>
              <StepStatus complete={<StepIcon />} incomplete={<StepNumber />} active={<StepNumber />} />
            </StepIndicator>
            <Box flexShrink={0} display={{ base: 'none', sm: 'block' }}>
              <StepTitle>{step.title}</StepTitle>
              <StepDescription>{step.description}</StepDescription>
            </Box>
            <StepSeparator />
          </Step>
        ))}
      </Stepper>

      <GlassCard hoverLift={false}>
        {activeStep === 0 && <BusinessStep onDone={goToNext} />}
        {activeStep === 1 && <CustomerStep onDone={goToNext} onBack={goToPrevious} />}
        {activeStep === 2 && <PlanStep onBack={goToPrevious} />}
      </GlassCard>

      {activeStep > 0 && (
        <Flex justify="center">
          <Button variant="link" size="sm" onClick={() => navigate('/dashboard')}>
            Skip setup and go to the dashboard
          </Button>
        </Flex>
      )}
    </Stack>
  );
}

/** Business profile, first customer and first plan. */
export default function OnboardingPage() {
  const { data: profile, isLoading, isError, error, refetch } = useBusinessProfile();

  return (
    <PageWrapper title="Welcome to Bill Maker" subtitle="Three quick steps and you're ready to bill.">
      {isLoading && <LoadingState label="Getting things ready…" />}
      {isError && (
        <EmptyState
          title="Something went wrong"
          description={getErrorMessage(error)}
          action={<Button onClick={() => void refetch()}>Try again</Button>}
        />
      )}
      {!isLoading && !isError && profile !== undefined && (
        <OnboardingWizard initialStep={profile ? 1 : 0} />
      )}
    </PageWrapper>
  );
}
