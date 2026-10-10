import { Alert, AlertDescription, AlertIcon, Box, Button, ButtonGroup, Flex, Link, Text } from '@chakra-ui/react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { formatFrequency } from '../../components/customers/customerFormat';
import { DataList, type DataColumn } from '../../components/ui/DataList';
import { EmptyState } from '../../components/ui/EmptyState';
import { GradientButton } from '../../components/ui/GradientButton';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { Pagination } from '../../components/ui/Pagination';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { usePagedSearchParams } from '../../hooks/usePagedSearchParams';
import { usePlans } from '../../hooks/usePlans';
import { formatDate } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import { getErrorMessage } from '../../services/api';
import { PLAN_STATUSES, type BillingPlanListItem, type PlanStatus } from '../../types';

const PAGE_SIZE = 20;

const STATUS_FILTERS: Array<{ value: PlanStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
];

function parseStatus(value: string | null): PlanStatus | undefined {
  return PLAN_STATUSES.find((status) => status === value);
}

const COLUMNS: DataColumn<BillingPlanListItem>[] = [
  {
    key: 'plan',
    header: 'Plan',
    render: (plan) => (
      <Box>
        <Text fontWeight="semibold">{plan.name}</Text>
        <Text fontSize="sm" color="text-muted">
          {plan.customerName}
        </Text>
      </Box>
    ),
  },
  {
    key: 'schedule',
    header: 'Schedule',
    render: (plan) => formatFrequency(plan.frequency, plan.intervalCount),
  },
  {
    key: 'next',
    header: 'Next bill',
    render: (plan) => (plan.status === 'cancelled' ? '—' : formatDate(plan.nextBillingDate)),
  },
  {
    key: 'total',
    header: 'Per period',
    isNumeric: true,
    render: (plan) => formatMoney(plan.total, plan.currency),
  },
  { key: 'status', header: 'Status', render: (plan) => <StatusBadge status={plan.status} /> },
];

/** All billing plans, filterable by status. State (status, page) lives in the URL. */
export default function PlansPage() {
  const navigate = useNavigate();
  const params = usePagedSearchParams();
  const status = parseStatus(params.get('status'));

  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData } = usePlans({
    status,
    page: params.page,
    pageSize: PAGE_SIZE,
  });

  const renderContent = () => {
    if (isPending) return <LoadingState label="Loading plans…" />;
    if (isError) {
      return (
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <AlertDescription flex="1">{getErrorMessage(error)}</AlertDescription>
          <Button size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </Alert>
      );
    }
    if (data.total === 0) {
      return status ? (
        <EmptyState
          title={`No ${status} plans`}
          action={<Button onClick={() => params.setFilter('status', null)}>Show all plans</Button>}
        />
      ) : (
        <EmptyState
          title="No billing plans yet"
          description="A plan describes what you bill a customer and how often. Bill Maker then creates and sends each bill for you."
          action={
            <GradientButton onClick={() => navigate('/plans/new')}>Create a plan</GradientButton>
          }
        />
      );
    }
    return (
      <Box opacity={isPlaceholderData ? 0.6 : 1} transition="opacity 0.2s">
        <DataList
          caption="Billing plans"
          items={data.items}
          columns={COLUMNS}
          getKey={(plan) => plan.id}
          getHref={(plan) => `/plans/${plan.id}`}
        />
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={params.setPage}
          isDisabled={isFetching}
          itemLabel="plans"
        />
      </Box>
    );
  };

  return (
    <PageWrapper
      title="Billing plans"
      subtitle="Recurring charges that generate bills automatically."
      actions={<GradientButton onClick={() => navigate('/plans/new')}>New plan</GradientButton>}
    >
      <Flex mb={5} justify="space-between" align="center" wrap="wrap" gap={3}>
        <ButtonGroup size="sm" isAttached variant="outline" role="group" aria-label="Plan status">
          {STATUS_FILTERS.map((filter) => {
            const selected = (status ?? '') === filter.value;
            return (
              <Button
                key={filter.label}
                variant={selected ? 'solid' : 'outline'}
                aria-pressed={selected}
                onClick={() => params.setFilter('status', filter.value || null)}
              >
                {filter.label}
              </Button>
            );
          })}
        </ButtonGroup>
        <Text fontSize="sm" color="text-muted">
          Need a one-off charge?{' '}
          <Link as={RouterLink} to="/bills/new" color="brand.500">
            Create a bill
          </Link>
        </Text>
      </Flex>
      {renderContent()}
    </PageWrapper>
  );
}
