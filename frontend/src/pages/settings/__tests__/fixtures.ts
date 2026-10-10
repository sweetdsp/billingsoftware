import type { BusinessProfile } from '../../../types';

export function makeProfile(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    id: 1,
    businessName: 'Acme Studio',
    logoFileId: null,
    logoUrl: null,
    address: '1 Main Street',
    phone: '+1 555 0100',
    email: 'billing@acme.test',
    taxId: 'TAX-1',
    defaultCurrency: 'USD',
    billNumberPrefix: 'INV-',
    nextBillNumber: 42,
    defaultDueDays: 14,
    defaultTaxRate: '5.00',
    reminderDaysAfterDue: [1, 7, 14],
    footerNote: 'Thank you!',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}
