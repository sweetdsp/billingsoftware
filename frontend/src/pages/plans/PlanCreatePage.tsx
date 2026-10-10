import { useToast } from '@chakra-ui/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlanForm } from '../../components/plans/PlanForm';
import { defaultPlanValues, toPlanCreate, type PlanFormValues } from '../../components/plans/planSchema';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageWrapper } from '../../components/ui/PageWrapper';
import { useBusinessProfile } from '../../hooks/useBusinessProfile';
import { useCreatePlan } from '../../hooks/usePlans';

/** Create a billing plan. `?customerId=` pre-selects the customer. */
export default function PlanCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const customerId = /^\d+$/.test(searchParams.get('customerId') ?? '')
    ? (searchParams.get('customerId') ?? '')
    : '';
  const { data: profile, isPending } = useBusinessProfile();
  const createPlan = useCreatePlan();

  const handleSubmit = async (values: PlanFormValues) => {
    const plan = await createPlan.mutateAsync(toPlanCreate(values));
    toast({ status: 'success', title: 'Plan created', description: plan.name });
    navigate(`/plans/${plan.id}`);
  };

  return (
    <PageWrapper
      title="New billing plan"
      subtitle="Set it up once. Bill Maker generates and sends every bill on schedule."
    >
      {isPending ? (
        <LoadingState label="Loading your defaults…" />
      ) : (
        <PlanForm
          defaultValues={defaultPlanValues(profile, customerId)}
          submitLabel="Create plan"
          onSubmit={handleSubmit}
          onCancel={() => navigate('/plans')}
        />
      )}
    </PageWrapper>
  );
}
