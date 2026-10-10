import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiError } from '../../../test/billingFixtures';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { RecordPaymentModal } from '../RecordPaymentModal';

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  renderWithProviders(
    <RecordPaymentModal
      isOpen
      onClose={onClose}
      currency="USD"
      balanceDue="110.00"
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, onClose, user: userEvent.setup() };
}

describe('RecordPaymentModal', () => {
  it('defaults to the full balance and never offers the online method', async () => {
    setup();
    expect(await screen.findByLabelText(/amount/i)).toHaveValue('110.00');
    const methods = screen.getAllByRole('option').map((option) => option.textContent);
    expect(methods).toEqual(['Bank transfer', 'Cash', 'Cheque', 'Other']);
  });

  it('submits the payment; today is left to the server (no paidAt)', async () => {
    const { onSubmit, user } = setup();
    const amount = await screen.findByLabelText(/amount/i);
    await user.clear(amount);
    await user.type(amount, '40');
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ amount: '40', method: 'bank_transfer', notes: null }),
    );
  });

  it('blocks an amount above the balance without calling the API', async () => {
    const { onSubmit, user } = setup();
    const amount = await screen.findByLabelText(/amount/i);
    await user.clear(amount);
    await user.type(amount, '110.01');
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    expect(await screen.findByText('Cannot be more than the balance due')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects zero and non-numeric amounts', async () => {
    const { onSubmit, user } = setup();
    const amount = await screen.findByLabelText(/amount/i);
    await user.clear(amount);
    await user.type(amount, '0');
    await user.click(screen.getByRole('button', { name: /record payment/i }));
    expect(await screen.findByText('Must be greater than 0')).toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, 'abc');
    await user.click(screen.getByRole('button', { name: /record payment/i }));
    expect(await screen.findByText(/at most 2 decimals/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a friendly message when the server reports an overpayment', async () => {
    const onSubmit = vi.fn().mockRejectedValue(apiError(400, 'x', 'overpayment'));
    const { user } = setup(onSubmit);
    await user.click(await screen.findByRole('button', { name: /record payment/i }));
    expect(await screen.findByText('That is more than the balance due.')).toBeInTheDocument();
  });
});
