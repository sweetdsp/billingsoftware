# INITIAL.md - Bill Maker Product Definition

> Recurring billing for small businesses: set up a plan once, and Bill Maker generates, emails, and collects payment on every bill automatically.

---

## PRODUCT

### Name
Bill Maker

### Description
Bill Maker helps small business owners bill customers on a recurring schedule, for example rent, tuition, memberships, maintenance contracts or subscriptions. The owner adds a customer once and creates a billing plan with line items and a frequency (weekly, monthly, quarterly or yearly). Bill Maker then generates each bill on schedule, renders a branded PDF, and emails it to the customer through Resend with a Dodo Payments pay link. When the customer pays online, the bill is marked paid automatically by webhook. Owners can also record cash or bank-transfer payments by hand. Overdue bills trigger reminder emails, and a dashboard shows revenue, MRR, collected versus outstanding amounts, and overdue trends.

### Target User
Small business owners who bill the same customers repeatedly, such as landlords, tutors and coaching centres, gyms, maintenance and service providers, and subscription-box sellers. They currently track this in spreadsheets or by hand and lose money to forgotten or late bills.

### Type
- [x] SaaS (Software as a Service)

---

## TECH STACK

### Backend
- [x] FastAPI + Python 3.11+
- [x] APScheduler (daily job for bill generation + overdue reminders)
- [x] WeasyPrint (HTML → PDF bill rendering)

### Frontend
- [x] React + Vite + TypeScript

### Database
- [x] PostgreSQL + SQLAlchemy + Alembic

### Authentication
- [x] Email/Password (bcrypt) + Google OAuth 2.0, JWT access + refresh tokens

### UI Framework
- [x] Chakra UI + Framer Motion
- [x] Recharts (analytics charts)

### Payments
- [x] Dodo Payments (customer-facing pay links + webhooks)

### Email
- [x] Resend (API key via env var; no SMTP or Gmail credentials)

### File Storage
- [x] Local disk in dev, S3-compatible storage in production (logos, attachments, PDFs)

---

## MODULES

### Module 1: Authentication (Required)

**Description:** User authentication and authorization for business owners (and admins).

**Models:**
- User: id, email, hashed_password (nullable for OAuth-only), full_name, is_active, is_verified, is_admin, oauth_provider, oauth_sub, created_at, updated_at
- RefreshToken: id, user_id, token_hash, expires_at, revoked, created_at
- PasswordResetToken: id, user_id, token_hash, expires_at, used_at
- EmailVerificationToken: id, user_id, token_hash, expires_at, used_at

**API Endpoints:**
- POST /api/v1/auth/register - Create new account (sends verification email via Resend)
- POST /api/v1/auth/verify-email - Verify email with token
- POST /api/v1/auth/login - Login with email/password
- POST /api/v1/auth/refresh - Refresh access token
- POST /api/v1/auth/logout - Revoke refresh token
- POST /api/v1/auth/forgot-password - Send reset link via Resend
- POST /api/v1/auth/reset-password - Reset password with token
- GET /api/v1/auth/me - Get current user profile
- PUT /api/v1/auth/me - Update profile
- GET /api/v1/auth/google - Start Google OAuth (sets state)
- GET /api/v1/auth/google/callback - Google OAuth callback (verifies state)

**Frontend Pages:**
- /login - Login page (email/password + "Continue with Google")
- /register - Registration page
- /verify-email - Email verification landing
- /forgot-password - Forgot password page
- /reset-password - Reset password page
- /profile - User profile page (protected)

---

### Module 2: Business Profile & Settings

**Description:** The owner's business identity that appears on every bill: name, logo, address, tax ID, currency and numbering.

**Models:**
- BusinessProfile: id, user_id (unique), business_name, logo_file_id, address, phone, email, tax_id, default_currency (ISO 4217), bill_number_prefix (e.g. "BM-"), next_bill_number, default_due_days, default_tax_rate, reminder_days_after_due (e.g. [1, 7, 14]), footer_note, created_at, updated_at
- UploadedFile: id, user_id, filename, content_type, size_bytes, storage_key, purpose (logo/attachment/bill_pdf), created_at

