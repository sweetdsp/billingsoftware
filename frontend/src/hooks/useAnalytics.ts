import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { analyticsService } from '../services/analyticsService';
import type { AgingReport, AnalyticsSummary, RevenuePoint, TopCustomer } from '../types';

export const analyticsKeys = {
  all: ['analytics'] as const,
  summary: () => [...analyticsKeys.all, 'summary'] as const,
  revenue: (months: number) => [...analyticsKeys.all, 'revenue', months] as const,
  aging: () => [...analyticsKeys.all, 'aging'] as const,
  topCustomers: (limit: number) => [...analyticsKeys.all, 'top-customers', limit] as const,
};

export function useAnalyticsSummary(): UseQueryResult<AnalyticsSummary, Error> {
  return useQuery({ queryKey: analyticsKeys.summary(), queryFn: analyticsService.getSummary });
}

export function useRevenue(months = 12): UseQueryResult<RevenuePoint[], Error> {
  return useQuery({
    queryKey: analyticsKeys.revenue(months),
    queryFn: () => analyticsService.getRevenue(months),
  });
}

export function useAging(): UseQueryResult<AgingReport, Error> {
  return useQuery({ queryKey: analyticsKeys.aging(), queryFn: analyticsService.getAging });
}

export function useTopCustomers(limit = 5): UseQueryResult<TopCustomer[], Error> {
  return useQuery({
    queryKey: analyticsKeys.topCustomers(limit),
    queryFn: () => analyticsService.getTopCustomers(limit),
  });
}
