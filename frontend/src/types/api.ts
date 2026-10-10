/**
 * Single source of truth for the Bill Maker API contract on the frontend.
 *
 * Mirrors the backend JSON exactly (see PRPs/bill-maker-prp.md, CROSS-CUTTING CONTRACTS):
 * - camelCase keys
 * - ids are numbers
 * - `date` fields are `YYYY-MM-DD` strings, `datetime` fields are UTC ISO-8601 strings
 * - money (and other Numeric columns) are serialized as strings, e.g. "1250.00"
 *
 * Enums are defined ONCE here and must not be redeclared anywhere else in the frontend.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Numeric(12,2) serialized as a string, e.g. "1250.00". Never do persisted arithmetic on it client-side. */
export type Money = string;

/** Generic Numeric (quantity Numeric(10,2), tax rate Numeric(5,2)) serialized as a string, e.g. "18.00". */
export type DecimalString = string;

/** `YYYY-MM-DD` */
export type ISODate = string;

/** UTC ISO-8601 with `Z` suffix, e.g. "2026-10-10T06:00:00Z" */
export type ISODateTime = string;

/** ISO 4217 currency code, e.g. "USD" */
export type CurrencyCode = string;

// ---------------------------------------------------------------------------
// Enums (shared contract)
// ---------------------------------------------------------------------------

export type BillingFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type PlanStatus = 'active' | 'paused' | 'cancelled';
export type BillStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export type PaymentMethod = 'online' | 'cash' | 'bank_transfer' | 'cheque' | 'other';
export type PaymentProvider = 'dodo' | 'manual';
export type PaymentStatus = 'succeeded' | 'failed' | 'refunded';
export type FilePurpose = 'logo' | 'attachment' | 'bill_pdf';
export type EmailTemplate =
  | 'verify_email'
  | 'reset_password'
  | 'welcome'
  | 'bill_sent'
  | 'reminder'
  | 'receipt';
export type EmailStatus = 'queued' | 'sent' | 'failed';

/** Runtime lists of enum values (handy for selects, tabs and zod enums). */
export const BILLING_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const satisfies readonly BillingFrequency[];
export const PLAN_STATUSES = ['active', 'paused', 'cancelled'] as const satisfies readonly PlanStatus[];
export const BILL_STATUSES = [
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
] as const satisfies readonly BillStatus[];
export const PAYMENT_METHODS = [
  'online',
  'cash',
  'bank_transfer',
  'cheque',
  'other',
] as const satisfies readonly PaymentMethod[];

// ---------------------------------------------------------------------------
// Generic envelopes
// ---------------------------------------------------------------------------

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageParams {
  page?: number;
  pageSize?: number;
}

/** Error body for all non-422 errors. */
export interface ApiError {
  detail: string;
  code?: string;
}

/** FastAPI default 422 item. */
export interface ValidationErrorItem {
  loc: Array<string | number>;
  msg: string;
  type: string;
}

export interface ValidationErrorResponse {
  detail: ValidationErrorItem[];
}

