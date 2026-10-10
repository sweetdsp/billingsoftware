import { Button, ButtonGroup, Flex, Text } from '@chakra-ui/react';

export interface PaginationProps {
  /** Current 1-based page. */
  page: number;
  /** Items per page (as returned by the API's `pageSize`). */
  pageSize: number;
  /** Total number of items across all pages (the API's `total`). */
  total: number;
  /** Called with the new 1-based page number. */
  onPageChange: (page: number) => void;
  /** Disable both buttons (e.g. while a page is fetching). */
  isDisabled?: boolean;
  /** Plural noun used in the summary, e.g. "customers". Defaults to "items". */
  itemLabel?: string;
}

/**
 * Generic previous/next pagination for `Page<T>` responses (`{items, total, page, pageSize}`).
 *
 * Renders "Showing 21–40 of 95 customers" plus Previous/Next buttons. Renders nothing when the
 * list is empty. Buttons are hidden when everything fits on one page.
 *
 * @example
 * <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  isDisabled = false,
  itemLabel = 'items',
}: PaginationProps) {
  if (total <= 0) return null;

  const safePageSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = (current - 1) * safePageSize + 1;
  const to = Math.min(current * safePageSize, total);

  return (
    <Flex
      as="nav"
      aria-label="Pagination"
      mt={4}
      gap={3}
      align={{ base: 'stretch', sm: 'center' }}
      justify="space-between"
      direction={{ base: 'column', sm: 'row' }}
    >
      <Text color="text-muted" fontSize="sm">
        Showing {from}–{to} of {total} {itemLabel}
      </Text>
      {pageCount > 1 && (
        <Flex align="center" gap={3} justify={{ base: 'space-between', sm: 'flex-end' }}>
          <Text fontSize="sm" color="text-muted" aria-live="polite">
            Page {current} of {pageCount}
          </Text>
          <ButtonGroup size="sm" variant="outline" isAttached>
            <Button
              onClick={() => onPageChange(current - 1)}
              isDisabled={isDisabled || current <= 1}
              aria-label="Previous page"
            >
              Previous
            </Button>
            <Button
              onClick={() => onPageChange(current + 1)}
              isDisabled={isDisabled || current >= pageCount}
              aria-label="Next page"
            >
              Next
            </Button>
          </ButtonGroup>
        </Flex>
      )}
    </Flex>
  );
}

export default Pagination;
