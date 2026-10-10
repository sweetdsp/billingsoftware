import { ColorModeScript } from '@chakra-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProviders } from './AppProviders';
import { createQueryClient } from './lib/queryClient';
import { themeConfig } from './theme';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

const queryClient = createQueryClient();

createRoot(rootElement).render(
  <StrictMode>
    <ColorModeScript initialColorMode={themeConfig.initialColorMode} />
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProviders queryClient={queryClient}>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
