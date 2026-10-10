import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  Heading,
  Link,
  List,
  ListItem,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { AgingChart } from '../../components/dashboard/AgingChart';
import { RevenueChart } from '../../components/dashboard/RevenueChart';
import { PAYMENT_METHOD_LABELS } from '../../components/customers/customerFormat';
import { EmptyState } from '../../components/ui/EmptyState';
import { GlassCard } from '../../components/ui/GlassCard';
import { GradientButton } from '../../components/ui/GradientButton';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { StatTile } from '../../components/ui/StatTile';
import {
  useAging,
  useAnalyticsSummary,
  useRevenue,
  useTopCustomers,
} from '../../hooks/useAnalytics';
import { usePayments } from '../../hooks/usePayments';
import { formatDate, formatDateTime } from '../../lib/date';
import { formatMoney, isZeroMoney } from '../../lib/money';
import { getErrorMessage } from '../../services/api';

function SectionError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <Alert status="error" borderRadius="md">
      <AlertIcon />
      <AlertDescription flex="1">{getErrorMessage(error)}</AlertDescription>
      <Button size="sm" onClick={onRetry}>
        Retry
      </Button>
    </Alert>
  );
}

function ListCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <GlassCard hoverLift={false}>
      <Flex justify="space-between" align="center" mb={4}>
        <Heading as="h2" size="md">
          {title}
        </Heading>
        {action}
      </Flex>
      {children}
    </GlassCard>
  );
}

function GettingStarted({ hasCustomers }: { hasCustomers: boolean }) {
  const navigate = useNavigate();
  return (
    <GlassCard hoverLift={false}>
      <Stack spacing={4}>
        <Heading as="h2" size="md">
          Get started
        </Heading>
        <Text color="text-muted">
          Set up your first recurring bill in two steps. Bill Maker takes it from there.
        </Text>
        <List spacing={2}>
          <ListItem>{hasCustomers ? '✓' : '1.'} Add a customer to bill</ListItem>
          <ListItem>2. Create a billing plan with what you charge and how often</ListItem>
        </List>
        <Flex gap={3} wrap="wrap">
          {!hasCustomers && (
            <GradientButton onClick={() => navigate('/customers/new')}>Add a customer</GradientButton>
          )}
          {hasCustomers && (
            <GradientButton onClick={() => navigate('/plans/new')}>Create a plan</GradientButton>
          )}
          <Button variant="outline" onClick={() => navigate('/bills/new')}>
            Or send a one-off bill
          </Button>
        </Flex>
      </Stack>
    </GlassCard>
  );
}

