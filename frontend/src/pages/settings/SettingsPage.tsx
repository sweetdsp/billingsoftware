import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useToast,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { FormProvider, useForm, type FieldErrors } from 'react-hook-form';
import { BillingDefaultsForm } from '../../components/settings/BillingDefaultsForm';
import { BusinessProfileForm } from '../../components/settings/BusinessProfileForm';
import {
  businessProfileSchema,
  formatBillNumber,
  profileToInput,
  toFormValues,
  toProfileInput,
  type BusinessProfileFormValues,
} from '../../components/settings/businessProfileSchema';
import { LogoUploader } from '../../components/settings/LogoUploader';
import { ReminderScheduleForm } from '../../components/settings/ReminderScheduleForm';
import { EmptyState } from '../../components/ui/EmptyState';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { useBusinessProfile, useUpsertBusinessProfile } from '../../hooks/useBusinessProfile';
import { useDeleteUpload } from '../../hooks/useUploads';
import { getErrorMessage } from '../../services/api';
import type { BusinessProfile, UploadedFile } from '../../types';

type FieldName = keyof BusinessProfileFormValues;

const TAB_BUSINESS = 0;
const TAB_BRANDING = 1;
const TAB_BILLING = 2;
const TAB_REMINDERS = 3;

const FIELD_TABS: Record<FieldName, number> = {
  businessName: TAB_BUSINESS,
  email: TAB_BUSINESS,
  phone: TAB_BUSINESS,
  address: TAB_BUSINESS,
  taxId: TAB_BUSINESS,
  footerNote: TAB_BUSINESS,
  defaultCurrency: TAB_BILLING,
  billNumberPrefix: TAB_BILLING,
  defaultDueDays: TAB_BILLING,
  defaultTaxRate: TAB_BILLING,
  reminderDaysAfterDue: TAB_REMINDERS,
};

function tabsWithErrors(errors: FieldErrors<BusinessProfileFormValues>): Set<number> {
  const tabs = new Set<number>();
  (Object.keys(FIELD_TABS) as FieldName[]).forEach((field) => {
    if (errors[field]) tabs.add(FIELD_TABS[field]);
  });
  return tabs;
}

interface SettingsFormProps {
  profile: BusinessProfile | null;
}

