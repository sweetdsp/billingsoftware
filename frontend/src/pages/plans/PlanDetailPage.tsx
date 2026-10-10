import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Link,
  List,
  ListItem,
  SimpleGrid,
  Stack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { TotalsSummary } from '../../components/billing/TotalsSummary';
import { formatFrequency } from '../../components/customers/customerFormat';
import { ConfirmDialog, type ConfirmDialogAlert } from '../../components/ui/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/ui/DataList';
import { GlassCard } from '../../components/ui/GlassCard';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { ResourceLoadError } from '../../components/ui/ResourceLoadError';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useIdParam } from '../../hooks/useIdParam';
import { useGenerateNow, usePlan, usePlanAction } from '../../hooks/usePlans';
import { formatDate } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import { getErrorCode, getErrorMessage } from '../../services/api';
import { PLAN_ERROR_CODES } from '../../services/planService';
import type { PlanBillSummary } from '../../types';

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" color="text-muted">
        {label}
      </Text>
      <Box mt={1}>{children}</Box>
    </Box>
  );
}

type PendingAction = 'cancel' | 'generate' | null;

/** Plan overview, line items, upcoming schedule and bills generated so far. */
export default function PlanDetailPage() {
  const id = useIdParam();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: plan, isPending, error, refetch } = usePlan(id);
  const planAction = usePlanAction();
  const generateNow = useGenerateNow();
  const dialog = useDisclosure();
  const [pending, setPending] = useState<PendingAction>(null);
  const [dialogAlert, setDialogAlert] = useState<ConfirmDialogAlert | null>(null);

  if (id === undefined || (error && !plan)) {
    return (
      <PageWrapper>
        <ResourceLoadError
          entity="plan"
          backTo="/plans"
          backLabel="Back to plans"
          error={id === undefined ? null : error}
          onRetry={() => void refetch()}
        />
      </PageWrapper>
    );
  }
  if (isPending || !plan) {
    return (
      <PageWrapper>
        <LoadingState label="Loading plan…" />
      </PageWrapper>
    );
  }

  const isCancelled = plan.status === 'cancelled';
  const openDialog = (action: Exclude<PendingAction, null>) => {
    setPending(action);
    setDialogAlert(null);
    dialog.onOpen();
  };
  const closeDialog = () => {
    dialog.onClose();
    setPending(null);
    setDialogAlert(null);
  };
  const fail = (err: unknown) =>
    setDialogAlert({ status: 'error', description: getErrorMessage(err) });

  const togglePause = () => {
    const action = plan.status === 'paused' ? 'resume' : 'pause';
    planAction.mutate(
      { id: plan.id, action },
      {
        onSuccess: () =>
          toast({ status: 'success', title: action === 'pause' ? 'Plan paused' : 'Plan resumed' }),
        onError: (err) => toast({ status: 'error', title: getErrorMessage(err) }),
      },
    );
  };

  const confirm = () => {
    if (pending === 'cancel') {
      planAction.mutate(
        { id: plan.id, action: 'cancel' },
        {
          onSuccess: () => {
            toast({ status: 'success', title: 'Plan cancelled' });
            closeDialog();
          },
          onError: fail,
        },
      );
    } else if (pending === 'generate') {
      generateNow.mutate(plan.id, {
        onSuccess: (bill) => {
          toast({
            status: 'success',
            title: 'Bill created',
            description: `${bill.billNumber} was added as a draft.`,
          });
          closeDialog();
          navigate(`/bills/${bill.billId}`);
        },
        onError: (err) => {
          const code = getErrorCode(err);
          const friendly =
            code === PLAN_ERROR_CODES.alreadyGenerated
              ? 'A bill for this period has already been generated.'
              : getErrorMessage(err);
          setDialogAlert({ status: 'error', description: friendly });
        },
      });
    }
  };

  const billColumns: DataColumn<PlanBillSummary>[] = [
    {
      key: 'number',
      header: 'Bill',
      render: (bill) => <Text fontWeight="semibold">{bill.billNumber}</Text>,
    },
    { key: 'period', header: 'Period', render: (bill) => formatDate(bill.periodStart) },
    { key: 'due', header: 'Due', render: (bill) => formatDate(bill.dueDate) },
    {
      key: 'total',
      header: 'Total',
      isNumeric: true,
      render: (bill) => formatMoney(bill.total, bill.currency),
    },
    { key: 'status', header: 'Status', render: (bill) => <StatusBadge status={bill.status} /> },
  ];

  return (
    <PageWrapper
      title={plan.name}
      subtitle={`For ${plan.customerName}`}
      actions={
        <>
          {!isCancelled && (
            <>
              <Button variant="outline" onClick={() => navigate(`/plans/${plan.id}/edit`)}>
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={togglePause}
                isLoading={planAction.isPending && planAction.variables?.action !== 'cancel'}
              >
                {plan.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
              <Button variant="outline" colorScheme="red" onClick={() => openDialog('cancel')}>
                Cancel plan
              </Button>
            </>
          )}
        </>
      }
    >
      <Stack spacing={6}>
        <GlassCard hoverLift={false}>
          <Flex justify="space-between" align="center" mb={5} wrap="wrap" gap={3}>
            <Heading as="h2" size="md">
              Overview
            </Heading>
            <StatusBadge status={plan.status} />
          </Flex>
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={5}>
            <DetailRow label="Customer">
              <Link as={RouterLink} to={`/customers/${plan.customerId}`} fontWeight="semibold">
                {plan.customerName}
              </Link>
            </DetailRow>
            <DetailRow label="Schedule">{formatFrequency(plan.frequency, plan.intervalCount)}</DetailRow>
            <DetailRow label="Next bill">
              {isCancelled ? '—' : formatDate(plan.nextBillingDate)}
            </DetailRow>
            <DetailRow label="Payment due">{plan.dueDays} days after issue</DetailRow>
            <DetailRow label="Started">{formatDate(plan.startDate)}</DetailRow>
            <DetailRow label="Ends">{plan.endDate ? formatDate(plan.endDate) : 'No end date'}</DetailRow>
            <DetailRow label="Delivery">
              {plan.autoSend ? 'Emailed automatically' : 'Created as drafts'}
            </DetailRow>
            <DetailRow label="Currency">{plan.currency}</DetailRow>
          </SimpleGrid>
          {plan.description && (
            <Box mt={5}>
              <DetailRow label="Description">
                <Text whiteSpace="pre-line">{plan.description}</Text>
              </DetailRow>
            </Box>
          )}
          {plan.status === 'active' && (
            <Box mt={5}>
              <Button size="sm" variant="outline" onClick={() => openDialog('generate')}>
                Generate this period's bill now
              </Button>
            </Box>
          )}
        </GlassCard>

        <GlassCard hoverLift={false}>
          <Heading as="h2" size="md" mb={4}>
            Line items
          </Heading>
          <TableContainer>
            <Table size="sm" aria-label="Plan line items">
              <Thead>
                <Tr>
                  <Th>Description</Th>
                  <Th isNumeric>Qty</Th>
                  <Th isNumeric>Unit price</Th>
                  <Th isNumeric>Amount</Th>
                </Tr>
              </Thead>
              <Tbody>
                {plan.lineItems.map((item) => (
                  <Tr key={item.id}>
                    <Td whiteSpace="normal">{item.description}</Td>
                    <Td isNumeric>{item.quantity}</Td>
                    <Td isNumeric>{formatMoney(item.unitPrice, plan.currency)}</Td>
                    <Td isNumeric>{formatMoney(item.amount, plan.currency)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
          <Box mt={5}>
            <TotalsSummary
              currency={plan.currency}
              subtotal={plan.subtotal}
              taxRate={plan.taxRate}
              taxAmount={plan.taxAmount}
              total={plan.total}
            />
          </Box>
        </GlassCard>

        <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={6}>
          <GlassCard hoverLift={false}>
            <Heading as="h2" size="md" mb={4}>
              Upcoming bills
            </Heading>
            {plan.upcomingDates.length === 0 ? (
              <Text color="text-muted">
                {isCancelled ? 'This plan is cancelled.' : 'No more bills are scheduled.'}
              </Text>
            ) : (
              <List spacing={2}>
                {plan.upcomingDates.map((date) => (
                  <ListItem key={date}>
                    <HStack justify="space-between">
                      <Text>{formatDate(date)}</Text>
                      <Text color="text-muted">{formatMoney(plan.total, plan.currency)}</Text>
                    </HStack>
                  </ListItem>
                ))}
              </List>
            )}
            {plan.status === 'paused' && (
              <Text mt={3} fontSize="sm" color="text-muted">
                Paused: no bills are generated until you resume.
              </Text>
            )}
          </GlassCard>

          <Box gridColumn={{ lg: 'span 2' }}>
            <Heading as="h2" size="md" mb={4}>
              Bills from this plan
            </Heading>
            {plan.recentBills.length === 0 ? (
              <GlassCard hoverLift={false}>
                <Text color="text-muted">No bills have been generated yet.</Text>
              </GlassCard>
            ) : (
              <DataList
                caption="Bills from this plan"
                items={plan.recentBills}
                columns={billColumns}
                getKey={(bill) => bill.id}
                getHref={(bill) => `/bills/${bill.id}`}
              />
            )}
          </Box>
        </SimpleGrid>
      </Stack>

      <ConfirmDialog
        isOpen={dialog.isOpen}
        onClose={closeDialog}
        onConfirm={confirm}
        isLoading={planAction.isPending || generateNow.isPending}
        alert={dialogAlert}
        title={pending === 'cancel' ? 'Cancel this plan?' : 'Generate a bill now?'}
        body={
          pending === 'cancel'
            ? 'No more bills will be generated. Bills that already exist are not affected, and a cancelled plan cannot be resumed.'
            : `This creates the draft bill for the period starting ${formatDate(plan.nextBillingDate)} and moves the schedule forward. You can review it before sending.`
        }
        confirmLabel={pending === 'cancel' ? 'Cancel plan' : 'Generate bill'}
        confirmColorScheme={pending === 'cancel' ? 'red' : 'blue'}
      />
    </PageWrapper>
  );
}
