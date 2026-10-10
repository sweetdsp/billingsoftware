import type { AgingReport, AnalyticsSummary, RevenuePoint, TopCustomer } from '../types';
import { api } from './api';

/** `GET /analytics/summary` — headline numbers and the next 7 days of scheduled bills. */
async function getSummary(): Promise<AnalyticsSummary> {
  const { data } = await api.get<AnalyticsSummary>('/analytics/summary');
  return data;
}

/** `GET /analytics/revenue` — billed vs collected per month, oldest first. */
async function getRevenue(months = 12): Promise<RevenuePoint[]> {
  const { data } = await api.get<RevenuePoint[]>('/analytics/revenue', { params: { months } });
  return data;
}

/** `GET /analytics/aging` — unpaid past-due balance by days overdue. */
async function getAging(): Promise<AgingReport> {
  const { data } = await api.get<AgingReport>('/analytics/aging');
  return data;
}

/** `GET /analytics/top-customers` — ranked by payments collected in the last 12 months. */
async function getTopCustomers(limit = 5): Promise<TopCustomer[]> {
  const { data } = await api.get<TopCustomer[]>('/analytics/top-customers', { params: { limit } });
  return data;
}

export const analyticsService = { getSummary, getRevenue, getAging, getTopCustomers };

export default analyticsService;
