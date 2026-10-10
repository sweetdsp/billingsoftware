import {
  Box,
  Button,
  Flex,
  GridItem,
  Heading,
  HStack,
  Link,
  ListItem,
  SimpleGrid,
  Stack,
  Text,
  UnorderedList,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { ArchivedCustomerBanner } from '../../components/customers/ArchivedCustomerBanner';
import {
  CustomerBillsSection,
  CustomerPaymentsSection,
  CustomerPlansSection,
} from '../../components/customers/CustomerDetailSections';
import { CustomerLoadError } from '../../components/customers/CustomerLoadError';
import { CustomerStatusBadge } from '../../components/customers/CustomerStatusBadge';
import {
  MIXED_CURRENCY_HINT,
  formatBalanceDue,
  inferCustomerCurrency,
} from '../../components/customers/customerFormat';
import { ConfirmDialog, type ConfirmDialogAlert } from '../../components/ui/ConfirmDialog';
import { GlassCard } from '../../components/ui/GlassCard';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { StatTile } from '../../components/ui/StatTile';
import { useArchiveCustomer, useCustomer, useCustomerIdParam } from '../../hooks/useCustomers';
import { isZeroMoney } from '../../lib/money';
import { getErrorCode, getErrorMessage } from '../../services/api';
import { CUSTOMER_ERROR_CODES } from '../../services/customerService';
import type { CustomerDetail } from '../../types';

interface DetailRowProps {
  label: string;
  children: ReactNode;
}

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <Box>
      <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" color="text-muted">
        {label}
      </Text>
      <Box mt={1} whiteSpace="pre-line" wordBreak="break-word">
        {children}
      </Box>
    </Box>
  );
}

function blockingPlansAlert(customer: CustomerDetail): ConfirmDialogAlert {
  const blocking = customer.plans.filter((plan) => plan.status !== 'cancelled');
  return {
    status: 'warning',
    title: 'This customer still has billing plans',
    description: (
      <Stack spacing={2}>
        <Text>
          Customers with active or paused plans can’t be archived, because those plans would keep
          generating bills. Cancel the plans below first, then archive the customer.
        </Text>
        {blocking.length > 0 && (
          <UnorderedList pl={1}>
            {blocking.map((plan) => (
              <ListItem key={plan.id}>
                <Link as={RouterLink} to={`/plans/${plan.id}`} fontWeight="semibold">
                  {plan.name}
                </Link>{' '}
                ({plan.status})
              </ListItem>
            ))}
          </UnorderedList>
        )}
      </Stack>
    ),
  };
}

