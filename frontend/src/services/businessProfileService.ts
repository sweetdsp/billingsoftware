import type { BusinessProfile, BusinessProfileInput } from '../types';
import { api, getErrorCode, getErrorStatus } from './api';

/** Backend error code returned by `GET /business-profile` before onboarding. */
export const PROFILE_NOT_FOUND_CODE = 'profile_not_found';

/**
 * `GET /business-profile`. Resolves to `null` (instead of throwing) when the user has not
 * created a profile yet (404 `profile_not_found`).
 */
export async function getBusinessProfile(): Promise<BusinessProfile | null> {
  try {
    const { data } = await api.get<BusinessProfile>('/business-profile');
    return data;
  } catch (err: unknown) {
    if (getErrorStatus(err) === 404 && getErrorCode(err) === PROFILE_NOT_FOUND_CODE) {
      return null;
    }
    throw err;
  }
}

/** `PUT /business-profile` (create or update). */
export async function upsertBusinessProfile(input: BusinessProfileInput): Promise<BusinessProfile> {
  const { data } = await api.put<BusinessProfile>('/business-profile', input);
  return data;
}
