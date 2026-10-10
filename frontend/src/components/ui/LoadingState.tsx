import { Center, Spinner, Stack, Text } from '@chakra-ui/react';

export interface LoadingStateProps {
  label?: string;
  /** Fill the viewport (used while the session is being restored). */
  fullScreen?: boolean;
}

export function LoadingState({ label = 'Loading…', fullScreen = false }: LoadingStateProps) {
  return (
    <Center minH={fullScreen ? '100vh' : '40'} w="full" role="status" aria-live="polite">
      <Stack align="center" spacing={3}>
        <Spinner size="lg" thickness="3px" color="brand.500" emptyColor="border-subtle" />
        <Text color="text-muted" fontSize="sm">
          {label}
        </Text>
      </Stack>
    </Center>
  );
}

export default LoadingState;
