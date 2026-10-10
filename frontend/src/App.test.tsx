import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
import { renderWithProviders } from './test/renderWithProviders';

describe('App routing', () => {
  it('renders the login page at /login', async () => {
    renderWithProviders(<App />, { route: '/login' });

    expect(await screen.findByRole('heading', { level: 1, name: /login/i })).toBeInTheDocument();
  });

  it('redirects signed-out users from a protected route to /login', async () => {
    renderWithProviders(<App />, { route: '/dashboard' });

    expect(await screen.findByRole('heading', { level: 1, name: /login/i })).toBeInTheDocument();
  });

  it('renders the 404 page for unknown routes', async () => {
    renderWithProviders(<App />, { route: '/does-not-exist' });

    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});
