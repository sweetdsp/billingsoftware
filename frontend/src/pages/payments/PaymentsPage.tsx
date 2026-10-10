import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Select,
  Text,
} from '@chakra-ui/react';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_STYLES,
} from '../../components/customers/customerFormat';
import { DataList, type DataColumn } from '../../components/ui/DataList';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { Pagination } from '../../components/ui/Pagination';
import { usePagedSearchParams } from '../../hooks/usePagedSearchParams';
import { usePayments } from '../../hooks/usePayments';
import { formatDateTime } from '../../lib/date';
import { formatMoney } from '../../lib/money';
import { getErrorMessage } from '../../services/api';
import { PAYMENT_METHODS, type Payment, type PaymentMethod } from '../../types';

const PAGE_SIZE = 20;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseMethod(value: string | null): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((method) => method === value);
}

function parseDate(value: string | null): string | undefined {
  return value && ISO_DATE.test(value) ? value : undefined;
}

const COLUMNS: DataColumn<Payment>[] = [
  {
    key: 'bill',
    header: 'Bill',
    render: (payment) => (
      <Box>
        <Text fontWeight="semibold">{payment.billNumber}</Text>
        <Text fontSize="sm" color="text-muted">
          {payment.customerName}
        </Text>
      </Box>
    ),
  },
  { key: 'date', header: 'Received', render: (payment) => formatDateTime(payment.paidAt) },
  {
    key: 'method',
    header: 'Method',
    render: (payment) => (
      <Box>
        <Text>{payment.provider === 'dodo' ? 'Online' : PAYMENT_METHOD_LABELS[payment.method]}</Text>
        {payment.notes && (
          <Text fontSize="xs" color="text-muted" noOfLines={1}>
            {payment.notes}
          </Text>
        )}
      </Box>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (payment) => {
      const style = PAYMENT_STATUS_STYLES[payment.status];
      return (
        <Badge colorScheme={style.colorScheme} textTransform="none">
          {style.label}
        </Badge>
      );
    },
  },
  {
    key: 'amount',
    header: 'Amount',
    isNumeric: true,
    render: (payment) => formatMoney(payment.amount, payment.currency),
  },
];

/** Every payment received (online or recorded manually). Filters live in the URL. */
export default function PaymentsPage() {
  const params = usePagedSearchParams();
  const method = parseMethod(params.get('method'));
  const from = parseDate(params.get('from'));
  const to = parseDate(params.get('to'));
  const hasFilters = Boolean(method || from || to);

  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData } = usePayments({
    method,
    from,
    to,
    page: params.page,
    pageSize: PAGE_SIZE,
  });

  const renderContent = () => {
    if (isPending) return <LoadingState label="Loading payments…" />;
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
          title="No payments match these filters"
          action={<Button onClick={params.clear}>Clear filters</Button>}
        />
      ) : (
        <EmptyState
          title="No payments yet"
          description="Payments appear here when a customer pays online, or when you record one on a bill."
        />
      );
    }
    return (
      <Box opacity={isPlaceholderData ? 0.6 : 1} transition="opacity 0.2s">
        <DataList
          caption="Payments"
          items={data.items}
          columns={COLUMNS}
          getKey={(payment) => payment.id}
          getHref={(payment) => `/bills/${payment.billId}`}
        />
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={params.setPage}
          isDisabled={isFetching}
          itemLabel="payments"
        />
      </Box>
    );
  };

  return (
    <PageWrapper title="Payments" subtitle="Money received, newest first.">
      <Flex mb={5} gap={3} wrap="wrap" align="flex-end">
        <FormControl w={{ base: 'full', sm: '12rem' }}>
          <FormLabel fontSize="sm" mb={1}>
            Method
          </FormLabel>
          <Select
            size="sm"
            value={method ?? ''}
            onChange={(event) => params.setFilter('method', event.target.value || null)}
          >
            <option value="">All methods</option>
            {PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_METHOD_LABELS[value]}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl w={{ base: 'full', sm: '9.5rem' }}>
          <FormLabel fontSize="sm" mb={1}>
            From
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
            To
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
      {renderContent()}
    </PageWrapper>
  );
}
