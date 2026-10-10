import { useToast } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { ArchivedCustomerBanner } from '../../components/customers/ArchivedCustomerBanner';
import { CustomerForm } from '../../components/customers/CustomerForm';
import { CustomerLoadError } from '../../components/customers/CustomerLoadError';
import {
  customerToFormValues,
  toCustomerUpdate,
  type CustomerFormValues,
} from '../../components/customers/customerSchema';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { useCustomer, useCustomerIdParam, useUpdateCustomer } from '../../hooks/useCustomers';

/** Update customer details. Archived customers show a banner with a Restore action. */
export default function CustomerEditPage() {
  const id = useCustomerIdParam();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: customer, isPending, error, refetch } = useCustomer(id);
  const updateCustomer = useUpdateCustomer();

  if (id === undefined) {
    return (
      <PageWrapper title="Edit customer">
        <CustomerLoadError error={null} />
      </PageWrapper>
    );
  }
  if (error && !customer) {
    return (
      <PageWrapper title="Edit customer">
        <CustomerLoadError error={error} onRetry={() => void refetch()} />
      </PageWrapper>
    );
  }
  if (isPending || !customer) {
    return (
      <PageWrapper title="Edit customer">
        <LoadingState label="Loading customer…" />
      </PageWrapper>
    );
  }

  const handleSubmit = async (values: CustomerFormValues) => {
    const updated = await updateCustomer.mutateAsync({ id, data: toCustomerUpdate(values) });
    toast({ status: 'success', title: 'Customer updated', description: updated.name });
    navigate(`/customers/${id}`);
  };

  return (
    <PageWrapper title={`Edit ${customer.name}`} subtitle={customer.companyName ?? undefined}>
      {!customer.isActive && <ArchivedCustomerBanner customerId={id} />}
      <CustomerForm
        key={customer.id}
        defaultValues={customerToFormValues(customer)}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/customers/${id}`)}
      />
    </PageWrapper>
  );
}
