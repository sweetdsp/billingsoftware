import {
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Link,
  Select,
} from '@chakra-ui/react';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Link as RouterLink } from 'react-router-dom';
import { useCustomers } from '../../hooks/useCustomers';

/** The form field this select controls (the customer id as text). */
export interface CustomerSelectFormValues {
  customerId: string;
}

export interface CustomerSelectProps {
  isDisabled?: boolean;
  /**
   * Name shown for the selected customer when they are not in the loaded list (e.g. the
   * customer of an existing plan, who may be archived or beyond the first page).
   */
  selectedLabel?: string;
}

const MAX_CUSTOMERS = 100;

/** Dropdown of the user's active customers. Needs a react-hook-form `FormProvider`. */
export function CustomerSelect({ isDisabled = false, selectedLabel }: CustomerSelectProps) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<CustomerSelectFormValues>();
  const { data, isPending, isError } = useCustomers({ active: true, pageSize: MAX_CUSTOMERS });
  const customers = data?.items ?? [];
  const noCustomers = !isPending && !isError && customers.length === 0;
  const current = watch('customerId');
  const inList = customers.some((customer) => String(customer.id) === current);
  const showFallback = Boolean(current) && !inList && (selectedLabel !== undefined || !isPending);

  // A value set before the options exist (default values, ?customerId=) is dropped by the browser.
  // Re-apply it once the options have rendered.
  useEffect(() => {
    if (!isPending && current) setValue('customerId', current);
  }, [isPending, customers.length, current, setValue]);

  return (
    <FormControl isRequired isInvalid={Boolean(errors.customerId)} isDisabled={isDisabled}>
      <FormLabel htmlFor="customerId">Customer</FormLabel>
      <Select
        id="customerId"
        placeholder={isPending ? 'Loading customers…' : 'Select a customer'}
        {...register('customerId')}
      >
        {showFallback && <option value={current}>{selectedLabel ?? `Customer #${current}`}</option>}
        {customers.map((customer) => (
          <option key={customer.id} value={String(customer.id)}>
            {customer.name}
            {customer.companyName ? ` — ${customer.companyName}` : ''}
          </option>
        ))}
      </Select>
      <FormErrorMessage>{errors.customerId?.message}</FormErrorMessage>
      {isError && <FormHelperText color="red.400">Could not load customers.</FormHelperText>}
      {noCustomers && (
        <FormHelperText>
          You have no customers yet.{' '}
          <Link as={RouterLink} to="/customers/new" color="brand.500">
            Add one first
          </Link>
          .
        </FormHelperText>
      )}
    </FormControl>
  );
}

export default CustomerSelect;