interface Timestamps {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Auth / Users
// ---------------------------------------------------------------------------

/** `UserOut` — the backend exposes `createdAt` only (no `updatedAt`). */
export interface User {
  id: number;
  email: string;
  fullName: string | null;
  isActive: boolean;
  isVerified: boolean;
  isAdmin: boolean;
  /** e.g. "google" when the account was created or linked via Google sign-in. */
  oauthProvider: string | null;
  /** False for Google-only accounts that never set a password. */
  hasPassword: boolean;
  createdAt: ISODateTime;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName?: string | null;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface UpdateMeRequest {
  fullName?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface MessageResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Business profile & uploads
// ---------------------------------------------------------------------------

export interface BusinessProfile extends Timestamps {
  id: number;
  businessName: string;
  logoFileId: number | null;
  /** Owner-only download URL (`/api/v1/uploads/{id}`), or null without a logo. Needs the bearer token. */
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  defaultCurrency: CurrencyCode;
  billNumberPrefix: string;
  nextBillNumber: number;
  defaultDueDays: number;
  defaultTaxRate: DecimalString;
  reminderDaysAfterDue: number[];
  footerNote: string | null;
}

export interface BusinessProfileInput {
  businessName: string;
  logoFileId?: number | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  defaultCurrency?: CurrencyCode;
  billNumberPrefix?: string;
  defaultDueDays?: number;
  defaultTaxRate?: DecimalString;
  reminderDaysAfterDue?: number[];
  footerNote?: string | null;
}

/** Body of `PUT /business-profile` (alias matching the backend schema name). */
export type BusinessProfileIn = BusinessProfileInput;

/** `POST /uploads` response (UploadedFileOut). */
export interface UploadedFile {
  id: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  purpose: FilePurpose;
  createdAt: ISODateTime;
  /** Owner-only download URL (`/api/v1/uploads/{id}`); fetch it with the bearer token. */
  url: string;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/** `CustomerOut` — a customer as returned by POST/PUT. Email is required and stored lowercase. */
export interface Customer extends Timestamps {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  billingAddress: string | null;
  taxId: string | null;
  notes: string | null;
  isActive: boolean;
}

/** A row of `GET /customers`. `balanceDue` is summed across currencies (no currency field). */
export interface CustomerListItem extends Customer {
  balanceDue: Money;
  activePlanCount: number;
}

/** Compact billing plan view on the customer detail page. */
export interface CustomerPlanSummary {
  id: number;
  name: string;
  status: PlanStatus;
  frequency: BillingFrequency;
  intervalCount: number;
  nextBillingDate: ISODate;
  currency: CurrencyCode;
  total: Money;
}

/** Compact bill view on the customer detail page (latest 10). */
export interface CustomerBillSummary {
  id: number;
  billNumber: string;
  issueDate: ISODate;
  dueDate: ISODate;
  total: Money;
  amountPaid: Money;
  status: BillStatus;
  currency: CurrencyCode;
}

/** Compact payment view on the customer detail page (latest 10). */
export interface CustomerPaymentSummary {
  id: number;
  billId: number;
  amount: Money;
  currency: CurrencyCode;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt: ISODateTime;
}

/** `GET /customers/{id}`. `balanceDue` is summed across currencies (no currency field). */
export interface CustomerDetail extends Customer {
  balanceDue: Money;
  plans: CustomerPlanSummary[];
  recentBills: CustomerBillSummary[];
  recentPayments: CustomerPaymentSummary[];
}

/** `POST /customers` — 409 `customer_email_exists` for a duplicate active email. */
export interface CustomerCreate {
  name: string;
  email: string;
  phone?: string | null;
  companyName?: string | null;
  billingAddress?: string | null;
  taxId?: string | null;
  notes?: string | null;
}

/**
 * `PUT /customers/{id}` — only fields sent are changed. `name`, `email` and `isActive` may be
 * omitted but never `null`; optional text fields may be `null` to clear them.
 * `isActive: true` restores an archived customer.
 */
export interface CustomerUpdate {
  name?: string;
  email?: string;
  phone?: string | null;
  companyName?: string | null;
  billingAddress?: string | null;
  taxId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

/** `GET /customers` query. `active` defaults to true server-side; false lists archived. */
export interface CustomerListParams extends PageParams {
  q?: string;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Billing plans
// ---------------------------------------------------------------------------

/** A stored plan line item; `amount` is `quantity × unitPrice` computed server-side. */
export interface PlanLineItem {
  id: number;
  position: number;
  description: string;
  quantity: DecimalString;
  unitPrice: Money;
  amount: Money;
}

/** A line item in a create/update payload (the amount is computed by the server). */
export interface LineItemInput {
  description: string;
  quantity: DecimalString;
  unitPrice: Money;
}

/** A row of `GET /billing-plans` (no line items; totals are for one period). */
export interface BillingPlanListItem extends Timestamps {
  id: number;
  customerId: number;
  customerName: string;
  name: string;
  description: string | null;
  currency: CurrencyCode;
  frequency: BillingFrequency;
  intervalCount: number;
  startDate: ISODate;
  endDate: ISODate | null;
  nextBillingDate: ISODate;
  dueDays: number;
  taxRate: DecimalString;
  autoSend: boolean;
  status: PlanStatus;
  subtotal: Money;
  taxAmount: Money;
  total: Money;
}

export interface BillingPlan extends BillingPlanListItem {
  lineItems: PlanLineItem[];
}

/** Compact view of a bill generated by a plan. */
export interface PlanBillSummary {
  id: number;
  billNumber: string;
  issueDate: ISODate;
  dueDate: ISODate;
  periodStart: ISODate | null;
  total: Money;
  currency: CurrencyCode;
  status: BillStatus;
}

/** `GET /billing-plans/{id}`: plan + next 6 billing dates + latest 10 bills. */
export interface BillingPlanDetail extends BillingPlan {
  upcomingDates: ISODate[];
  recentBills: PlanBillSummary[];
}

/** `POST /billing-plans`. Omitted `currency`/`dueDays`/`taxRate` fall back to the profile defaults. */
export interface BillingPlanCreate {
  customerId: number;
  name: string;
  description?: string | null;
  currency?: CurrencyCode | null;
  frequency: BillingFrequency;
  intervalCount: number;
  startDate: ISODate;
  endDate?: ISODate | null;
  dueDays?: number | null;
  taxRate?: DecimalString | null;
  autoSend: boolean;
  /** At least one line item. */
  lineItems: LineItemInput[];
}

/** PUT sends only changed fields; line items replace all lines. Future bills only. */
export type BillingPlanUpdate = Partial<Omit<BillingPlanCreate, 'customerId'>>;

export interface BillingPlanListParams extends PageParams {
  customerId?: number;
  status?: PlanStatus;
}

/** `POST /billing-plans/{id}/generate-now` → 201. */
export interface GeneratedBill {
  billId: number;
  billNumber: string;
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export interface BillLineItem {
  id: number;
  description: string;
  quantity: DecimalString;
  unitPrice: Money;
  amount: Money;
  position: number;
}

/** A row of `GET /bills`. */
export interface BillListItem {
  id: number;
  billNumber: string;
  customerId: number;
  customerName: string;
  planId: number | null;
  planName: string | null;
  issueDate: ISODate;
  dueDate: ISODate;
  periodStart: ISODate | null;
  periodEnd: ISODate | null;
  currency: CurrencyCode;
  total: Money;
  amountPaid: Money;
  balanceDue: Money;
  status: BillStatus;
  sentAt: ISODateTime | null;
  paidAt: ISODateTime | null;
  createdAt: ISODateTime;
}

/** A bill with its amounts, links and PDF state (no line items). */
export interface Bill extends BillListItem {
  subtotal: Money;
  taxRate: DecimalString;
  taxAmount: Money;
  paymentLinkUrl: string | null;
  /** Customer-facing page `{APP_BASE_URL}/pay/{token}`. */
  publicUrl: string;
  hasPdf: boolean;
  updatedAt: ISODateTime;
}

/** A payment as shown on the bill detail page. */
export interface BillPayment {
  id: number;
  amount: Money;
  method: PaymentMethod;
  provider: PaymentProvider;
  status: PaymentStatus;
  paidAt: ISODateTime;
  notes: string | null;
}

/** One email attempt for a bill. */
export interface BillEmailLog {
  id: number;
  template: EmailTemplate;
  toEmail: string;
  status: EmailStatus;
  error: string | null;
  createdAt: ISODateTime;
}

/** `GET /bills/{id}`: bill + lines + payments + email history (newest first). */
export interface BillDetail extends Bill {
  lineItems: BillLineItem[];
  payments: BillPayment[];
  emailLogs: BillEmailLog[];
}

export interface BillCreate {
  customerId: number;
  issueDate?: ISODate;
  dueDate?: ISODate;
  currency?: CurrencyCode;
  taxRate?: DecimalString;
  lineItems: LineItemInput[];
}

/** Draft bills only (409 `bill_not_draft` otherwise). Fields may be omitted but not null. */
export type BillUpdate = Partial<BillCreate>;

export interface BillListParams extends PageParams {
  status?: BillStatus;
  customerId?: number;
  from?: ISODate;
  to?: ISODate;
}

/** A bill line on the public page. */
export interface PublicBillLineItem {
  description: string;
  quantity: DecimalString;
  unitPrice: Money;
  amount: Money;
}

export interface PublicBillCustomer {
  name: string;
  companyName: string | null;
}

export interface PublicBillBusiness {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  logoUrl: string | null;
}

/** `GET /public/bills/{publicToken}` — read-only, no auth. */
export interface PublicBill {
  billNumber: string;
  issueDate: ISODate;
  dueDate: ISODate;
  periodStart: ISODate | null;
  periodEnd: ISODate | null;
  currency: CurrencyCode;
  lineItems: PublicBillLineItem[];
  subtotal: Money;
  taxRate: DecimalString;
  taxAmount: Money;
  total: Money;
  amountPaid: Money;
  balanceDue: Money;
  status: BillStatus;
  /** Only present while the bill can still be paid. */
  paymentLinkUrl: string | null;
  customer: PublicBillCustomer;
  business: PublicBillBusiness;
  footerNote: string | null;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** A row of `GET /payments` (also the `POST /bills/{id}/payments` response). */
export interface Payment {
  id: number;
  billId: number;
  billNumber: string;
  customerId: number;
  customerName: string;
  amount: Money;
  currency: CurrencyCode;
  method: PaymentMethod;
  provider: PaymentProvider;
  providerPaymentId: string | null;
  status: PaymentStatus;
  paidAt: ISODateTime;
  notes: string | null;
  createdAt: ISODateTime;
}

/** `POST /bills/{id}/payments` — overpayment is rejected with 400 `overpayment`. */
export interface ManualPaymentCreate {
  amount: Money;
  method: PaymentMethod;
  paidAt?: ISODateTime;
  notes?: string | null;
}

export interface PaymentListParams extends PageParams {
  customerId?: number;
  method?: PaymentMethod;
  from?: ISODate;
  to?: ISODate;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/** One entry of `upcomingBills` (plans due to bill in the next 7 days). */
export interface UpcomingBill {
  planId: number;
  planName: string;
  customerId: number;
  customerName: string;
  nextBillingDate: ISODate;
  total: Money;
  currency: CurrencyCode;
}

export interface AnalyticsSummary {
  /** Reported in the business default currency. */
  currency: CurrencyCode;
  mrr: Money;
  collectedThisMonth: Money;
  outstanding: Money;
  overdueAmount: Money;
  overdueCount: number;
  activePlans: number;
  activeCustomers: number;
  upcomingBills: UpcomingBill[];
  /** Currencies left out of the figures above (they differ from `currency`). */
  excludedCurrencies: CurrencyCode[];
}

export interface RevenuePoint {
  /** `YYYY-MM` */
  month: string;
  billed: Money;
  collected: Money;
}

export type AgingLabel = '0-30' | '31-60' | '61-90' | '90+';

export interface AgingBucket {
  label: AgingLabel;
  amount: Money;
  count: number;
}

export interface AgingReport {
  currency: CurrencyCode;
  buckets: AgingBucket[];
}

export interface TopCustomer {
  customerId: number;
  customerName: string;
  collected: Money;
}

// ---------------------------------------------------------------------------
// Admin (post-MVP)
// ---------------------------------------------------------------------------

export interface AdminStats {
  users: number;
  activePlans: number;
  billsSent30d: number;
  paymentVolume: Money;
}

export interface AdminUserUpdate {
  isActive?: boolean;
  isAdmin?: boolean;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthStatus {
  status: string;
  db: string;
  scheduler: string;
}
