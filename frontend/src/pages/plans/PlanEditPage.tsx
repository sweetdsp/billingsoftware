import { Alert, AlertDescription, AlertIcon, useToast } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { PlanForm } from '../../components/plans/PlanForm';
import { planToFormValues, toPlanUpdate, type PlanFormValues } from '../../components/plans/planSchema';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { ResourceLoadError } from '../../components/ui/ResourceLoadError';
import { useIdParam } from '../../hooks/useIdParam';
import { usePlan, useUpdatePlan } from '../../hooks/usePlans';

/** Edit a billing plan. Changes apply to future bills only; existing bills are never altered. */
export default function PlanEditPage() {
  const id = useIdParam();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: plan, isPending, error, refetch } = usePlan(id);
  const updatePlan = useUpdatePlan();

  const notFound = (
    <ResourceLoadError
      entity="plan"
      backTo="/plans"
      backLabel="Back to plans"
      error={id === undefined ? null : error}
      onRetry={() => void refetch()}
    />
  );
  if (id === undefined || (error && !plan)) return <PageWrapper>{notFound}</PageWrapper>;
  if (isPending || !plan) {
    return (
      <PageWrapper>
        <LoadingState label="Loading plan…" />
      </PageWrapper>
    );
  }

  const handleSubmit = async (values: PlanFormValues) => {
    await updatePlan.mutateAsync({ id: plan.id, data: toPlanUpdate(values, plan) });
    toast({ status: 'success', title: 'Plan updated' });
    navigate(`/plans/${plan.id}`);
  };

  return (
    <PageWrapper title={`Edit ${plan.name}`} subtitle={`For ${plan.customerName}`}>
      <Alert status="info" borderRadius="md" mb={5}>
        <AlertIcon />
        <AlertDescription>
          Changes apply to future bills only. Bills that were already generated stay as they are.
        </AlertDescription>
      </Alert>
      <PlanForm
        defaultValues={planToFormValues(plan)}
        submitLabel="Save changes"
        lockCustomer
        customerName={plan.customerName}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/plans/${plan.id}`)}
      />
    </PageWrapper>
  );
}
