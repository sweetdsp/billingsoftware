import {
  Badge,
  Box,
  Button,
  Code,
  Flex,
  Heading,
  IconButton,
  Link,
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
import { RecordPaymentModal } from '../../components/bills/RecordPaymentModal';
import { TotalsSummary } from '../../components/billing/TotalsSummary';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_STYLES,
} from '../../components/customers/customerFormat';
import { ConfirmDialog, type ConfirmDialogAlert } from '../../components/ui/ConfirmDialog';
import { GlassCard } from '../../components/ui/GlassCard';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { ResourceLoadError } from '../../components/ui/ResourceLoadError';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useBill, useBillAction, type BillAction } from '../../hooks/useBills';
import { useIdParam } from '../../hooks/useIdParam';
import { useDeletePayment, useRecordPayment } from '../../hooks/usePayments';
import { formatDate, formatDateTime } from '../../lib/date';
import { saveBlob } from '../../lib/download';
import { isZeroMoney, formatMoney } from '../../lib/money';
import { getErrorCode, getErrorMessage } from '../../services/api';
import { BILL_ERROR_CODES, billService } from '../../services/billService';
import type { BillDetail, BillStatus, EmailStatus, ManualPaymentCreate } from '../../types';

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

const EMAIL_STATUS_COLORS: Record<EmailStatus, string> = {
  sent: 'green',
  queued: 'gray',
  failed: 'red',
};

const TEMPLATE_LABELS: Record<string, string> = {
  bill_sent: 'Bill',
  reminder: 'Reminder',
  receipt: 'Receipt',
};

const UNPAID_STATUSES: readonly BillStatus[] = ['sent', 'partially_paid', 'overdue'];

type Dialog = { kind: 'cancel' } | { kind: 'deletePayment'; paymentId: number } | null;

