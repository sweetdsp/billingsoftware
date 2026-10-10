import {
  Badge,
  Button,
  Flex,
  Heading,
  Link,
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
import { Link as RouterLink } from 'react-router-dom';
import { formatDate, formatDateTime } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import type {
  CustomerBillSummary,
  CustomerPaymentSummary,
  CustomerPlanSummary,
} from '../../types';
import { GlassCard } from '../ui/GlassCard';
import { StatusBadge } from '../ui/StatusBadge';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_STYLES, formatFrequency } from './customerFormat';

interface SectionProps {
  title: string;
  action?: ReactNode;
  isEmpty: boolean;
  emptyText: string;
  children: ReactNode;
}

function Section({ title, action, isEmpty, emptyText, children }: SectionProps) {
  return (
    <GlassCard padding={0} hoverLift={false} ariaLabel={title}>
      <Flex px={6} pt={5} pb={3} justify="space-between" align="center" gap={3} wrap="wrap">
        <Heading as="h2" size="md">
          {title}
        </Heading>
        {action}
      </Flex>
      {isEmpty ? (
        <Text px={6} pb={6} color="text-muted">
          {emptyText}
        </Text>
      ) : (
        <TableContainer pb={2}>{children}</TableContainer>
      )}
    </GlassCard>
  );
}

export interface CustomerPlansSectionProps {
  customerId: number;
  plans: CustomerPlanSummary[];
  /** Hide "New plan" for archived customers. */
  canAddPlan: boolean;
}

/** All billing plans of the customer, with a "New plan" shortcut. */
export function CustomerPlansSection({ customerId, plans, canAddPlan }: CustomerPlansSectionProps) {
  return (
    <Section
      title="Plans"
      isEmpty={plans.length === 0}
      emptyText="No billing plans yet."
      action={
        canAddPlan ? (
          <Button as={RouterLink} to={`/plans/new?customerId=${customerId}`} size="sm">
            New plan
          </Button>
        ) : undefined
      }
    >
      <Table size="sm">
        <Thead>
          <Tr>
            <Th>Plan</Th>
            <Th>Status</Th>
            <Th>Frequency</Th>
            <Th>Next billing</Th>
            <Th isNumeric>Total</Th>
          </Tr>
        </Thead>
        <Tbody>
          {plans.map((plan) => (
            <Tr key={plan.id}>
              <Td>
                <Link as={RouterLink} to={`/plans/${plan.id}`} color="brand-fg" fontWeight="medium">
                  {plan.name}
                </Link>
              </Td>
              <Td>
                <StatusBadge status={plan.status} />
              </Td>
              <Td>{formatFrequency(plan.frequency, plan.intervalCount)}</Td>
              <Td>{plan.status === 'cancelled' ? '—' : formatDate(plan.nextBillingDate)}</Td>
              <Td isNumeric>{formatMoney(plan.total, plan.currency)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Section>
  );
}

export interface CustomerBillsSectionProps {
  bills: CustomerBillSummary[];
}

/** Latest bills of the customer (backend returns up to 10). */
export function CustomerBillsSection({ bills }: CustomerBillsSectionProps) {
  return (
    <Section title="Recent bills" isEmpty={bills.length === 0} emptyText="No bills yet.">
      <Table size="sm">
        <Thead>
          <Tr>
            <Th>Number</Th>
            <Th>Issued</Th>
            <Th>Due</Th>
            <Th isNumeric>Total</Th>
            <Th isNumeric>Paid</Th>
            <Th>Status</Th>
          </Tr>
        </Thead>
        <Tbody>
          {bills.map((bill) => (
            <Tr key={bill.id}>
              <Td>
                <Link as={RouterLink} to={`/bills/${bill.id}`} color="brand-fg" fontWeight="medium">
                  {bill.billNumber}
                </Link>
              </Td>
              <Td>{formatDate(bill.issueDate)}</Td>
              <Td>{formatDate(bill.dueDate)}</Td>
              <Td isNumeric>{formatMoney(bill.total, bill.currency)}</Td>
              <Td isNumeric>{formatMoney(bill.amountPaid, bill.currency)}</Td>
              <Td>
                <StatusBadge status={bill.status} />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Section>
  );
}

export interface CustomerPaymentsSectionProps {
  payments: CustomerPaymentSummary[];
}

/** Latest payments of the customer (backend returns up to 10). */
export function CustomerPaymentsSection({ payments }: CustomerPaymentsSectionProps) {
  return (
    <Section title="Recent payments" isEmpty={payments.length === 0} emptyText="No payments yet.">
      <Table size="sm">
        <Thead>
          <Tr>
            <Th>Paid at</Th>
            <Th isNumeric>Amount</Th>
            <Th>Method</Th>
            <Th>Status</Th>
            <Th>Bill</Th>
          </Tr>
        </Thead>
        <Tbody>
          {payments.map((payment) => {
            const statusStyle = PAYMENT_STATUS_STYLES[payment.status];
            return (
              <Tr key={payment.id}>
                <Td>{formatDateTime(payment.paidAt)}</Td>
                <Td isNumeric>{formatMoney(payment.amount, payment.currency)}</Td>
                <Td>{PAYMENT_METHOD_LABELS[payment.method]}</Td>
                <Td>
                  <Badge
                    colorScheme={statusStyle.colorScheme}
                    variant="subtle"
                    borderRadius="full"
                    px={2.5}
                    textTransform="none"
                  >
                    {statusStyle.label}
                  </Badge>
                </Td>
                <Td>
                  <Link as={RouterLink} to={`/bills/${payment.billId}`} color="brand-fg">
                    View bill
                  </Link>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Section>
  );
}
