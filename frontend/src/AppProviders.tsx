import { ChakraProvider } from '@chakra-ui/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from './context/AuthContext';
import theme from './theme';

export interface AppProvidersProps {
  children: ReactNode;
  queryClient: QueryClient;
}

/**
 * Chakra + React Query + Auth providers. The router is provided by the caller
 * (BrowserRouter in main.tsx, MemoryRouter in tests).
 */
export function AppProviders({ children, queryClient }: AppProvidersProps) {
  return (
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </ChakraProvider>
  );
}

export default AppProviders;
