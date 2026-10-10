import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { billService } from '../../../services/billService';
import { apiError, makeBillDetail, makePayment } from '../../../test/billingFixtures';
import { renderWithProviders } from '../../../test/renderWithProviders';
import BillDetailPage from '../BillDetailPage';

vi.mock('../../../services/billService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/billService')>();
  return {
    ...actual,
    billService: {
      getBill: vi.fn(),
      sendBill: vi.fn(),
      remindBill: vi.fn(),
      cancelBill: vi.fn(),
      downloadPdf: vi.fn(),
    },
  };
});

const getBill = vi.mocked(billService.getBill);
const sendBill = vi.mocked(billService.sendBill);
const cancelBill = vi.mocked(billService.cancelBill);

function renderPage(id = 11) {
  return renderWithProviders(
    <Routes>
      <Route path="/bills/:id" element={<BillDetailPage />} />
    </Routes>,
    { route: `/bills/${id}` },
  );
}

const names = (...labels: string[]) => labels.map((label) => new RegExp(`^${label}$`, 'i'));

describe('BillDetailPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers Edit / Send / Cancel for a draft, and no payment actions', async () => {
    getBill.mockResolvedValue(makeBillDetail({ status: 'draft', sentAt: null }));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'INV-00011' })).toBeInTheDocument();
    for (const label of names('Edit', 'Send to customer', 'Cancel bill', 'Download PDF')) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument();
    expect(screen.getByText('Available once sent')).toBeInTheDocument();
  });

  it('offers payment actions for a sent bill and hides Edit', async () => {
    getBill.mockResolvedValue(makeBillDetail({ status: 'sent' }));
    renderPage();

    await screen.findByRole('heading', { name: 'INV-00011' });
    for (const label of names('Record payment', 'Send reminder', 'Resend', 'Cancel bill')) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('shows server totals, paid and balance due', async () => {
    getBill.mockResolvedValue(
      makeBillDetail({
        status: 'partially_paid',
        amountPaid: '40.00',
        balanceDue: '70.00',
        payments: [{ id: 5, amount: '40.00', method: 'cash', provider: 'manual', status: 'succeeded', paidAt: '2026-10-05T09:00:00Z', notes: 'Paid at desk' }],
      }),
    );
    renderPage();

    await screen.findByRole('heading', { name: 'INV-00011' });
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('$110.00')).toBeInTheDocument();
    expect(screen.getByText('$70.00')).toBeInTheDocument();
    expect(screen.getByText('Paid at desk')).toBeInTheDocument();
  });

  it('does not offer Cancel once a payment exists, and Record payment is gone when paid', async () => {
    getBill.mockResolvedValue(
      makeBillDetail({
        status: 'partially_paid',
        payments: [{ id: 5, amount: '40.00', method: 'cash', provider: 'manual', status: 'succeeded', paidAt: '2026-10-05T09:00:00Z', notes: null }],
      }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'INV-00011' });
    expect(screen.queryByRole('button', { name: /cancel bill/i })).not.toBeInTheDocument();
  });

  it('hides Record payment for a paid bill', async () => {
    getBill.mockResolvedValue(makeBillDetail({ status: 'paid', balanceDue: '0.00', amountPaid: '110.00' }));
    renderPage();
    await screen.findByRole('heading', { name: 'INV-00011' });
    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument();
  });

  it('sends a draft and reports success', async () => {
    getBill.mockResolvedValue(makeBillDetail({ status: 'draft', sentAt: null }));
    sendBill.mockResolvedValue(makeBillDetail({ status: 'sent' }));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /send to customer/i }));

    await waitFor(() => expect(sendBill).toHaveBeenCalledWith(11));
    expect(await screen.findByText('Bill sent')).toBeInTheDocument();
  });

  it('warns when the API answers 200 but the bill is still a draft (email failed)', async () => {
    getBill.mockResolvedValue(makeBillDetail({ status: 'draft', sentAt: null }));
    sendBill.mockResolvedValue(makeBillDetail({ status: 'draft', sentAt: null }));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /send to customer/i }));

    expect(await screen.findByText('The email could not be sent')).toBeInTheDocument();
  });

  it('asks for confirmation before cancelling, then cancels', async () => {
    getBill.mockResolvedValue(makeBillDetail({ status: 'sent' }));
    cancelBill.mockResolvedValue(makeBillDetail({ status: 'cancelled' }));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^cancel bill$/i }));
    expect(cancelBill).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Cancel bill') as HTMLElement,
    );

    await waitFor(() => expect(cancelBill).toHaveBeenCalledWith(11));
  });

  it('shows the server reason if cancelling is refused', async () => {
    getBill.mockResolvedValue(makeBillDetail({ status: 'sent' }));
    cancelBill.mockRejectedValue(apiError(409, 'nope', 'bill_has_payments'));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^cancel bill$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Cancel bill') as HTMLElement,
    );

    expect(await screen.findByText(/cannot be cancelled/i)).toBeInTheDocument();
  });

  it('shows "Bill not found" on a 404', async () => {
    getBill.mockRejectedValue(apiError(404, 'Bill not found', 'bill_not_found'));
    renderPage(999);
    expect(await screen.findByText('Bill not found')).toBeInTheDocument();
  });

  it('keeps unused fixtures honest', () => {
    expect(makePayment().provider).toBe('manual');
  });
});
