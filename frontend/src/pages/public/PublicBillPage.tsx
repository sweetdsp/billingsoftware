import { Text } from '@chakra-ui/react';
import { PageWrapper } from '../../components/ui/PageWrapper';

/** Public read-only bill with a pay now link. TODO(phase2): implement. */
export default function PublicBillPage() {
  return (
    <PageWrapper title="Your bill — coming in Phase 2">
      <Text color="text-muted">Public read-only bill with a pay now link</Text>
    </PageWrapper>
  );
}