/** Bill header and actions, line items, payments, and email history. */
export default function BillDetailPage() {
  const id = useIdParam();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: bill, isPending, error, refetch } = useBill(id);
  const billAction = useBillAction();
  const recordPayment = useRecordPayment();
  const deletePayment = useDeletePayment();
  const paymentModal = useDisclosure();
  const confirm = useDisclosure();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogAlert, setDialogAlert] = useState<ConfirmDialogAlert | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  if (id === undefined || (error && !bill)) {
    return (
      <PageWrapper>
        <ResourceLoadError
          entity="bill"
          backTo="/bills"
          backLabel="Back to bills"
          error={id === undefined ? null : error}
          onRetry={() => void refetch()}
        />
      </PageWrapper>
    );
  }
  if (isPending || !bill) {
    return (
      <PageWrapper>
        <LoadingState label="Loading bill…" />
      </PageWrapper>
    );
  }

  const isDraft = bill.status === 'draft';
  const isUnpaid = UNPAID_STATUSES.includes(bill.status);
  const canCancel = (isDraft || isUnpaid) && bill.payments.length === 0;

  const run = (action: BillAction) => {
    billAction.mutate(
      { id: bill.id, action },
      {
        onSuccess: (updated) => {
          if (action === 'cancel') {
            toast({ status: 'success', title: 'Bill cancelled' });
            closeDialog();
            return;
          }
          const label = action === 'send' ? 'sent' : 'reminder sent';
          // The API answers 200 even if the email failed; a draft that stays draft means it failed.
          if (action === 'send' && updated.status === 'draft') {
            toast({
              status: 'warning',
              title: 'The email could not be sent',
              description: 'The bill is still a draft. See the email history below.',
            });
          } else {
            toast({ status: 'success', title: `Bill ${label}`, description: bill.customerName });
          }
        },
        onError: (err) => {
          if (action === 'cancel') {
            setDialogAlert({
              status: 'error',
              description:
                getErrorCode(err) === BILL_ERROR_CODES.hasPayments
                  ? 'A bill with payments cannot be cancelled.'
                  : getErrorMessage(err),
            });
          } else {
            toast({ status: 'error', title: getErrorMessage(err) });
          }
        },
      },
    );
  };

  function openDialog(next: Exclude<Dialog, null>) {
    setDialog(next);
    setDialogAlert(null);
    confirm.onOpen();
  }
  function closeDialog() {
    confirm.onClose();
    setDialog(null);
    setDialogAlert(null);
  }

  const onConfirm = () => {
    if (dialog?.kind === 'cancel') run('cancel');
    if (dialog?.kind === 'deletePayment') {
      deletePayment.mutate(dialog.paymentId, {
        onSuccess: () => {
          toast({ status: 'success', title: 'Payment removed' });
          closeDialog();
        },
        onError: (err) => setDialogAlert({ status: 'error', description: getErrorMessage(err) }),
      });
    }
  };

  const downloadPdf = async () => {
    setIsDownloading(true);
    try {
      saveBlob(await billService.downloadPdf(bill.id), `${bill.billNumber}.pdf`);
    } catch (err) {
      toast({ status: 'error', title: 'Could not download the PDF', description: getErrorMessage(err) });
    } finally {
      setIsDownloading(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bill.publicUrl);
      toast({ status: 'success', title: 'Link copied' });
    } catch {
      toast({ status: 'info', title: 'Copy this link', description: bill.publicUrl });
    }
  };

  const submitPayment = async (data: ManualPaymentCreate) => {
    await recordPayment.mutateAsync({ billId: bill.id, data });
    toast({ status: 'success', title: 'Payment recorded' });
    paymentModal.onClose();
  };

  return (
    <PageWrapper
      title={bill.billNumber}
      subtitle={`For ${bill.customerName}`}
      actions={
        <>
          {isDraft && (
            <>
              <Button variant="outline" onClick={() => navigate(`/bills/${bill.id}/edit`)}>
                Edit
              </Button>
              <Button
                colorScheme="blue"
                onClick={() => run('send')}
                isLoading={billAction.isPending && billAction.variables?.action === 'send'}
              >
                Send to customer
              </Button>
            </>
          )}
          {isUnpaid && (
            <>
              <Button colorScheme="blue" onClick={paymentModal.onOpen}>
                Record payment
              </Button>
              <Button
                variant="outline"
                onClick={() => run('remind')}
                isLoading={billAction.isPending && billAction.variables?.action === 'remind'}
              >
                Send reminder
              </Button>
              {bill.status === 'sent' && (
                <Button
                  variant="outline"
                  onClick={() => run('send')}
                  isLoading={billAction.isPending && billAction.variables?.action === 'send'}
                >
                  Resend
                </Button>
              )}
            </>
          )}
          <Button variant="outline" onClick={() => void downloadPdf()} isLoading={isDownloading}>
            Download PDF
          </Button>
          {canCancel && (
            <Button variant="outline" colorScheme="red" onClick={() => openDialog({ kind: 'cancel' })}>
              Cancel bill
            </Button>
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
            <StatusBadge status={bill.status} />
          </Flex>
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={5}>
            <DetailRow label="Customer">
              <Link as={RouterLink} to={`/customers/${bill.customerId}`} fontWeight="semibold">
                {bill.customerName}
              </Link>
            </DetailRow>
            <DetailRow label="Issued">{formatDate(bill.issueDate)}</DetailRow>
            <DetailRow label="Due">{formatDate(bill.dueDate)}</DetailRow>
            <DetailRow label="Period">
              {bill.periodStart
                ? `${formatDate(bill.periodStart)} – ${formatDate(bill.periodEnd)}`
                : 'One-off bill'}
            </DetailRow>
            <DetailRow label="Plan">
              {bill.planId ? (
                <Link as={RouterLink} to={`/plans/${bill.planId}`}>
                  {bill.planName}
                </Link>
              ) : (
                '—'
              )}
            </DetailRow>
            <DetailRow label="Sent">{bill.sentAt ? formatDateTime(bill.sentAt) : 'Not sent yet'}</DetailRow>
            <DetailRow label="Paid">{bill.paidAt ? formatDateTime(bill.paidAt) : '—'}</DetailRow>
            <DetailRow label="Customer link">
              {isDraft ? (
                <Text color="text-muted">Available once sent</Text>
              ) : (
                <Button size="xs" variant="outline" onClick={() => void copyLink()}>
                  Copy link
                </Button>
              )}
            </DetailRow>
          </SimpleGrid>
        </GlassCard>

        <GlassCard hoverLift={false}>
          <Heading as="h2" size="md" mb={4}>
            Items
          </Heading>
          <TableContainer>
            <Table size="sm" aria-label="Bill line items">
              <Thead>
                <Tr>
                  <Th>Description</Th>
                  <Th isNumeric>Qty</Th>
                  <Th isNumeric>Unit price</Th>
                  <Th isNumeric>Amount</Th>
                </Tr>
              </Thead>
              <Tbody>
                {bill.lineItems.map((item) => (
                  <Tr key={item.id}>
                    <Td whiteSpace="normal">{item.description}</Td>
                    <Td isNumeric>{item.quantity}</Td>
                    <Td isNumeric>{formatMoney(item.unitPrice, bill.currency)}</Td>
                    <Td isNumeric>{formatMoney(item.amount, bill.currency)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
          <Box mt={5}>
            <TotalsSummary
              currency={bill.currency}
              subtotal={bill.subtotal}
              taxRate={bill.taxRate}
              taxAmount={bill.taxAmount}
              total={bill.total}
              extra={[
                { label: 'Paid', value: bill.amountPaid },
                { label: 'Balance due', value: bill.balanceDue, emphasize: true },
              ]}
            />
          </Box>
        </GlassCard>

        <GlassCard hoverLift={false}>
          <Heading as="h2" size="md" mb={4}>
            Payments
          </Heading>
          <PaymentsTable bill={bill} onDelete={(paymentId) => openDialog({ kind: 'deletePayment', paymentId })} />
        </GlassCard>

        <GlassCard hoverLift={false}>
          <Heading as="h2" size="md" mb={4}>
            Email history
          </Heading>
          {bill.emailLogs.length === 0 ? (
            <Text color="text-muted">No emails have been sent for this bill.</Text>
          ) : (
            <TableContainer>
              <Table size="sm" aria-label="Email history">
                <Thead>
                  <Tr>
                    <Th>When</Th>
                    <Th>Email</Th>
                    <Th>To</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {bill.emailLogs.map((log) => (
                    <Tr key={log.id}>
                      <Td>{formatDateTime(log.createdAt)}</Td>
                      <Td>{TEMPLATE_LABELS[log.template] ?? log.template}</Td>
                      <Td>{log.toEmail}</Td>
                      <Td whiteSpace="normal">
                        <Badge colorScheme={EMAIL_STATUS_COLORS[log.status]} textTransform="none">
                          {log.status}
                        </Badge>
                        {log.error && (
                          <Text mt={1} fontSize="xs" color="red.400">
                            {log.error}
                          </Text>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          )}
        </GlassCard>

        {!isDraft && (
          <Text fontSize="sm" color="text-muted">
            Customer page: <Code>{bill.publicUrl}</Code>
          </Text>
        )}
      </Stack>

      <RecordPaymentModal
        isOpen={paymentModal.isOpen}
        onClose={paymentModal.onClose}
        currency={bill.currency}
        balanceDue={bill.balanceDue}
        onSubmit={submitPayment}
      />

      <ConfirmDialog
        isOpen={confirm.isOpen}
        onClose={closeDialog}
        onConfirm={onConfirm}
        isLoading={billAction.isPending || deletePayment.isPending}
        alert={dialogAlert}
        title={dialog?.kind === 'deletePayment' ? 'Remove this payment?' : 'Cancel this bill?'}
        body={
          dialog?.kind === 'deletePayment'
            ? 'The bill balance and status are recalculated.'
            : 'The bill is voided and can no longer be sent or paid. This cannot be undone.'
        }
        confirmLabel={dialog?.kind === 'deletePayment' ? 'Remove payment' : 'Cancel bill'}
      />
    </PageWrapper>
  );
}

interface PaymentsTableProps {
  bill: BillDetail;
  onDelete: (paymentId: number) => void;
}

function PaymentsTable({ bill, onDelete }: PaymentsTableProps) {
  if (bill.payments.length === 0) {
    return (
      <Text color="text-muted">
        {isZeroMoney(bill.amountPaid) ? 'No payments yet.' : 'No payment records.'}
      </Text>
    );
  }
  return (
    <TableContainer>
      <Table size="sm" aria-label="Payments">
        <Thead>
          <Tr>
            <Th>Date</Th>
            <Th>Method</Th>
            <Th>Status</Th>
            <Th isNumeric>Amount</Th>
            <Th>
              <Text as="span" srOnly>
                Actions
              </Text>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {bill.payments.map((payment) => {
            const style = PAYMENT_STATUS_STYLES[payment.status];
            return (
              <Tr key={payment.id}>
                <Td>{formatDateTime(payment.paidAt)}</Td>
                <Td whiteSpace="normal">
                  {payment.provider === 'dodo' ? 'Online' : PAYMENT_METHOD_LABELS[payment.method]}
                  {payment.notes && (
                    <Text fontSize="xs" color="text-muted">
                      {payment.notes}
                    </Text>
                  )}
                </Td>
                <Td>
                  <Badge colorScheme={style.colorScheme} textTransform="none">
                    {style.label}
                  </Badge>
                </Td>
                <Td isNumeric>{formatMoney(payment.amount, bill.currency)}</Td>
                <Td>
                  {payment.provider === 'manual' && (
                    <IconButton
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      aria-label="Remove payment"
                      icon={<Text as="span">✕</Text>}
                      onClick={() => onDelete(payment.id)}
                    />
                  )}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </TableContainer>
  );
}
