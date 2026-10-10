import {
  Box,
  Flex,
  Stack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useBreakpointValue,
} from '@chakra-ui/react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from './GlassCard';

export interface DataColumn<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  isNumeric?: boolean;
}

export interface DataListProps<T> {
  items: T[];
  /** The first column is the row's title on mobile cards; the rest become label/value rows. */
  columns: DataColumn<T>[];
  getKey: (item: T) => string | number;
  /** Row link target (the whole row is clickable and keyboard-focusable). */
  getHref?: (item: T) => string;
  /** Accessible name of the table. */
  caption: string;
}

/** A table on md+ screens and stacked cards on mobile. Presentational and generic. */
export function DataList<T>({ items, columns, getKey, getHref, caption }: DataListProps<T>) {
  const navigate = useNavigate();
  const layout = useBreakpointValue<'cards' | 'table'>(
    { base: 'cards', md: 'table' },
    { ssr: false },
  );

  const open = (item: T) => {
    if (getHref) navigate(getHref(item));
  };
  const onKeyDown = (event: KeyboardEvent, item: T) => {
    if (event.key === 'Enter') open(item);
  };

  if (layout === 'table') {
    return (
      <GlassCard padding={0} hoverLift={false}>
        <TableContainer>
          <Table variant="simple" size="md" aria-label={caption}>
            <Thead>
              <Tr>
                {columns.map((column) => (
                  <Th key={column.key} isNumeric={column.isNumeric}>
                    {column.header}
                  </Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {items.map((item) => (
                <Tr
                  key={getKey(item)}
                  cursor={getHref ? 'pointer' : undefined}
                  tabIndex={getHref ? 0 : undefined}
                  _hover={getHref ? { bg: 'surface-hover' } : undefined}
                  _focusVisible={{ bg: 'surface-hover', outline: 'none' }}
                  onClick={() => open(item)}
                  onKeyDown={(event) => onKeyDown(event, item)}
                >
                  {columns.map((column) => (
                    <Td key={column.key} isNumeric={column.isNumeric}>
                      {column.render(item)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </GlassCard>
    );
  }

  const [primary, ...rest] = columns;
  return (
    <Stack spacing={3} role="list" aria-label={caption}>
      {items.map((item) => (
        <Box
          key={getKey(item)}
          role="listitem"
          p={4}
          bg="surface-glass"
          borderWidth="1px"
          borderColor="border-subtle"
          borderRadius="card"
          boxShadow="card"
          cursor={getHref ? 'pointer' : undefined}
          tabIndex={getHref ? 0 : undefined}
          onClick={() => open(item)}
          onKeyDown={(event) => onKeyDown(event, item)}
        >
          {primary && <Box mb={2}>{primary.render(item)}</Box>}
          <Stack spacing={1}>
            {rest.map((column) => (
              <Flex key={column.key} justify="space-between" gap={4} fontSize="sm">
                <Text color="text-muted">{column.header}</Text>
                <Box textAlign="right">{column.render(item)}</Box>
              </Flex>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

export default DataList;
