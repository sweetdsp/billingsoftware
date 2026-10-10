import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  Heading,
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
} from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { TotalsSummary } from '../../components/billing/TotalsSummary';
import { EmptyState } from '../../components/ui/EmptyState';
import { GlassCard } from '../../components/ui/GlassCard';
import { LoadingState } from '../../components/ui/LoadingState';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { usePublicBill } from '../../hooks/useBills';
import { formatDate } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import { getErrorMessage, getErrorStatus } from '../../services/api';
import type { PublicBill } from '../../types';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" color="text-muted">
        {label}
      </Text>
      <Box mt={1}>{children}</Box>
    </Box>
  );
}

/** A safe link target: the payment link must be an http(s) URL. */
function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function PaymentSection({ bill }: { bill: PublicBill }) {
  const business = bill.business;
  if (bill.status === 'paid') {
    return (
      <Alert status="success" borderRadius="md">
        <AlertIcon />
        <AlertDescription>This bill has been paid in full. Thank you!</AlertDescription>
      </Alert>
    );
  }
  if (bill.status === 'cancelled') {
    return (
      <Alert status="warning" borderRadius="md">
        <AlertIcon />
        <AlertDescription>This bill has been cancelled. No payment is needed.</AlertDescription>
      </Alert>
    );
  }
  if (bill.paymentLinkUrl && isSafeUrl(bill.paymentLinkUrl)) {
    return (
      <Stack spacing={2} align={{ base: 'stretch', sm: 'flex-end' }}>
        <Button
          as="a"
          href={bill.paymentLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          size="lg"
          colorScheme="blue"
        >
          Pay {formatMoney(bill.balanceDue, bill.currency)} now
        </Button>
        <Text fontSize="xs" color="text-muted">
          You'll be taken to a secure checkout page.
        </Text>
      </Stack>
    );
  }
  return (
    <Alert status="info" borderRadius="md" alignItems="flex-start">
      <AlertIcon />
      <AlertDescription>
        Online payment isn't available for this bill yet.
        {business.email && (
          <>
            {' '}
            Please contact{' '}
            <Link href={`mailto:${business.email}`} fontWeight="semibold">
              {business.email}
            </Link>{' '}
            to arrange payment.
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** The customer-facing bill at `/pay/:publicToken`. No login; read-only plus a pay button. */
export default function PublicBillPage() {
  const { publicToken } = useParams<{ publicToken: string }>();
  const { data: bill, isPending, error, refetch } = usePublicBill(publicToken);

  if (isPending) return <LoadingState label="Loading your bill…" />;
  if (error || !bill) {
    return getErrorStatus(error) === 404 ? (
      <EmptyState
        title="Bill not found"
        description="This link isn't valid, or the bill is no longer available. Please check the link in your email."
      />
    ) : (
      <Stack spacing={4} align="flex-start">
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <AlertDescription>{error ? getErrorMessage(error) : 'Something went wrong.'}</AlertDescription>
        </Alert>
        <Button onClick={() => void refetch()}>Try again</Button>
      </Stack>
    );
  }

  const business = bill.business;
  return (
    <Stack spacing={6}>
      <GlassCard hoverLift={false}>
        <Stack spacing={6}>
          <Flex justify="space-between" align="flex-start" gap={4} wrap="wrap">
            <Box>
              <Heading as="h1" size="lg">
                {business.name}
              </Heading>
              {business.address && (
                <Text color="text-muted" whiteSpace="pre-line">
                  {business.address}
                </Text>
              )}
              {business.email && <Text color="text-muted">{business.email}</Text>}
              {business.phone && <Text color="text-muted">{business.phone}</Text>}
              {business.taxId && <Text color="text-muted">Tax ID: {business.taxId}</Text>}
            </Box>
            <Box textAlign={{ base: 'left', sm: 'right' }}>
              <Text fontSize="sm" color="text-muted">
                Bill
              </Text>
              <Heading as="h2" size="md">
                {bill.billNumber}
              </Heading>
              <Box mt={2}>
                <StatusBadge status={bill.status} />
              </Box>
            </Box>
          </Flex>

          <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={5}>
            <Detail label="Billed to">
              <Text fontWeight="semibold">{bill.customer.name}</Text>
              {bill.customer.companyName && (
                <Text color="text-muted">{bill.customer.companyName}</Text>
              )}
            </Detail>
            <Detail label="Issued">{formatDate(bill.issueDate)}</Detail>
            <Detail label="Due">{formatDate(bill.dueDate)}</Detail>
          </SimpleGrid>
          {bill.periodStart && (
            <Text fontSize="sm" color="text-muted">
              Billing period: {formatDate(bill.periodStart)} – {formatDate(bill.periodEnd)}
            </Text>
          )}

          <TableContainer>
            <Table size="sm" aria-label="Bill items">
              <Thead>
                <Tr>
                  <Th>Description</Th>
                  <Th isNumeric>Qty</Th>
                  <Th isNumeric>Unit price</Th>
                  <Th isNumeric>Amount</Th>
                </Tr>
              </Thead>
              <Tbody>
                {bill.lineItems.map((item, index) => (
                  <Tr key={`${index}-${item.description}`}>
                    <Td whiteSpace="normal">{item.description}</Td>
                    <Td isNumeric>{item.quantity}</Td>
                    <Td isNumeric>{formatMoney(item.unitPrice, bill.currency)}</Td>
                    <Td isNumeric>{formatMoney(item.amount, bill.currency)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>

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
        </Stack>
      </GlassCard>

      <PaymentSection bill={bill} />

      {bill.footerNote && (
        <Text fontSize="sm" color="text-muted" textAlign="center" whiteSpace="pre-line">
          {bill.footerNote}
        </Text>
      )}
    </Stack>
  );
}
