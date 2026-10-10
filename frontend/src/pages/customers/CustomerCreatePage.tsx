import { useToast } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { CustomerForm } from '../../components/customers/CustomerForm';
import { toCustomerCreate, type CustomerFormValues } from '../../components/customers/customerSchema';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { useCreateCustomer } from '../../hooks/useCustomers';

/** Add a customer, then go to their detail page. */
export default function CustomerCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const createCustomer = useCreateCustomer();

  const handleSubmit = async (values: CustomerFormValues) => {
    const customer = await createCustomer.mutateAsync(toCustomerCreate(values));
    toast({ status: 'success', title: 'Customer created', description: customer.name });
    navigate(`/customers/${customer.id}`);
  };

  return (
    <PageWrapper title="New customer" subtitle="Who are you billing? Bills are emailed to them.">
      <CustomerForm
        submitLabel="Create customer"
        onSubmit={handleSubmit}
        onCancel={() => navigate('/customers')}
      />
    </PageWrapper>
  );
}
