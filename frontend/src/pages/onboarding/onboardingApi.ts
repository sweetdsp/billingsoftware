import { api } from '../../services/api';
import type { Customer, CustomerCreate } from '../../types';

/**
 * `POST /customers` for the onboarding "first customer" step. Kept local to onboarding so it
 * does not depend on the customers module's service while that is built in parallel.
 */
export async function createFirstCustomer(input: CustomerCreate): Promise<Customer> {
  const { data } = await api.post<Customer>('/customers', input);
  return data;
}
