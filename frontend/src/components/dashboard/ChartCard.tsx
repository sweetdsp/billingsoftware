import { Box, Button, Flex, Heading, Text } from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';
import { GlassCard } from '../ui/GlassCard';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** The chart. */
  children: ReactNode;
  /** Accessible, text version of the same data (shown when the viewer toggles "Table"). */
  table: ReactNode;
}

/** A titled chart container with a "Chart / Table" toggle so the data is never color-only. */
export function ChartCard({ title, subtitle, children, table }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  return (
    <GlassCard hoverLift={false}>
      <Flex justify="space-between" align="flex-start" gap={3} mb={4}>
        <Box>
          <Heading as="h2" size="md">
            {title}
          </Heading>
          {subtitle && (
            <Text fontSize="sm" color="text-muted">
              {subtitle}
            </Text>
          )}
        </Box>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setShowTable((value) => !value)}
          aria-pressed={showTable}
        >
          {showTable ? 'Show chart' : 'Show table'}
        </Button>
      </Flex>
      {showTable ? table : children}
    </GlassCard>
  );
}

export default ChartCard;
