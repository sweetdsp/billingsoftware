import { Divider, Flex, Stack, Text } from '@chakra-ui/react';
import { formatMoney } from '../../lib/money';
import type { CurrencyCode, DecimalString, Money } from '../../types';

export interface TotalsSummaryProps {
  currency: CurrencyCode;
  subtotal: Money;
  taxRate: DecimalString;
  taxAmount: Money;
  total: Money;
  /** Optional extra rows between the total and the end (e.g. paid / balance due). */
  extra?: Array<{ label: string; value: Money; emphasize?: boolean }>;
  /** Shown under the totals, e.g. "Estimate — the server calculates the final amounts". */
  note?: string;
}

/** Subtotal / tax / total block. Display only: all values come from the server or an estimate. */
export function TotalsSummary({
  currency,
  subtotal,
  taxRate,
  taxAmount,
  total,
  extra = [],
  note,
}: TotalsSummaryProps) {
  const row = (label: string, value: Money, emphasize = false) => (
    <Flex key={label} justify="space-between" gap={6}>
      <Text color={emphasize ? 'text-default' : 'text-muted'} fontWeight={emphasize ? 'bold' : undefined}>
        {label}
      </Text>
      <Text fontWeight={emphasize ? 'bold' : 'medium'}>{formatMoney(value, currency)}</Text>
    </Flex>
  );

  return (
    <Stack spacing={2} minW={{ base: 'full', sm: '16rem' }} ml={{ base: 0, sm: 'auto' }}>
      {row('Subtotal', subtotal)}
      {row(`Tax (${Number(taxRate) || 0}%)`, taxAmount)}
      <Divider />
      {row('Total', total, true)}
      {extra.map((item) => row(item.label, item.value, item.emphasize))}
      {note && (
        <Text fontSize="xs" color="text-muted">
          {note}
        </Text>
      )}
    </Stack>
  );
}

export default TotalsSummary;
