import {
  Box,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from '@chakra-ui/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatMoney } from '../../lib/money';
import type { CurrencyCode, RevenuePoint } from '../../types';
import { ChartCard } from './ChartCard';

/** Validated categorical slots 1 and 2 (blue, orange) for light and dark surfaces. */
const BILLED_COLOR = { light: '#2a78d6', dark: '#3987e5' } as const;
const COLLECTED_COLOR = { light: '#eb6834', dark: '#d95926' } as const;

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' });
const monthYearFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** "2026-10" → a local Date for formatting only. */
function monthDate(month: string): Date {
  const [year = '1970', mm = '1'] = month.split('-');
  return new Date(Number(year), Number(mm) - 1, 1);
}

interface ChartRow {
  month: string;
  label: string;
  billed: number;
  collected: number;
}

export interface RevenueChartProps {
  data: RevenuePoint[];
  currency: CurrencyCode;
}

function RevenueTooltip({
  active,
  payload,
  currency,
}: TooltipProps<number, string> & { currency: CurrencyCode }) {
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  return (
    <Box bg="surface-card" borderWidth="1px" borderColor="border-subtle" borderRadius="md" p={3} boxShadow="md">
      <Text fontWeight="semibold" mb={1}>
        {monthYearFormatter.format(monthDate(row.month))}
      </Text>
      <Text fontSize="sm">Billed: {formatMoney(String(row.billed), currency)}</Text>
      <Text fontSize="sm">Collected: {formatMoney(String(row.collected), currency)}</Text>
    </Box>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <HStack spacing={2}>
      <Box w={3} h={3} borderRadius="sm" bg={color} aria-hidden />
      <Text fontSize="sm" color="text-muted">
        {label}
      </Text>
    </HStack>
  );
}

/** Billed vs collected per month (grouped bars). Display only; amounts come from the server. */
export function RevenueChart({ data, currency }: RevenueChartProps) {
  const billedColor = useColorModeValue(BILLED_COLOR.light, BILLED_COLOR.dark);
  const collectedColor = useColorModeValue(COLLECTED_COLOR.light, COLLECTED_COLOR.dark);
  const gridColor = useColorModeValue('#e5e5e1', '#2e2e2c');
  const tickColor = useColorModeValue('#52514e', '#c3c2b7');

  const rows: ChartRow[] = data.map((point) => ({
    month: point.month,
    label: monthFormatter.format(monthDate(point.month)),
    billed: Number(point.billed),
    collected: Number(point.collected),
  }));

  const table = (
    <TableContainer>
      <Table size="sm" aria-label="Billed and collected per month">
        <Thead>
          <Tr>
            <Th>Month</Th>
            <Th isNumeric>Billed</Th>
            <Th isNumeric>Collected</Th>
          </Tr>
        </Thead>
        <Tbody>
          {data.map((point) => (
            <Tr key={point.month}>
              <Td>{monthYearFormatter.format(monthDate(point.month))}</Td>
              <Td isNumeric>{formatMoney(point.billed, currency)}</Td>
              <Td isNumeric>{formatMoney(point.collected, currency)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );

  return (
    <ChartCard title="Revenue" subtitle={`Billed vs collected, last ${data.length} months`} table={table}>
      <HStack spacing={5} mb={3}>
        <Swatch color={billedColor} label="Billed" />
        <Swatch color={collectedColor} label="Collected" />
      </HStack>
      <Box h="16rem" role="img" aria-label="Bar chart of billed and collected revenue per month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={gridColor} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: tickColor, fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: tickColor, fontSize: 12 }}
              tickFormatter={(value: number) => compactFormatter.format(value)}
            />
            <Tooltip
              cursor={{ fill: 'rgba(128,128,128,0.12)' }}
              content={<RevenueTooltip currency={currency} />}
            />
            <Bar dataKey="billed" fill={billedColor} radius={[4, 4, 0, 0]} maxBarSize={20} />
            <Bar dataKey="collected" fill={collectedColor} radius={[4, 4, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </ChartCard>
  );
}

export default RevenueChart;
