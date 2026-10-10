import { Alert, AlertDescription, AlertIcon, Button, useToast } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { BillForm } from '../../components/bills/BillForm';
import { billToFormValues, toBillUpdate, type BillFormValues } from '../../components/bills/billSchema';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { ResourceLoadError } from '../../components/ui/ResourceLoadError';
import { useBill, useUpdateBill } from '../../hooks/useBills';
import { useIdParam } from '../../hooks/useIdParam';

/** Edit a draft bill. Sent bills can no longer be edited (they can only be cancelled). */
export default function BillEditPage() {
  const id = useIdParam();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: bill, isPending, error, refetch } = useBill(id);
  const updateBill = useUpdateBill();

  if (id === undefined || (error && !bill)) {
    return (
      <PageWrapper>
        <ResourceLoadError
          entity="bill"
          backTo="/bills"
          backLabel="Back to bills"
          error={id === undefined ? null : error}
          onRetry={() => void refetch()}
        />
      </PageWrapper>
    );
  }
  if (isPending || !bill) {
    return (
      <PageWrapper>
        <LoadingState label="Loading bill…" />
      </PageWrapper>
    );
  }
  if (bill.status !== 'draft') {
    return (
      <PageWrapper>
        <EmptyState
          title="This bill can't be edited"
          description="Only draft bills can be edited. A bill that has been sent can only be cancelled."
          action={<Button onClick={() => navigate(`/bills/${bill.id}`)}>Back to the bill</Button>}
        />
      </PageWrapper>
    );
  }

  const handleSubmit = async (values: BillFormValues) => {
    await updateBill.mutateAsync({ id: bill.id, data: toBillUpdate(values) });
    toast({ status: 'success', title: 'Bill updated' });
    navigate(`/bills/${bill.id}`);
  };

  return (
    <PageWrapper title={`Edit ${bill.billNumber}`} subtitle={`For ${bill.customerName}`}>
      <Alert status="info" borderRadius="md" mb={5}>
        <AlertIcon />
        <AlertDescription>
          Totals are recalculated when you save. The PDF is regenerated the next time you send it.
        </AlertDescription>
      </Alert>
      <BillForm
        defaultValues={billToFormValues(bill)}
        submitLabel="Save changes"
        customerName={bill.customerName}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/bills/${bill.id}`)}
      />
    </PageWrapper>
  );
}
