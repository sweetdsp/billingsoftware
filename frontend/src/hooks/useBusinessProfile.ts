import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getBusinessProfile, upsertBusinessProfile } from '../services/businessProfileService';
import type { BusinessProfile, BusinessProfileInput } from '../types';

export const businessProfileKeys = {
  all: ['business-profile'] as const,
};

/** The current user's business profile; `data` is `null` before onboarding (404 profile_not_found). */
export function useBusinessProfile() {
  return useQuery<BusinessProfile | null>({
    queryKey: businessProfileKeys.all,
    queryFn: getBusinessProfile,
  });
}

/** `PUT /business-profile`; updates the cache with the saved profile and invalidates it. */
export function useUpsertBusinessProfile() {
  const queryClient = useQueryClient();
  return useMutation<BusinessProfile, unknown, BusinessProfileInput>({
    mutationFn: (input: BusinessProfileInput) => upsertBusinessProfile(input),
    onSuccess: (profile) => {
      queryClient.setQueryData(businessProfileKeys.all, profile);
      void queryClient.invalidateQueries({ queryKey: businessProfileKeys.all });
    },
  });
}
