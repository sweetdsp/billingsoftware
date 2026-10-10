import {
  Box,
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
import type { AgingReport } from '../../types';
import { ChartCard } from './ChartCard';

/** Validated categorical slot 1 (blue); one series, so no legend box is needed. */
const BAR_COLOR = { light: '#2a78d6', dark: '#3987e5' } as const;

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

interface ChartRow {
  label: string;
  amount: number;
  count: number;
}

export interface AgingChartProps {
  report: AgingReport;
}

function AgingTooltip({
  active,
  payload,
  currency,
}: TooltipProps<number, string> & { currency: string }) {
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  return (
    <Box bg="surface-card" borderWidth="1px" borderColor="border-subtle" borderRadius="md" p={3} boxShadow="md">
      <Text fontWeight="semibold" mb={1}>
        {row.label} days overdue
      </Text>
      <Text fontSize="sm">{formatMoney(String(row.amount), currency)}</Text>
      <Text fontSize="sm" color="text-muted">
        {row.count} {row.count === 1 ? 'bill' : 'bills'}
      </Text>
    </Box>
  );
}

/** Unpaid, past-due balance by how many days overdue. Display only. */
export function AgingChart({ report }: AgingChartProps) {
  const barColor = useColorModeValue(BAR_COLOR.light, BAR_COLOR.dark);
  const gridColor = useColorModeValue('#e5e5e1', '#2e2e2c');
  const tickColor = useColorModeValue('#52514e', '#c3c2b7');

  const rows: ChartRow[] = report.buckets.map((bucket) => ({
    label: bucket.label,
    amount: Number(bucket.amount),
    count: bucket.count,
  }));

  const table = (
    <TableContainer>
      <Table size="sm" aria-label="Overdue balance by age">
        <Thead>
          <Tr>
            <Th>Days overdue</Th>
            <Th isNumeric>Bills</Th>
            <Th isNumeric>Amount</Th>
          </Tr>
        </Thead>
        <Tbody>
          {report.buckets.map((bucket) => (
            <Tr key={bucket.label}>
              <Td>{bucket.label}</Td>
              <Td isNumeric>{bucket.count}</Td>
              <Td isNumeric>{formatMoney(bucket.amount, report.currency)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );

  return (
    <ChartCard title="Overdue by age" subtitle="Unpaid balance of past-due bills" table={table}>
      <Box h="14rem" role="img" aria-label="Bar chart of overdue balance by days overdue">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
              content={<AgingTooltip currency={report.currency} />}
            />
            <Bar dataKey="amount" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </ChartCard>
  );
}

export default AgingChart;
