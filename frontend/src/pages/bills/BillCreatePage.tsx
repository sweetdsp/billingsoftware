import { useToast } from '@chakra-ui/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BillForm } from '../../components/bills/BillForm';
import { defaultBillValues, toBillCreate, type BillFormValues } from '../../components/bills/billSchema';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { useCreateBill } from '../../hooks/useBills';
import { useBusinessProfile } from '../../hooks/useBusinessProfile';

/** Create a one-off bill (saved as a draft). `?customerId=` pre-selects the customer. */
export default function BillCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const customerId = /^\d+$/.test(searchParams.get('customerId') ?? '')
    ? (searchParams.get('customerId') ?? '')
    : '';
  const { data: profile, isPending } = useBusinessProfile();
  const createBill = useCreateBill();

  const handleSubmit = async (values: BillFormValues) => {
    const bill = await createBill.mutateAsync(toBillCreate(values));
    toast({
      status: 'success',
      title: 'Draft bill created',
      description: `${bill.billNumber} is ready to review and send.`,
    });
    navigate(`/bills/${bill.id}`);
  };

  return (
    <PageWrapper
      title="New bill"
      subtitle="A one-off bill. It's saved as a draft until you send it."
    >
      {isPending ? (
        <LoadingState label="Loading your defaults…" />
      ) : (
        <BillForm
          defaultValues={defaultBillValues(profile, customerId)}
          submitLabel="Create draft"
          onSubmit={handleSubmit}
          onCancel={() => navigate('/bills')}
        />
      )}
    </PageWrapper>
  );
}
