import { Heading, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { GlassCard } from './GlassCard';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Optional call to action, e.g. a GradientButton. */
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <GlassCard padding={10} hoverLift={false}>
      <Stack spacing={3} align="center" textAlign="center">
        <Heading as="h2" size="md">
          {title}
        </Heading>
        {description && (
          <Text color="text-muted" maxW="md">
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </GlassCard>
  );
}

export default EmptyState;
