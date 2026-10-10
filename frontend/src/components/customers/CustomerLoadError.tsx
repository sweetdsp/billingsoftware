import { Alert, AlertDescription, AlertIcon, Button, Stack } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { getErrorCode, getErrorMessage, getErrorStatus } from '../../services/api';
import { CUSTOMER_ERROR_CODES } from '../../services/customerService';
import { EmptyState } from '../ui/EmptyState';

export interface CustomerLoadErrorProps {
  /** The query error, or `null` when the route id itself is invalid. */
  error: Error | null;
  onRetry?: () => void;
}

/** "Customer not found" (404 / invalid id) or a generic retryable error. */
export function CustomerLoadError({ error, onRetry }: CustomerLoadErrorProps) {
  const navigate = useNavigate();
  const notFound =
    error === null ||
    getErrorStatus(error) === 404 ||
    getErrorCode(error) === CUSTOMER_ERROR_CODES.notFound;

  if (notFound) {
    return (
      <EmptyState
        title="Customer not found"
        description="This customer doesn't exist or you don't have access to it."
        action={<Button onClick={() => navigate('/customers')}>Back to customers</Button>}
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

export default CustomerLoadError;
