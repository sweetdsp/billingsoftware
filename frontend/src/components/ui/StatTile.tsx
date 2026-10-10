import { Stat, StatHelpText, StatLabel, StatNumber } from '@chakra-ui/react';
import { GlassCard } from './GlassCard';

export interface StatTileProps {
  label: string;
  /** Already-formatted value (e.g. via formatMoney). */
  value: string;
  helpText?: string;
  /** Highlights the value (e.g. overdue amounts). */
  tone?: 'default' | 'positive' | 'warning' | 'danger';
}

const TONE_COLOR: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: 'text-default',
  positive: 'green.500',
  warning: 'orange.400',
  danger: 'red.400',
};

export function StatTile({ label, value, helpText, tone = 'default' }: StatTileProps) {
  return (
    <GlassCard padding={5}>
      <Stat>
        <StatLabel color="text-muted" fontWeight="medium">
          {label}
        </StatLabel>
        <StatNumber fontSize="2xl" color={TONE_COLOR[tone]}>
          {value}
        </StatNumber>
        {helpText && <StatHelpText mb={0}>{helpText}</StatHelpText>}
      </Stat>
    </GlassCard>
  );
}

export default StatTile;
