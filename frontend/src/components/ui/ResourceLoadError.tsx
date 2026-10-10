import { Alert, AlertDescription, AlertIcon, Button, Stack } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage, getErrorStatus } from '../../services/api';
import { EmptyState } from './EmptyState';

export interface ResourceLoadErrorProps {
  /** Lowercase singular noun, e.g. "bill". */
  entity: string;
  /** Where "Back to …" goes, e.g. "/bills". */
  backTo: string;
  /** Label for the back button, e.g. "Back to bills". */
  backLabel: string;
  /** The query error, or `null` when the route id itself is invalid. */
  error: Error | null;
  onRetry?: () => void;
}

/** "Not found" (404 / invalid id) or a generic retryable error for a detail page. */
export function ResourceLoadError({
  entity,
  backTo,
  backLabel,
  error,
  onRetry,
}: ResourceLoadErrorProps) {
  const navigate = useNavigate();
  const notFound = error === null || getErrorStatus(error) === 404;

  if (notFound) {
    return (
      <EmptyState
        title={`${entity.charAt(0).toUpperCase()}${entity.slice(1)} not found`}
        description={`This ${entity} doesn't exist or you don't have access to it.`}
        action={<Button onClick={() => navigate(backTo)}>{backLabel}</Button>}
      />
    );
  }

  return (
    <Stack spacing={4} align="flex-start">
      <Alert status="error" borderRadius="md">
        <AlertIcon />
        <AlertDescription>{getErrorMessage(error)}</AlertDescription>
      </Alert>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </Stack>
  );
}

export default ResourceLoadError;
