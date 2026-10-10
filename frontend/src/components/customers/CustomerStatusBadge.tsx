import { Badge } from '@chakra-ui/react';

export interface CustomerStatusBadgeProps {
  isActive: boolean;
}

/** Active / Archived pill, styled like the shared StatusBadge. */
export function CustomerStatusBadge({ isActive }: CustomerStatusBadgeProps) {
  return (
    <Badge
      colorScheme={isActive ? 'green' : 'gray'}
      variant="subtle"
      borderRadius="full"
      px={2.5}
      py={0.5}
      textTransform="none"
      fontWeight="semibold"
    >
      {isActive ? 'Active' : 'Archived'}
    </Badge>
  );
}

export default CustomerStatusBadge;
