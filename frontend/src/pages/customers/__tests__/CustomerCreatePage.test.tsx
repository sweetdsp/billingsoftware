import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_EXISTS_MESSAGE } from '../../../components/customers/CustomerForm';
import { customerService } from '../../../services/customerService';
import { renderWithProviders } from '../../../test/renderWithProviders';
import CustomerCreatePage from '../CustomerCreatePage';
import { makeApiError, makeListItem } from './fixtures';

vi.mock('../../../services/customerService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/customerService')>();
  return {
    ...actual,
    customerService: {
      listCustomers: vi.fn(),
      getCustomer: vi.fn(),
      createCustomer: vi.fn(),
      updateCustomer: vi.fn(),
      archiveCustomer: vi.fn(),
    },
  };
});

const createCustomer = vi.mocked(customerService.createCustomer);

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/customers/new" element={<CustomerCreatePage />} />
      <Route path="/customers/:id" element={<p>Customer detail route</p>} />
    </Routes>,
    { route: '/customers/new' },
  );
}

describe('CustomerCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates required fields and email format before calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Create customer' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /^email/i }), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it('shows 409 customer_email_exists inline on the email field', async () => {
    createCustomer.mockRejectedValue(
      makeApiError(409, 'A customer with this email already exists', 'customer_email_exists'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: /^name/i }), 'Jane Doe');
    await user.type(screen.getByRole('textbox', { name: /^email/i }), 'jane@example.test');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));

    expect(await screen.findByText(EMAIL_EXISTS_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^email/i })).toHaveAttribute('aria-invalid', 'true');
  });

  it('creates the customer with trimmed values and navigates to its detail page', async () => {
    createCustomer.mockResolvedValue(makeListItem({ id: 42, name: 'Jane Doe' }));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: /^name/i }), '  Jane Doe ');
    await user.type(screen.getByRole('textbox', { name: /^email/i }), 'jane@example.test');
    await user.type(screen.getByRole('textbox', { name: /^company/i }), 'Doe Gym');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));

    expect(await screen.findByText('Customer detail route')).toBeInTheDocument();
    await waitFor(() =>
      expect(createCustomer).toHaveBeenCalledWith({
        name: 'Jane Doe',
        email: 'jane@example.test',
        companyName: 'Doe Gym',
      }),
    );
  });
});
