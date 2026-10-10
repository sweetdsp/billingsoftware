import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Text,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { DataList, type DataColumn } from '../../components/ui/DataList';
import { EmptyState } from '../../components/ui/EmptyState';
import { GradientButton } from '../../components/ui/GradientButton';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { Pagination } from '../../components/ui/Pagination';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useBills } from '../../hooks/useBills';
import { usePagedSearchParams } from '../../hooks/usePagedSearchParams';
import { formatDate } from '../../lib/date';
import { formatMoney, isZeroMoney } from '../../lib/money';
import { getErrorMessage } from '../../services/api';
import { BILL_STATUSES, type BillListItem, type BillStatus } from '../../types';

const PAGE_SIZE = 20;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_FILTERS: Array<{ value: BillStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

function parseStatus(value: string | null): BillStatus | undefined {
  return BILL_STATUSES.find((status) => status === value);
}

function parseDate(value: string | null): string | undefined {
  return value && ISO_DATE.test(value) ? value : undefined;
}

const COLUMNS: DataColumn<BillListItem>[] = [
  {
    key: 'bill',
    header: 'Bill',
    render: (bill) => (
      <Box>
        <Text fontWeight="semibold">{bill.billNumber}</Text>
        <Text fontSize="sm" color="text-muted">
          {bill.customerName}
        </Text>
      </Box>
    ),
  },
  { key: 'issued', header: 'Issued', render: (bill) => formatDate(bill.issueDate) },
  { key: 'due', header: 'Due', render: (bill) => formatDate(bill.dueDate) },
  {
    key: 'total',
    header: 'Total',
    isNumeric: true,
    render: (bill) => formatMoney(bill.total, bill.currency),
  },
  {
    key: 'balance',
    header: 'Balance due',
    isNumeric: true,
    render: (bill) => (
      <Text as="span" color={isZeroMoney(bill.balanceDue) ? 'text-muted' : 'text-default'}>
        {formatMoney(bill.balanceDue, bill.currency)}
      </Text>
    ),
  },
  { key: 'status', header: 'Status', render: (bill) => <StatusBadge status={bill.status} /> },
];

/** All bills, filterable by status and issue date. State lives in the URL. */
export default function BillsPage() {
  const navigate = useNavigate();
  const params = usePagedSearchParams();
  const status = parseStatus(params.get('status'));
  const from = parseDate(params.get('from'));
  const to = parseDate(params.get('to'));
  const customerId = /^\d+$/.test(params.get('customerId') ?? '')
    ? Number(params.get('customerId'))
    : undefined;
  const hasFilters = Boolean(status || from || to || customerId);

  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData } = useBills({
    status,
    from,
    to,
    customerId,
    page: params.page,
    pageSize: PAGE_SIZE,
  });

  const renderContent = () => {
    if (isPending) return <LoadingState label="Loading bills…" />;
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
      return hasFilters ? (
        <EmptyState
          title="No bills match these filters"
          action={<Button onClick={params.clear}>Clear filters</Button>}
        />
      ) : (
        <EmptyState
          title="No bills yet"
          description="Bills appear here when a billing plan generates one, or when you create a one-off bill."
          action={
            <GradientButton onClick={() => navigate('/bills/new')}>Create a bill</GradientButton>
          }
        />
      );
    }
    return (
      <Box opacity={isPlaceholderData ? 0.6 : 1} transition="opacity 0.2s">
        <DataList
          caption="Bills"
          items={data.items}
          columns={COLUMNS}
          getKey={(bill) => bill.id}
          getHref={(bill) => `/bills/${bill.id}`}
        />
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={params.setPage}
          isDisabled={isFetching}
          itemLabel="bills"
        />
      </Box>
    );
  };

  return (
    <PageWrapper
      title="Bills"
      subtitle="Everything you've billed, and what is still owed."
      actions={<GradientButton onClick={() => navigate('/bills/new')}>New bill</GradientButton>}
    >
      <Flex mb={5} gap={4} direction={{ base: 'column', lg: 'row' }} justify="space-between">
        <Wrap role="group" aria-label="Bill status" spacing={2}>
          {STATUS_FILTERS.map((filter) => {
            const selected = (status ?? '') === filter.value;
            return (
              <WrapItem key={filter.label}>
                <Button
                  size="sm"
                  variant={selected ? 'solid' : 'outline'}
                  aria-pressed={selected}
                  onClick={() => params.setFilter('status', filter.value || null)}
                >
                  {filter.label}
                </Button>
              </WrapItem>
            );
          })}
        </Wrap>
        <Flex gap={3} align="flex-end">
          <FormControl w={{ base: 'full', sm: '9.5rem' }}>
            <FormLabel fontSize="sm" mb={1}>
              Issued from
            </FormLabel>
            <Input
              type="date"
              size="sm"
              value={from ?? ''}
              max={to}
              onChange={(event) => params.setFilter('from', event.target.value || null)}
            />
          </FormControl>
          <FormControl w={{ base: 'full', sm: '9.5rem' }}>
            <FormLabel fontSize="sm" mb={1}>
              to
            </FormLabel>
            <Input
              type="date"
              size="sm"
              value={to ?? ''}
              min={from}
              onChange={(event) => params.setFilter('to', event.target.value || null)}
            />
          </FormControl>
        </Flex>
      </Flex>
      {renderContent()}
    </PageWrapper>
  );
}