function SettingsForm({ profile }: SettingsFormProps) {
  const toast = useToast();
  const upsert = useUpsertBusinessProfile();
  const deleteUpload = useDeleteUpload();
  const [tabIndex, setTabIndex] = useState<number>(TAB_BUSINESS);

  const form = useForm<BusinessProfileFormValues>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: toFormValues(profile),
    mode: 'onTouched',
  });
  const {
    handleSubmit,
    reset,
    formState: { isDirty, errors },
  } = form;

  // Keep the form in sync with server data without clobbering fields the user is editing.
  useEffect(() => {
    reset(toFormValues(profile), { keepDirtyValues: true });
  }, [profile, reset]);

  // Warn before leaving the page with unsaved edits.
  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const errorTabs = tabsWithErrors(errors);
  const prefix = form.watch('billNumberPrefix');
  const nextBillNumber = profile?.nextBillNumber ?? 1;

  const onSubmit = async (values: BusinessProfileFormValues): Promise<void> => {
    try {
      const saved = await upsert.mutateAsync(toProfileInput(values, profile?.logoFileId ?? null));
      reset(toFormValues(saved));
      toast({ status: 'success', title: 'Settings saved' });
    } catch (err: unknown) {
      toast({
        status: 'error',
        title: 'Could not save settings',
        description: getErrorMessage(err),
      });
    }
  };

  const onInvalid = (invalid: FieldErrors<BusinessProfileFormValues>): void => {
    const tabs = [...tabsWithErrors(invalid)].sort((a, b) => a - b);
    const first = tabs[0];
    if (first !== undefined && !tabs.includes(tabIndex)) setTabIndex(first);
  };

  const handleLogoUploaded = async (file: UploadedFile): Promise<void> => {
    if (!profile) return;
    const previousId = profile.logoFileId;
    await upsert.mutateAsync({ ...profileToInput(profile), logoFileId: file.id });
    toast({ status: 'success', title: 'Logo updated' });
    if (previousId !== null && previousId !== file.id) {
      // Best effort: the old logo file is no longer referenced.
      deleteUpload.mutate(previousId);
    }
  };

  const handleLogoRemove = async (): Promise<void> => {
    if (!profile || profile.logoFileId === null) return;
    await deleteUpload.mutateAsync(profile.logoFileId);
    toast({ status: 'success', title: 'Logo removed' });
  };

  const tabLabel = (label: string, index: number) => (
    <HStack as="span" spacing={2}>
      <Text as="span">{label}</Text>
      {errorTabs.has(index) && (
        <Box as="span" boxSize={2} borderRadius="full" bg="red.400" role="img" aria-label="has errors" />
      )}
    </HStack>
  );

  return (
    <FormProvider {...form}>
      <Box as="form" noValidate onSubmit={handleSubmit(onSubmit, onInvalid)} aria-label="Settings">
        {!profile && (
          <Alert status="info" borderRadius="md" mb={6}>
            <AlertIcon />
            <AlertDescription>
              You haven&apos;t set up your business profile yet. Fill in your business name and
              save to get started.
            </AlertDescription>
          </Alert>
        )}

        <GlassCard hoverLift={false}>
          <Tabs index={tabIndex} onChange={setTabIndex} colorScheme="purple" variant="soft-rounded">
            <TabList flexWrap="wrap" gap={2}>
              <Tab>{tabLabel('Business', TAB_BUSINESS)}</Tab>
              <Tab>{tabLabel('Branding', TAB_BRANDING)}</Tab>
              <Tab>{tabLabel('Billing defaults', TAB_BILLING)}</Tab>
              <Tab>{tabLabel('Reminders', TAB_REMINDERS)}</Tab>
            </TabList>
            <TabPanels mt={4}>
              <TabPanel px={0}>
                <BusinessProfileForm />
              </TabPanel>
              <TabPanel px={0}>
                {profile ? (
                  <LogoUploader
                    logoFileId={profile.logoFileId}
                    onUploaded={handleLogoUploaded}
                    onRemove={handleLogoRemove}
                    isBusy={upsert.isPending || deleteUpload.isPending}
                  />
                ) : (
                  <Text color="text-muted">Save your business details first to add a logo.</Text>
                )}
                <Text fontSize="sm" color="text-muted" mt={4}>
                  Logo changes are saved immediately and appear on your bills.
                </Text>
              </TabPanel>
              <TabPanel px={0}>
                <BillingDefaultsForm nextBillNumber={nextBillNumber} />
              </TabPanel>
              <TabPanel px={0}>
                <ReminderScheduleForm />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </GlassCard>

        <Flex
          mt={6}
          gap={3}
          align={{ base: 'stretch', sm: 'center' }}
          justify="space-between"
          direction={{ base: 'column', sm: 'row' }}
        >
          <HStack spacing={3}>
            <Text color="text-muted" fontSize="sm">
              Next bill:
            </Text>
            <Badge colorScheme="purple" fontFamily="mono" data-testid="settings-next-bill">
              {formatBillNumber(prefix, nextBillNumber)}
            </Badge>
            {isDirty && <Badge colorScheme="orange">Unsaved changes</Badge>}
          </HStack>
          <HStack spacing={3} justify="flex-end">
            <Button
              variant="ghost"
              onClick={() => reset(toFormValues(profile))}
              isDisabled={!isDirty || upsert.isPending}
            >
              Discard
            </Button>
            <GradientButton
              type="submit"
              isDisabled={!isDirty}
              isLoading={upsert.isPending}
              loadingText="Saving…"
            >
              Save changes
            </GradientButton>
          </HStack>
        </Flex>
      </Box>
    </FormProvider>
  );
}

/** Business profile, logo, billing defaults and reminder schedule. */
export default function SettingsPage() {
  const { data: profile, isLoading, isError, error, refetch } = useBusinessProfile();

  return (
    <PageWrapper title="Settings" subtitle="Your business details, branding and billing defaults">
      {isLoading && <LoadingState label="Loading your settings…" />}
      {isError && (
        <EmptyState
          title="Couldn't load your settings"
          description={getErrorMessage(error)}
          action={<Button onClick={() => void refetch()}>Try again</Button>}
        />
      )}
      {!isLoading && !isError && profile !== undefined && <SettingsForm profile={profile} />}
    </PageWrapper>
  );
}
