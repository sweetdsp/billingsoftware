import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { billService } from '../../../services/billService';
import { apiError, makePublicBill } from '../../../test/billingFixtures';
import { renderWithProviders } from '../../../test/renderWithProviders';
import PublicBillPage from '../PublicBillPage';

vi.mock('../../../services/billService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/billService')>();
  return { ...actual, billService: { getPublicBill: vi.fn() } };
});

const getPublicBill = vi.mocked(billService.getPublicBill);

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/pay/:publicToken" element={<PublicBillPage />} />
    </Routes>,
    { route: '/pay/tok_abc' },
  );
}

describe('PublicBillPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the bill and a safe pay button while payable', async () => {
    getPublicBill.mockResolvedValue(makePublicBill());
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Acme Ltd' })).toBeInTheDocument();
    expect(getPublicBill).toHaveBeenCalledWith('tok_abc');
    expect(screen.getByText('INV-00011')).toBeInTheDocument();
    expect(screen.getByText('Consulting')).toBeInTheDocument();
    expect(screen.getByText('Thanks for your business')).toBeInTheDocument();

    const pay = screen.getByRole('link', { name: /pay \$110\.00 now/i });
    expect(pay).toHaveAttribute('href', 'https://checkout.example.test/pay/abc');
    expect(pay).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('does not render a javascript: pay link and shows contact details instead', async () => {
    getPublicBill.mockResolvedValue(makePublicBill({ paymentLinkUrl: 'javascript:alert(1)' }));
    renderPage();

    expect(await screen.findByText(/online payment isn't available/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /pay/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'hello@acme.test' })).toHaveAttribute(
      'href',
      'mailto:hello@acme.test',
    );
  });

  it('thanks the customer and hides the pay button once paid', async () => {
    getPublicBill.mockResolvedValue(
      makePublicBill({ status: 'paid', amountPaid: '110.00', balanceDue: '0.00', paymentLinkUrl: null }),
    );
    renderPage();

    expect(await screen.findByText(/paid in full/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /pay/i })).not.toBeInTheDocument();
  });

  it('tells the customer a cancelled bill needs no payment', async () => {
    getPublicBill.mockResolvedValue(makePublicBill({ status: 'cancelled', paymentLinkUrl: null }));
    renderPage();
    expect(await screen.findByText(/has been cancelled/i)).toBeInTheDocument();
  });

  it('shows "Bill not found" for an unknown link (404)', async () => {
    getPublicBill.mockRejectedValue(apiError(404, 'Bill not found', 'bill_not_found'));
    renderPage();
    expect(await screen.findByText('Bill not found')).toBeInTheDocument();
  });
});