/** Customer header, balance, plans, recent bills and payments; Edit / Archive actions. */
export default function CustomerDetailPage() {
  const id = useCustomerIdParam();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: customer, isPending, error, refetch } = useCustomer(id);
  const archiveCustomer = useArchiveCustomer();
  const archiveDialog = useDisclosure();
  const [archiveAlert, setArchiveAlert] = useState<ConfirmDialogAlert | null>(null);
  const [archiveBlocked, setArchiveBlocked] = useState(false);

  if (id === undefined) {
    return (
      <PageWrapper>
        <CustomerLoadError error={null} />
      </PageWrapper>
    );
  }
  if (error && !customer) {
    return (
      <PageWrapper>
        <CustomerLoadError error={error} onRetry={() => void refetch()} />
      </PageWrapper>
    );
  }
  if (isPending || !customer) {
    return (
      <PageWrapper>
        <LoadingState label="Loading customer…" />
      </PageWrapper>
    );
  }

  const openArchive = () => {
    setArchiveAlert(null);
    setArchiveBlocked(false);
    archiveDialog.onOpen();
  };

  const confirmArchive = () => {
    archiveCustomer.mutate(id, {
      onSuccess: () => {
        archiveDialog.onClose();
        toast({ status: 'success', title: 'Customer archived', description: customer.name });
        navigate('/customers');
      },
      onError: (err) => {
        if (getErrorCode(err) === CUSTOMER_ERROR_CODES.hasActivePlans) {
          setArchiveBlocked(true);
          setArchiveAlert(blockingPlansAlert(customer));
          return;
        }
        setArchiveAlert({ status: 'error', description: getErrorMessage(err) });
      },
    });
  };

  const currency = inferCustomerCurrency(customer);
  const activePlanCount = customer.plans.filter((plan) => plan.status === 'active').length;
  const pausedPlanCount = customer.plans.filter((plan) => plan.status === 'paused').length;

  return (
    <PageWrapper>
      <Flex
        mb={6}
        gap={4}
        direction={{ base: 'column', md: 'row' }}
        align={{ base: 'flex-start', md: 'center' }}
        justify="space-between"
      >
        <Stack spacing={1} minW={0}>
          <HStack spacing={3} wrap="wrap">
            <Heading as="h1" size="lg" letterSpacing="tight" wordBreak="break-word">
              {customer.name}
            </Heading>
            <CustomerStatusBadge isActive={customer.isActive} />
          </HStack>
          {customer.companyName && <Text color="text-muted">{customer.companyName}</Text>}
        </Stack>
        <HStack spacing={3}>
          <Button as={RouterLink} to={`/customers/${id}/edit`} variant="outline">
            Edit
          </Button>
          {customer.isActive && (
            <Button colorScheme="red" variant="ghost" onClick={openArchive}>
              Archive
            </Button>
          )}
        </HStack>
      </Flex>

      {!customer.isActive && <ArchivedCustomerBanner customerId={id} />}

      <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={6} mb={6}>
        <GridItem colSpan={{ base: 1, lg: 2 }}>
          <GlassCard hoverLift={false} ariaLabel="Contact details">
            <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={5}>
              <DetailRow label="Email">
                <Link href={`mailto:${customer.email}`} color="brand-fg">
                  {customer.email}
                </Link>
              </DetailRow>
              <DetailRow label="Phone">
                {customer.phone ? (
                  <Link href={`tel:${customer.phone}`} color="brand-fg">
                    {customer.phone}
                  </Link>
                ) : (
                  <Text color="text-muted">—</Text>
                )}
              </DetailRow>
              <DetailRow label="Billing address">
                <Text color={customer.billingAddress ? undefined : 'text-muted'}>
                  {customer.billingAddress ?? '—'}
                </Text>
              </DetailRow>
              <DetailRow label="Tax ID">
                <Text color={customer.taxId ? undefined : 'text-muted'}>{customer.taxId ?? '—'}</Text>
              </DetailRow>
              {customer.notes && (
                <GridItem colSpan={{ base: 1, sm: 2 }}>
                  <DetailRow label="Notes">
                    <Text>{customer.notes}</Text>
                  </DetailRow>
                </GridItem>
              )}
            </SimpleGrid>
          </GlassCard>
        </GridItem>
        <Stack spacing={6}>
          <StatTile
            label="Balance due"
            value={formatBalanceDue(customer.balanceDue, currency)}
            helpText={currency ? 'Across unpaid bills' : MIXED_CURRENCY_HINT}
            tone={isZeroMoney(customer.balanceDue) ? 'default' : 'warning'}
          />
          <StatTile
            label="Active plans"
            value={String(activePlanCount)}
            helpText={pausedPlanCount > 0 ? `${pausedPlanCount} paused` : undefined}
          />
        </Stack>
      </SimpleGrid>

      <Stack spacing={6}>
        <CustomerPlansSection
          customerId={id}
          plans={customer.plans}
          canAddPlan={customer.isActive}
        />
        <CustomerBillsSection bills={customer.recentBills} />
        <CustomerPaymentsSection payments={customer.recentPayments} />
      </Stack>

      <ConfirmDialog
        isOpen={archiveDialog.isOpen}
        onClose={archiveDialog.onClose}
        onConfirm={confirmArchive}
        title={`Archive ${customer.name}?`}
        body="Archived customers are hidden from your customer list. Their bills and payments are kept, and you can restore them at any time."
        confirmLabel="Archive"
        isLoading={archiveCustomer.isPending}
        alert={archiveAlert}
        hideConfirm={archiveBlocked}
      />
    </PageWrapper>
  );
}
