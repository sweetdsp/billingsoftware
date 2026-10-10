import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Vitest globals are disabled, so React Testing Library cannot auto-register cleanup.
afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // Storage unavailable in this environment.
  }
});

// jsdom does not implement matchMedia; Chakra's color mode ("system") and framer-motion need it.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
}

// jsdom's scrollTo only logs "not implemented"; Chakra Drawer/Modal and routers may call it.
Object.defineProperty(window, 'scrollTo', { writable: true, configurable: true, value: vi.fn() });
