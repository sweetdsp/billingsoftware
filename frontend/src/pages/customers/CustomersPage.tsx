import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  ButtonGroup,
  Flex,
  Input,
  InputGroup,
  InputRightElement,
  CloseButton,
} from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CustomerList } from '../../components/customers/CustomerList';
import { EmptyState } from '../../components/ui/EmptyState';
import { GradientButton } from '../../components/ui/GradientButton';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { Pagination } from '../../components/ui/Pagination';
import { useCustomers } from '../../hooks/useCustomers';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getErrorMessage } from '../../services/api';

const CUSTOMERS_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  return Math.max(1, Number(value));
}

/** Search and manage customers. State (q, page, active) lives in the URL. */
export default function CustomersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const page = parsePage(searchParams.get('page'));
  const showArchived = searchParams.get('active') === 'false';

  const [search, setSearch] = useState(q);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const lastAppliedSearch = useRef(debouncedSearch);

  // Push the debounced search into the URL (resetting to page 1). Only reacts to new input.
  useEffect(() => {
    if (debouncedSearch === lastAppliedSearch.current) return;
    lastAppliedSearch.current = debouncedSearch;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const trimmed = debouncedSearch.trim();
        if (trimmed) next.set('q', trimmed);
        else next.delete('q');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, setSearchParams]);

  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData } = useCustomers({
    q: q || undefined,
    active: !showArchived,
    page,
    pageSize: CUSTOMERS_PAGE_SIZE,
  });

  // If the current page no longer exists (e.g. after archiving its last row), jump to the last one.
  useEffect(() => {
    if (!data || isPlaceholderData || data.items.length > 0 || data.total === 0 || page <= 1) return;
    const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (lastPage > 1) next.set('page', String(lastPage));
        else next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [data, isPlaceholderData, page, setSearchParams]);

  const setPage = (nextPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextPage > 1) next.set('page', String(nextPage));
      else next.delete('page');
      return next;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setArchived = (archived: boolean) => {
    if (archived === showArchived) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (archived) next.set('active', 'false');
      else next.delete('active');
      next.delete('page');
      return next;
    });
  };

  const clearSearch = () => {
    setSearch('');
    lastAppliedSearch.current = '';
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('q');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  const goToCreate = () => navigate('/customers/new');

  const renderContent = () => {
    if (isPending) return <LoadingState label="Loading customers…" />;
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
      if (q) {
        return (
          <EmptyState
            title={`No customers match “${q}”`}
            description="Try a different name, email or company."
            action={<Button onClick={clearSearch}>Clear search</Button>}
          />
        );
      }
      if (showArchived) {
        return (
          <EmptyState
            title="No archived customers"
            description="Customers you archive will appear here."
            action={<Button onClick={() => setArchived(false)}>Show active customers</Button>}
          />
        );
      }
      return (
        <EmptyState
          title="No customers yet"
          description="Add your first customer, then create a billing plan to start sending bills."
          action={<GradientButton onClick={goToCreate}>New customer</GradientButton>}
        />
      );
    }
    return (
      <Box opacity={isPlaceholderData ? 0.6 : 1} transition="opacity 0.2s">
        <CustomerList customers={data.items} />
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
          isDisabled={isFetching}
          itemLabel="customers"
        />
      </Box>
    );
  };

  return (
    <PageWrapper
      title="Customers"
      subtitle="Everyone you bill, with what they owe."
      actions={<GradientButton onClick={goToCreate}>New customer</GradientButton>}
    >
      <Flex
        mb={5}
        gap={3}
        direction={{ base: 'column', md: 'row' }}
        align={{ base: 'stretch', md: 'center' }}
        justify="space-between"
      >
        <InputGroup maxW={{ base: 'full', md: 'sm' }}>
          <Input
            type="search"
            placeholder="Search name, email or company"
            aria-label="Search customers"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            bg="surface-card"
          />
          {search && (
            <InputRightElement>
              <CloseButton size="sm" aria-label="Clear search text" onClick={clearSearch} />
            </InputRightElement>
          )}
        </InputGroup>
        <ButtonGroup size="sm" isAttached variant="outline" role="group" aria-label="Customer status">
          <Button
            onClick={() => setArchived(false)}
            variant={showArchived ? 'outline' : 'solid'}
            aria-pressed={!showArchived}
          >
            Active
          </Button>
          <Button
            onClick={() => setArchived(true)}
            variant={showArchived ? 'solid' : 'outline'}
            aria-pressed={showArchived}
          >
            Archived
          </Button>
        </ButtonGroup>
      </Flex>
      {renderContent()}
    </PageWrapper>
  );
}