**API Endpoints:**
- GET /api/v1/business-profile - Get profile
- PUT /api/v1/business-profile - Create/update profile
- POST /api/v1/uploads - Upload file (logo/attachment; type and size validated)
- GET /api/v1/uploads/{id} - Download file (owner only)
- DELETE /api/v1/uploads/{id} - Delete file

**Frontend Pages:**
- /settings - Business profile, logo upload, billing defaults, reminder schedule
- /onboarding - First-run wizard (business profile → first customer → first plan)

---

### Module 3: Customers

**Description:** The people and businesses the owner bills.

**Models:**
- Customer: id, user_id, name, email, phone, company_name, billing_address, tax_id, notes, is_active, created_at, updated_at

**API Endpoints:**
- GET /api/v1/customers - List (search, filter active/archived, pagination)
- POST /api/v1/customers - Create
- GET /api/v1/customers/{id} - Detail (with plans, bills, balance due)
- PUT /api/v1/customers/{id} - Update
- DELETE /api/v1/customers/{id} - Archive (soft delete; blocked from hard delete if bills exist)

**Frontend Pages:**
- /customers - List view with search, outstanding balance column
- /customers/new - Create form
- /customers/:id - Detail view (info, active plans, bill history, payments)
- /customers/:id/edit - Edit form

---

### Module 4: Billing Plans

**Description:** Reusable recurring billing templates attached to a customer. Each plan drives automatic bill generation.

**Models:**
- BillingPlan: id, user_id, customer_id, name, description, currency, frequency (weekly/monthly/quarterly/yearly), interval_count (e.g. every 2 months), start_date, end_date (nullable), next_billing_date, due_days, tax_rate, auto_send (bool), status (active/paused/cancelled), created_at, updated_at
- PlanLineItem: id, plan_id, description, quantity, unit_price, position

**API Endpoints:**
- GET /api/v1/billing-plans - List (filter by customer, status)
- POST /api/v1/billing-plans - Create (with line items)
- GET /api/v1/billing-plans/{id} - Detail (with upcoming bill dates preview)
- PUT /api/v1/billing-plans/{id} - Update (changes apply to future bills only)
- POST /api/v1/billing-plans/{id}/pause - Pause
- POST /api/v1/billing-plans/{id}/resume - Resume
- POST /api/v1/billing-plans/{id}/cancel - Cancel
- POST /api/v1/billing-plans/{id}/generate-now - Generate the next bill immediately

**Frontend Pages:**
- /plans - List view (customer, amount, frequency, next bill date, status)
- /plans/new - Create form with line-item editor and schedule preview
- /plans/:id - Detail view (schedule, generated bills)
- /plans/:id/edit - Edit form

---

### Module 5: Bills / Invoices

**Description:** Bills generated from plans automatically, or created by hand as one-off bills, then rendered to PDF and sent through Resend.

**Models:**
- Bill: id, user_id, customer_id, plan_id (nullable for one-off), bill_number (unique per user), issue_date, due_date, period_start, period_end, currency, subtotal, tax_amount, total, amount_paid, status (draft/sent/partially_paid/paid/overdue/cancelled), pdf_file_id, payment_link_url, dodo_checkout_id, public_token (for customer view link), sent_at, paid_at, created_at, updated_at
  - Unique constraint: (plan_id, period_start), so the scheduler can never double-bill a period
- BillLineItem: id, bill_id, description, quantity, unit_price, amount, position
- BillAttachment: id, bill_id, file_id
- EmailLog: id, user_id, bill_id (nullable), to_email, template (bill_sent/reminder/receipt/welcome/reset/verify), resend_message_id, status (queued/sent/failed), error, created_at

