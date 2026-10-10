import { Badge } from '@chakra-ui/react';
import type { BillStatus, PlanStatus } from '../../types';

export type BadgeStatus = BillStatus | PlanStatus;

interface StatusStyle {
  colorScheme: string;
  label: string;
}

const STATUS_STYLES: Record<BadgeStatus, StatusStyle> = {
  // BillStatus
  draft: { colorScheme: 'gray', label: 'Draft' },
  sent: { colorScheme: 'blue', label: 'Sent' },
  partially_paid: { colorScheme: 'yellow', label: 'Partially paid' },
  paid: { colorScheme: 'green', label: 'Paid' },
  overdue: { colorScheme: 'red', label: 'Overdue' },
  cancelled: { colorScheme: 'gray', label: 'Cancelled' },
  // PlanStatus
  active: { colorScheme: 'green', label: 'Active' },
  paused: { colorScheme: 'orange', label: 'Paused' },
};

export interface StatusBadgeProps {
  status: BadgeStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];
  return (
    <Badge
      colorScheme={style.colorScheme}
      variant="subtle"
      borderRadius="full"
      px={2.5}
      py={0.5}
      textTransform="none"
      fontWeight="semibold"
    >
      {style.label}
    </Badge>
  );
}

export default StatusBadge;