/** Headline numbers, upcoming bills, recent payments and charts. */
export default function DashboardPage() {
  const summary = useAnalyticsSummary();
  const revenue = useRevenue(12);
  const aging = useAging();
  const topCustomers = useTopCustomers(5);
  const recentPayments = usePayments({ pageSize: 5 });

  if (summary.isPending) {
    return (
      <PageWrapper title="Dashboard">
        <LoadingState label="Loading your dashboard…" />
      </PageWrapper>
    );
  }
  if (summary.isError) {
    return (
      <PageWrapper title="Dashboard">
        <SectionError error={summary.error} onRetry={() => void summary.refetch()} />
      </PageWrapper>
    );
  }

  const data = summary.data;
  const currency = data.currency;
  const needsSetup = data.activePlans === 0;

  return (
    <PageWrapper title="Dashboard" subtitle="How your billing is doing right now.">
      <Stack spacing={6}>
        {needsSetup && <GettingStarted hasCustomers={data.activeCustomers > 0} />}

        <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={5}>
          <StatTile
            label="Monthly recurring revenue"
            value={formatMoney(data.mrr, currency)}
            helpText={`${data.activePlans} active ${data.activePlans === 1 ? 'plan' : 'plans'}`}
          />
          <StatTile
            label="Collected this month"
            value={formatMoney(data.collectedThisMonth, currency)}
            tone="positive"
          />
          <StatTile label="Outstanding" value={formatMoney(data.outstanding, currency)} />
          <StatTile
            label="Overdue"
            value={formatMoney(data.overdueAmount, currency)}
            helpText={`${data.overdueCount} ${data.overdueCount === 1 ? 'bill' : 'bills'}`}
            tone={isZeroMoney(data.overdueAmount) ? 'default' : 'danger'}
          />
        </SimpleGrid>

        {data.excludedCurrencies.length > 0 && (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <AlertDescription>
              Figures are in {currency}. Plans and bills in {data.excludedCurrencies.join(', ')} are
              not included.
            </AlertDescription>
          </Alert>
        )}

        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
          <ListCard
            title="Upcoming bills"
            action={
              <Text fontSize="sm" color="text-muted">
                Next 7 days
              </Text>
            }
          >
            {data.upcomingBills.length === 0 ? (
              <Text color="text-muted">Nothing is scheduled to bill in the next 7 days.</Text>
            ) : (
              <List spacing={3}>
                {data.upcomingBills.map((bill) => (
                  <ListItem key={bill.planId}>
                    <Flex justify="space-between" gap={4}>
                      <Box minW={0}>
                        <Link as={RouterLink} to={`/plans/${bill.planId}`} fontWeight="semibold">
                          {bill.planName}
                        </Link>
                        <Text fontSize="sm" color="text-muted" noOfLines={1}>
                          {bill.customerName} · {formatDate(bill.nextBillingDate)}
                        </Text>
                      </Box>
                      <Text fontWeight="medium" flexShrink={0}>
                        {formatMoney(bill.total, bill.currency)}
                      </Text>
                    </Flex>
                  </ListItem>
                ))}
              </List>
            )}
          </ListCard>

          <ListCard
            title="Recent payments"
            action={
              <Link as={RouterLink} to="/payments" fontSize="sm">
                View all
              </Link>
            }
          >
            {recentPayments.isPending ? (
              <LoadingState label="Loading payments…" />
            ) : recentPayments.isError ? (
              <SectionError
                error={recentPayments.error}
                onRetry={() => void recentPayments.refetch()}
              />
            ) : recentPayments.data.items.length === 0 ? (
              <Text color="text-muted">No payments received yet.</Text>
            ) : (
              <List spacing={3}>
                {recentPayments.data.items.map((payment) => (
                  <ListItem key={payment.id}>
                    <Flex justify="space-between" gap={4}>
                      <Box minW={0}>
                        <Link as={RouterLink} to={`/bills/${payment.billId}`} fontWeight="semibold">
                          {payment.billNumber}
                        </Link>
                        <Text fontSize="sm" color="text-muted" noOfLines={1}>
                          {payment.customerName} ·{' '}
                          {payment.provider === 'dodo' ? 'Online' : PAYMENT_METHOD_LABELS[payment.method]}{' '}
                          · {formatDateTime(payment.paidAt)}
                        </Text>
                      </Box>
                      <Text fontWeight="medium" flexShrink={0}>
                        {formatMoney(payment.amount, payment.currency)}
                      </Text>
                    </Flex>
                  </ListItem>
                ))}
              </List>
            )}
          </ListCard>
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
          {revenue.isPending ? (
            <LoadingState label="Loading revenue…" />
          ) : revenue.isError ? (
            <SectionError error={revenue.error} onRetry={() => void revenue.refetch()} />
          ) : (
            <RevenueChart data={revenue.data} currency={currency} />
          )}
          {aging.isPending ? (
            <LoadingState label="Loading aging…" />
          ) : aging.isError ? (
            <SectionError error={aging.error} onRetry={() => void aging.refetch()} />
          ) : (
            <AgingChart report={aging.data} />
          )}
        </SimpleGrid>

        <ListCard title="Top customers" action={<Text fontSize="sm" color="text-muted">Last 12 months</Text>}>
          {topCustomers.isPending ? (
            <LoadingState label="Loading customers…" />
          ) : topCustomers.isError ? (
            <SectionError error={topCustomers.error} onRetry={() => void topCustomers.refetch()} />
          ) : topCustomers.data.length === 0 ? (
            <EmptyState
              title="No payments collected yet"
              description="Your best customers will show up here once payments come in."
            />
          ) : (
            <List spacing={3}>
              {topCustomers.data.map((customer, index) => (
                <ListItem key={customer.customerId}>
                  <Flex justify="space-between" gap={4}>
                    <Text>
                      {index + 1}.{' '}
                      <Link as={RouterLink} to={`/customers/${customer.customerId}`} fontWeight="semibold">
                        {customer.customerName}
                      </Link>
                    </Text>
                    <Text fontWeight="medium">{formatMoney(customer.collected, currency)}</Text>
                  </Flex>
                </ListItem>
              ))}
            </List>
          )}
        </ListCard>
      </Stack>
    </PageWrapper>
  );
}