**API Endpoints:**
- GET /api/v1/bills - List (filter by status, customer, date range; pagination)
- POST /api/v1/bills - Create one-off bill
- GET /api/v1/bills/{id} - Detail (with payments, email history)
- PUT /api/v1/bills/{id} - Edit (draft only)
- POST /api/v1/bills/{id}/send - Render PDF, create Dodo pay link, email via Resend
- POST /api/v1/bills/{id}/remind - Send reminder now
- POST /api/v1/bills/{id}/cancel - Cancel (void)
- GET /api/v1/bills/{id}/pdf - Download PDF
- GET /api/v1/public/bills/{public_token} - Customer-facing bill view (no auth, read-only)

**Background Jobs (APScheduler, daily):**
- generate_due_bills: for each active plan with next_billing_date <= today, create bill, advance next_billing_date, auto-send if enabled (idempotent)
- mark_overdue_bills: sent/partially_paid bills past due_date → overdue
- send_overdue_reminders: per BusinessProfile.reminder_days_after_due

**Frontend Pages:**
- /bills - List view with status tabs (All / Draft / Sent / Overdue / Paid)
- /bills/new - One-off bill form
- /bills/:id - Detail view (PDF preview, send/remind/cancel, payment history)
- /pay/:publicToken - Public customer bill page with "Pay now" button (no login)

---

### Module 6: Payments

**Description:** Payments recorded against bills, either collected online through Dodo Payments or entered by hand.

**Models:**
- Payment: id, user_id, bill_id, amount, currency, method (online/cash/bank_transfer/cheque/other), provider (dodo/manual), provider_payment_id (unique, nullable), status (succeeded/failed/refunded), paid_at, notes, created_at
- WebhookEvent: id, provider, event_id (unique), event_type, payload (JSONB), processed_at, created_at

**API Endpoints:**
- GET /api/v1/payments - List (filter by customer, method, date range)
- POST /api/v1/bills/{id}/payments - Record manual payment
- DELETE /api/v1/payments/{id} - Delete manual payment (recalculates bill status)
- POST /api/v1/webhooks/dodo - Dodo Payments webhook (signature verified, idempotent via WebhookEvent)

**Frontend Pages:**
- /payments - Payments list
- Record-payment modal on /bills/:id

---

### Module 7: Dashboard & Analytics

**Description:** At-a-glance health of the owner's recurring revenue.

**API Endpoints:**
- GET /api/v1/analytics/summary - MRR, collected this month, outstanding, overdue count/amount, active plans
- GET /api/v1/analytics/revenue?period=12m - Monthly billed vs collected
- GET /api/v1/analytics/aging - Overdue aging buckets (0-30 / 31-60 / 61-90 / 90+)
- GET /api/v1/analytics/top-customers - Top customers by revenue

**Frontend Pages:**
- /dashboard - Stat tiles, revenue chart, aging chart, upcoming bills (next 7 days), recent payments
- /settings - (see Module 2)

---

### Module 8: Admin Panel

**Description:** Admin-only management interface for the Bill Maker platform.

**API Endpoints:**
- GET /api/v1/admin/users - List all users (search, pagination)
- PUT /api/v1/admin/users/{id} - Activate/deactivate, toggle admin
- GET /api/v1/admin/stats - Platform stats (users, active plans, bills sent, payment volume)
- GET /api/v1/admin/email-logs - Recent email failures

**Frontend Pages:**
- /admin - Admin dashboard (protected, admin only)
- /admin/users - User management

---

## MVP SCOPE

### Must Have (MVP)
- [x] User registration and login (email/password + Google OAuth)
- [x] Business profile with logo upload
- [x] Customers CRUD
- [x] Billing Plans CRUD with line items and frequency
- [x] Automatic bill generation by daily scheduler (idempotent)
- [x] Bill PDF rendering + email delivery via Resend
- [x] Dodo Payments pay link on each bill + webhook to mark bills paid
- [x] Manual payment recording + bill status tracking (sent/partially paid/paid/overdue)

### Nice to Have (Post-MVP)
- [ ] Automatic overdue reminder emails (schedule configurable)
- [ ] Analytics dashboard charts (MRR, aging, top customers)
- [ ] Admin panel
- [ ] Bill attachments
- [ ] Customer self-service portal (all bills for a customer)
- [ ] Multi-currency reporting
- [ ] WhatsApp/SMS bill delivery

---

