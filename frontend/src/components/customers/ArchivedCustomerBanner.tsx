import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  Button,
  Flex,
  useToast,
} from '@chakra-ui/react';
import { useUpdateCustomer } from '../../hooks/useCustomers';
import { getErrorCode, getErrorMessage } from '../../services/api';
import { CUSTOMER_ERROR_CODES } from '../../services/customerService';

export interface ArchivedCustomerBannerProps {
  customerId: number;
}

/** Warning shown on archived customers, with a Restore action (`PUT {isActive: true}`). */
export function ArchivedCustomerBanner({ customerId }: ArchivedCustomerBannerProps) {
  const toast = useToast();
  const update = useUpdateCustomer();

  const restore = () => {
    update.mutate(
      { id: customerId, data: { isActive: true } },
      {
        onSuccess: (customer) => {
          toast({ status: 'success', title: 'Customer restored', description: customer.name });
        },
        onError: (err) => {
          const description =
            getErrorCode(err) === CUSTOMER_ERROR_CODES.emailExists
              ? 'Another active customer already uses this email. Change this customer’s email, then restore.'
              : getErrorMessage(err);
          toast({ status: 'error', title: 'Could not restore customer', description });
        },
      },
    );
  };

  return (
    <Alert status="warning" borderRadius="md" mb={6} alignItems={{ base: 'flex-start', md: 'center' }}>
      <AlertIcon />
      <Flex
        flex="1"
        gap={3}
        direction={{ base: 'column', md: 'row' }}
        align={{ base: 'flex-start', md: 'center' }}
        justify="space-between"
      >
        <Box>
          <AlertTitle>Archived</AlertTitle>
          <AlertDescription display="block">
            This customer is archived and hidden from your active customers.
          </AlertDescription>
        </Box>
        <Button size="sm" colorScheme="orange" onClick={restore} isLoading={update.isPending}>
          Restore
        </Button>
      </Flex>
    </Alert>
  );
}

export default ArchivedCustomerBanner;
