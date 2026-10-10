import {
  Box,
  Flex,
  LinkBox,
  LinkOverlay,
  Stack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  useBreakpointValue,
} from '@chakra-ui/react';
import type { KeyboardEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { isZeroMoney } from '../../lib/money';
import type { CustomerListItem } from '../../types';
import { GlassCard } from '../ui/GlassCard';
import { MIXED_CURRENCY_HINT, formatPlainAmount } from './customerFormat';

export interface CustomerListProps {
  customers: CustomerListItem[];
}

function BalanceLabel() {
  return (
    <Tooltip label={MIXED_CURRENCY_HINT} hasArrow placement="top">
      <Text as="span" borderBottomWidth="1px" borderBottomStyle="dashed" cursor="help">
        Balance due
      </Text>
    </Tooltip>
  );
}

function CustomerTable({ customers }: CustomerListProps) {
  const navigate = useNavigate();

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, id: number) => {
    if (event.key === 'Enter') navigate(`/customers/${id}`);
  };

  return (
    <GlassCard padding={0} hoverLift={false}>
      <TableContainer>
        <Table variant="simple" size="md">
          <Thead>
            <Tr>
              <Th>Customer</Th>
              <Th>Email</Th>
              <Th isNumeric>Active plans</Th>
              <Th isNumeric>
                <BalanceLabel />
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {customers.map((customer) => (
              <Tr
                key={customer.id}
                cursor="pointer"
                tabIndex={0}
                _hover={{ bg: 'surface-hover' }}
                _focusVisible={{ bg: 'surface-hover', outline: 'none' }}
                onClick={() => navigate(`/customers/${customer.id}`)}
                onKeyDown={(event) => onRowKeyDown(event, customer.id)}
              >
                <Td>
                  <Text fontWeight="semibold">{customer.name}</Text>
                  {customer.companyName && (
                    <Text fontSize="sm" color="text-muted">
                      {customer.companyName}
                    </Text>
                  )}
                </Td>
                <Td color="text-muted">{customer.email}</Td>
                <Td isNumeric>{customer.activePlanCount}</Td>
                <Td
                  isNumeric
                  fontWeight="medium"
                  color={isZeroMoney(customer.balanceDue) ? 'text-muted' : 'text-default'}
                >
                  {formatPlainAmount(customer.balanceDue)}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </GlassCard>
  );
}

function CustomerCards({ customers }: CustomerListProps) {
  return (
    <Stack spacing={3}>
      {customers.map((customer) => (
        <LinkBox
          key={customer.id}
          as="article"
          p={4}
          bg="surface-glass"
          borderWidth="1px"
          borderColor="border-subtle"
          borderRadius="card"
          boxShadow="card"
          _hover={{ boxShadow: 'card-hover' }}
        >
          <Flex justify="space-between" gap={3} align="flex-start">
            <Box minW={0}>
              <LinkOverlay as={RouterLink} to={`/customers/${customer.id}`}>
                <Text fontWeight="semibold" noOfLines={1}>
                  {customer.name}
                </Text>
              </LinkOverlay>
              {customer.companyName && (
                <Text fontSize="sm" color="text-muted" noOfLines={1}>
                  {customer.companyName}
                </Text>
              )}
              <Text fontSize="sm" color="text-muted" noOfLines={1}>
                {customer.email}
              </Text>
            </Box>
            <Box textAlign="right" flexShrink={0}>
              <Text fontSize="xs" color="text-muted">
                <BalanceLabel />
              </Text>
              <Text fontWeight="semibold">{formatPlainAmount(customer.balanceDue)}</Text>
            </Box>
          </Flex>
          <Text mt={2} fontSize="sm" color="text-muted">
            {customer.activePlanCount} active {customer.activePlanCount === 1 ? 'plan' : 'plans'}
          </Text>
        </LinkBox>
      ))}
    </Stack>
  );
}

/** Customer list: a table on md+ screens, stacked cards on mobile. Rows link to the detail page. */
export function CustomerList({ customers }: CustomerListProps) {
  const layout = useBreakpointValue<'cards' | 'table'>(
    { base: 'cards', md: 'table' },
    { ssr: false },
  );
  return layout === 'table' ? (
    <CustomerTable customers={customers} />
  ) : (
    <CustomerCards customers={customers} />
  );
}

export default CustomerList;