## ACCEPTANCE CRITERIA

### Authentication
- [ ] User can register with email/password and receives a verification email via Resend
- [ ] User can login with email/password
- [ ] User can sign up / login with Google OAuth (state parameter verified)
- [ ] User can reset password through an emailed link (token single-use, expires in 1 hour)
- [ ] JWT tokens work correctly with refresh
- [ ] Protected routes redirect to login

### Business Profile
- [ ] Owner can set business name, address, tax ID, currency, bill prefix
- [ ] Owner can upload a logo (PNG/JPG/SVG, ≤ 2 MB) that appears on bill PDFs

### Customers
- [ ] Owner can create, view, edit, search and archive customers
- [ ] Owner only ever sees their own customers (user_id scoping enforced)

### Billing Plans
- [ ] Owner can create a plan with multiple line items, frequency, interval, start/end date
- [ ] Plan detail shows a preview of the next 6 bill dates
- [ ] Owner can pause, resume and cancel plans; paused/cancelled plans generate no bills
- [ ] Editing a plan does not alter already-generated bills

### Bills
- [ ] Scheduler generates exactly one bill per plan per period, even if run twice
- [ ] Month-end start dates (e.g. 31st) roll correctly to the last day of shorter months
- [ ] Bill totals (subtotal, tax, total) are computed server-side with Decimal, never floats
- [ ] Sending a bill produces a PDF, a Dodo pay link, and a Resend email with PDF attached
- [ ] Customer can open the public bill page and pay without logging in
- [ ] Bills past their due date are marked overdue by the daily job

### Payments
- [ ] Successful Dodo payment webhook marks bill paid (or partially paid) within seconds
- [ ] Webhooks with an invalid signature are rejected (401) and duplicate events are ignored
- [ ] Owner can record a manual payment; bill status and amount_paid update correctly
- [ ] Customer receives a payment receipt email via Resend

### Dashboard
- [ ] Dashboard shows MRR, collected this month, outstanding, overdue amount
- [ ] Revenue chart shows billed vs collected for the last 12 months

### Admin
- [ ] Only users with is_admin can access /admin routes (403 otherwise)
- [ ] Admin can deactivate a user; deactivated users cannot log in

### Quality
- [ ] All API endpoints documented in OpenAPI
- [ ] Backend test coverage 80%+ (scheduler, money math, webhooks fully covered)
- [ ] Frontend TypeScript strict mode passes
- [ ] Docker builds and runs successfully

---

## SPECIAL REQUIREMENTS

### Security
- [x] Rate limiting on auth endpoints and public bill page
- [x] Input validation on all endpoints (Pydantic)
- [x] SQL injection prevention (SQLAlchemy ORM only)
- [x] XSS prevention (escape all user content in PDF HTML templates)
- [x] CSRF protection on OAuth flow (state parameter)
- [x] Dodo webhook signature verification + idempotency
- [x] Public bill links use unguessable tokens (secrets.token_urlsafe(32))
- [x] File uploads: content-type + size validation, stored outside web root
- [x] All secrets (Resend, Dodo, Google, JWT) from environment variables only

### Integrations
- [x] Resend for all transactional email (verification, reset, bills, reminders, receipts)
- [x] Dodo Payments for online bill payment
- [x] File upload service (local / S3-compatible)
- [x] Google OAuth 2.0

---

## AGENTS

> These 6 agents will build your product in parallel:

| Agent | Role | Works On |
|-------|------|----------|
| DATABASE-AGENT | Creates all models and migrations | All database models |
| BACKEND-AGENT | Builds API endpoints, services, scheduler, integrations | All modules' backends |
| FRONTEND-AGENT | Creates UI pages and components | All modules' frontends |
| DEVOPS-AGENT | Sets up Docker, CI/CD, environments | Infrastructure |
| TEST-AGENT | Writes unit and integration tests | All code |
| REVIEW-AGENT | Security and code quality audit | All code |

---

# READY?

```bash
/generate-prp INITIAL.md
```

Then:

```bash
/execute-prp PRPs/bill-maker-prp.md
```
