# PRP: Bill Maker

> Implementation blueprint for parallel agent execution

---

## METADATA

| Field | Value |
|-------|-------|
| **Product** | Bill Maker |
| **Type** | SaaS (multi-tenant, B2B for small businesses) |
| **Version** | 1.0 |
| **Created** | 2026-10-10 |
| **Complexity** | High (scheduler, PDF rendering, two external integrations, money math) |
| **Source** | `INITIAL.md`, `CLAUDE.md` |

---

## PRODUCT OVERVIEW

**Description:** Recurring billing for small business owners such as landlords, tutors, gyms, service providers and subscription sellers. The owner adds customers and billing plans once. From then on, Bill Maker generates each bill on schedule, renders a branded PDF, emails it through Resend with a Dodo Payments pay link, and marks it paid automatically when the customer pays.

**Value Proposition:** Owners stop losing revenue to forgotten, late or miscalculated bills. Setup takes about five minutes per customer, and after that there is nothing to do each month except watch payments arrive. Bill Maker replaces spreadsheets plus manual WhatsApp or email follow-ups.

**MVP Scope (Phases 1–2):**
- [ ] Register/login: email + password and Google OAuth; verification and reset emails via Resend
- [ ] Business profile with logo upload
- [ ] Customers CRUD (soft delete)
- [ ] Billing plans CRUD with line items, frequency and interval
- [ ] Daily scheduler generates bills automatically and idempotently
- [ ] Bill PDF (WeasyPrint) + email delivery via Resend
- [ ] Dodo Payments pay link per bill + webhook that marks bills paid
- [ ] Manual payment recording + bill status tracking
- [ ] Basic dashboard: summary tiles + upcoming bills

**Post-MVP (Phase 2C, built after the MVP gate passes):**
- [ ] Automatic overdue reminders
- [ ] Analytics charts (revenue, aging, top customers)
- [ ] Admin panel
- [ ] Bill attachments

---

## TECH STACK

| Layer | Technology | Skill Reference |
|-------|------------|-----------------|
| Backend | FastAPI + Python 3.11+, Pydantic v2, pydantic-settings | skills/BACKEND.md |
| Database | PostgreSQL 16 + SQLAlchemy 2.0 (sync sessions, per skill) + Alembic | skills/DATABASE.md |
| Auth | JWT (python-jose, HS256) + `bcrypt` (use the `bcrypt` package directly, since passlib is incompatible with bcrypt ≥ 4.1) + Google OAuth 2.0 (httpx) | skills/BACKEND.md |
| Scheduling | APScheduler 3.x `BackgroundScheduler`, started in FastAPI lifespan when `SCHEDULER_ENABLED=true` | — |
| Dates | `python-dateutil` (`relativedelta`) | — |
| PDF | WeasyPrint + Jinja2 templates (autoescape on) | — |
| Email | Resend Python SDK (`resend`) | — |
| Payments | Dodo Payments Python SDK (`dodopayments`) + Standard Webhooks signature verification | — |
| Storage | Local disk (dev) / S3-compatible via boto3 (prod) behind `storage_service` | — |
| Rate limiting | `slowapi` | — |
| Frontend | React 18 + TypeScript (strict) + Vite | skills/FRONTEND.md |
| UI | Chakra UI v2 + Framer Motion + Recharts | skills/FRONTEND.md |
| Data fetching | axios + @tanstack/react-query + react-router-dom v6 | skills/FRONTEND.md |
| Forms | react-hook-form + zod | — |
| Testing | pytest + pytest-cov + freezegun (backend); Vitest + React Testing Library + MSW (frontend) | skills/TESTING.md |
| Deployment | Docker + docker-compose + GitHub Actions | skills/DEPLOYMENT.md |

> **Research items for the implementing agents.** Verify these against current docs before coding:
> 1. **Dodo dynamic pricing.** Find out how Dodo Payments charges an arbitrary per-bill amount. The candidates are a "pay what you want" product with a preset price, creating a one-time product per bill, or a checkout session with a price override. Hide whichever you pick behind `dodo_service.create_payment_link(bill) -> PaymentLink`.
> 2. **Dodo webhook headers.** Confirm the exact webhook headers (`webhook-id`, `webhook-signature`, `webhook-timestamp`, per Standard Webhooks) and the event names for success and failure.
> 3. **Resend attachments.** Confirm the attachment format in the Resend SDK (base64 `content` + `filename`).

---

## CROSS-CUTTING CONTRACTS (all agents must follow)

These are fixed up front so backend and frontend can build in parallel without drift.

1. **Base path.** Every route lives under `/api/v1`, except `GET /health`.
2. **JSON casing.** Requests and responses use **camelCase**. Every Pydantic schema inherits `class APIModel(BaseModel)` with `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)`, and routers return with `response_model_by_alias=True` (FastAPI's default).
3. **Money.** Money is `Decimal` in Python and `Numeric(12, 2)` in the DB, serialized as a **string** such as `"1250.00"`. The frontend type is `type Money = string`, and the UI formats it with `Intl.NumberFormat`. All totals are computed on the server.
4. **Dates.** `date` fields are `YYYY-MM-DD`. `datetime` fields are UTC ISO-8601 with a `Z` suffix.
5. **Pagination.** List endpoints accept `?page=1&pageSize=20` and return `{ items: T[], total: number, page: number, pageSize: number }` (`Page[T]`).
6. **Errors.** Errors use `{ detail: string, code?: string }` with the status codes listed in CLAUDE.md. Validation errors use FastAPI's default 422 shape.
7. **Tenancy.** Every query on a business entity filters by `current_user.id`. A record owned by another user returns **404**.
8. **Enums.** Both the Python `str` enums and the TS string-union types are defined **once** in the shared contract below, and nowhere else.

```text
BillingFrequency : weekly | monthly | quarterly | yearly
PlanStatus       : active | paused | cancelled
BillStatus       : draft | sent | partially_paid | paid | overdue | cancelled
PaymentMethod    : online | cash | bank_transfer | cheque | other
PaymentProvider  : dodo | manual
PaymentStatus    : succeeded | failed | refunded
FilePurpose      : logo | attachment | bill_pdf
EmailTemplate    : verify_email | reset_password | welcome | bill_sent | reminder | receipt
EmailStatus      : queued | sent | failed
```

---

## DATABASE MODELS

Every table gets `id` (int PK), and `TimestampMixin` (`created_at`, `updated_at`) unless noted otherwise. Business tables have `user_id FK users.id ON DELETE CASCADE, indexed`.

### User
- email (unique, citext or lower-indexed), hashed_password (nullable for OAuth-only), full_name, is_active (default true), is_verified (default false), is_admin (default false), oauth_provider (nullable), oauth_sub (nullable, unique together with provider)
- Relationships: business_profile (1:1), customers, billing_plans, bills, payments

### RefreshToken
- user_id, token_hash (unique), expires_at, revoked (bool)

### PasswordResetToken / EmailVerificationToken
- user_id, token_hash (unique), expires_at, used_at (nullable)

### BusinessProfile
- user_id (unique), business_name, logo_file_id (FK uploaded_files, nullable), address, phone, email, tax_id, default_currency (char 3, default "USD"), bill_number_prefix (default "BM-"), next_bill_number (int, default 1), default_due_days (int, default 7), default_tax_rate (Numeric(5,2), default 0), reminder_days_after_due (ARRAY(int), default {1,7,14}), footer_note

### UploadedFile
- user_id, filename, content_type, size_bytes, storage_key (unique), purpose (FilePurpose)

### Customer
- user_id, name, email, phone, company_name, billing_address, tax_id, notes, is_active (default true)
- Index: (user_id, is_active), (user_id, lower(name))

### BillingPlan
- user_id, customer_id (FK), name, description, currency, frequency (BillingFrequency), interval_count (int ≥ 1, CHECK), start_date, end_date (nullable), next_billing_date (indexed), due_days (int ≥ 0), tax_rate (Numeric(5,2)), auto_send (bool, default true), status (PlanStatus)
- Relationships: line_items (ordered by position, cascade delete-orphan), bills
- Index: (status, next_billing_date) for the scheduler scan

### PlanLineItem
- plan_id (FK, cascade), description, quantity (Numeric(10,2) > 0), unit_price (Numeric(12,2) ≥ 0), position (int). No timestamps.

### Bill
- user_id, customer_id, plan_id (nullable), bill_number, issue_date, due_date, period_start (nullable), period_end (nullable), currency, subtotal, tax_rate, tax_amount, total, amount_paid (default 0), status (BillStatus), pdf_file_id (nullable), payment_link_url (nullable), dodo_checkout_id (nullable), public_token (unique, `secrets.token_urlsafe(32)`), sent_at, paid_at
- **UNIQUE (user_id, bill_number)**
- **UNIQUE (plan_id, period_start)**: guarantees the scheduler is idempotent
- Index: (user_id, status), (status, due_date)

### BillLineItem
- bill_id (FK, cascade), description, quantity, unit_price, amount, position. No timestamps.

### BillAttachment *(post-MVP)*
- bill_id, file_id

### Payment
- user_id, bill_id (FK), amount (> 0), currency, method (PaymentMethod), provider (PaymentProvider), provider_payment_id (unique, nullable), status (PaymentStatus), paid_at, notes

### WebhookEvent
- provider, event_id (unique), event_type, payload (JSONB), processed_at (nullable). `created_at` only.

### EmailLog
- user_id, bill_id (nullable), to_email, template (EmailTemplate), resend_message_id (nullable), status (EmailStatus), error (nullable text). `created_at` only.

**Totals: 15 models · 1 initial Alembic migration** (`0001_initial`). Enums are stored as `VARCHAR` with CHECK constraints (`native_enum=False`) so later migrations stay simple.

---

## CORE DOMAIN LOGIC (BACKEND-AGENT owns; TEST-AGENT must cover 100%)

### `services/billing_engine.py`
```python
def advance(d: date, frequency: BillingFrequency, interval: int, anchor_day: int) -> date:
    """Next billing date. Monthly/quarterly/yearly use relativedelta and clamp to month-end,
    re-anchoring to `anchor_day` (start_date.day) so Jan 31 → Feb 28 → Mar 31, never drifting."""

def preview_schedule(plan: BillingPlan, count: int = 6) -> list[date]: ...

def compute_totals(items: list[LineItemIn], tax_rate: Decimal) -> Totals:
    """amount = qty*unit_price quantized to 0.01 ROUND_HALF_UP; tax on subtotal; total = subtotal + tax."""

def allocate_bill_number(db: Session, user_id: int) -> str:
    """SELECT business_profile FOR UPDATE; return f"{prefix}{n:05d}"; increment."""

def generate_bill_for_period(db: Session, plan: BillingPlan, period_start: date) -> Bill | None:
    """Snapshot plan line items → Bill. Returns None if (plan_id, period_start) already exists
    (catch IntegrityError on the unique constraint inside a SAVEPOINT)."""

def recalc_bill_status(bill: Bill, today: date) -> None:
    """amount_paid = sum(succeeded payments). paid if >= total; partially_paid if > 0;
    overdue if past due_date and unpaid; else keep draft/sent. cancelled is terminal."""
```

### Scheduler jobs (`jobs/scheduler.py`, daily at `SCHEDULER_CRON_HOUR` UTC; each job opens its own session)
1. `generate_due_bills`: for each `active` plan with `next_billing_date <= today` and (`end_date` is null or `next_billing_date <= end_date`), loop to catch up on missed periods. For each period, call `generate_bill_for_period`, then `advance` the plan. If `auto_send` is on, call `send_bill`. Commit per plan, so one failure doesn't block the others.
2. `mark_overdue_bills`: bills in `sent`/`partially_paid` whose `due_date < today` move to `overdue`.
3. `send_overdue_reminders` *(post-MVP)*: send when `today - due_date` is in `reminder_days_after_due` and no reminder for that day exists in `EmailLog`.

### `services/bill_sender.py → send_bill(db, bill)`
1. Render the PDF (`pdf_service.render_bill(bill, profile, customer)`), store it, and set `pdf_file_id`.
2. Create the Dodo payment link if it's missing (`dodo_service`). Store `payment_link_url` and `dodo_checkout_id`.
3. Email the customer via `email_service.send(template="bill_sent", attachments=[pdf])`. The email includes the public link `APP_BASE_URL/pay/{public_token}`.
4. Set `status=sent` and `sent_at`.
5. **If the email fails:** the bill stays `draft` with an `EmailLog(status=failed)`. A send error is never raised past the scheduler loop.

### Dodo webhook (`POST /api/v1/webhooks/dodo`)
1. Verify the signature against the raw body using `DODO_PAYMENTS_WEBHOOK_SECRET`. If it's invalid, return **401**.
2. Insert a `WebhookEvent(event_id)`. If the event_id already exists, it's a duplicate: return **200** and do nothing.
3. On a payment-succeeded event, find the bill by `dodo_checkout_id` or metadata `bill_id`. Create `Payment(provider=dodo, provider_payment_id unique)`, run `recalc_bill_status`, and send the `receipt` email.
4. Set `processed_at` and return 200.

---

## MODULES

### Module 1: Authentication
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/register | Create account, send verification email (rate-limited) |
| POST | /api/v1/auth/verify-email | Verify with token |
| POST | /api/v1/auth/login | Email/password → `{accessToken, refreshToken, tokenType}` (rate-limited) |
| POST | /api/v1/auth/refresh | Rotate refresh token |
| POST | /api/v1/auth/logout | Revoke refresh token |
| POST | /api/v1/auth/forgot-password | Email reset link (always 200, no user enumeration) |
| POST | /api/v1/auth/reset-password | Reset with single-use token (1 h expiry) |
| GET | /api/v1/auth/me | Current user |
| PUT | /api/v1/auth/me | Update name / password |
| GET | /api/v1/auth/google | Redirect to Google, set signed `state` cookie |
| GET | /api/v1/auth/google/callback | Verify state, upsert user, redirect to `APP_BASE_URL/oauth/callback#tokens` |

| Route | Page | Components |
|-------|------|------------|
| /login | LoginPage | LoginForm, GoogleButton, GradientButton |
| /register | RegisterPage | RegisterForm, GoogleButton |
| /verify-email | VerifyEmailPage | StatusCard |
| /forgot-password | ForgotPasswordPage | EmailForm |
| /reset-password | ResetPasswordPage | PasswordForm |
| /oauth/callback | OAuthCallbackPage | (stores tokens, redirects) |
| /profile | ProfilePage | ProfileForm, ChangePasswordForm |

---

### Module 2: Business Profile & Uploads
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/business-profile | Get (404 if not onboarded) |
| PUT | /api/v1/business-profile | Upsert |
| POST | /api/v1/uploads | Multipart upload; logo: PNG/JPG/SVG ≤ 2 MB; others ≤ `MAX_UPLOAD_MB` (sniff magic bytes; sanitize SVG or rasterize) |
| GET | /api/v1/uploads/{id} | Stream file (owner only) |
| DELETE | /api/v1/uploads/{id} | Delete |

| Route | Page | Components |
|-------|------|------------|
| /onboarding | OnboardingPage | Stepper: BusinessProfileForm → CustomerForm → PlanForm |
| /settings | SettingsPage | BusinessProfileForm, LogoUploader, BillingDefaultsForm, ReminderScheduleForm |

---

### Module 3: Customers
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/customers | List, `?q=&active=true&page=` with `balanceDue` per row |
| POST | /api/v1/customers | Create |
| GET | /api/v1/customers/{id} | Detail + plans + recent bills + balanceDue |
| PUT | /api/v1/customers/{id} | Update |
| DELETE | /api/v1/customers/{id} | Archive (`is_active=false`); 409 if active plans exist |

| Route | Page | Components |
|-------|------|------------|
| /customers | CustomersPage | SearchInput, CustomerTable, EmptyState |
| /customers/new | CustomerCreatePage | CustomerForm |
| /customers/:id | CustomerDetailPage | CustomerHeader, PlanList, BillTable, PaymentList |
| /customers/:id/edit | CustomerEditPage | CustomerForm |

---

### Module 4: Billing Plans
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/billing-plans | List, `?customerId=&status=` |
| POST | /api/v1/billing-plans | Create with ≥ 1 line item; sets `next_billing_date = start_date` |
| GET | /api/v1/billing-plans/{id} | Detail + `upcomingDates` (next 6) + totals |
| PUT | /api/v1/billing-plans/{id} | Update (future bills only; replaces line items) |
| POST | /api/v1/billing-plans/{id}/pause | active → paused |
| POST | /api/v1/billing-plans/{id}/resume | paused → active (does NOT backfill paused periods; next date rolls forward to ≥ today) |
| POST | /api/v1/billing-plans/{id}/cancel | → cancelled (terminal) |
| POST | /api/v1/billing-plans/{id}/generate-now | Generate the next period's bill immediately |

| Route | Page | Components |
|-------|------|------------|
| /plans | PlansPage | PlanTable (customer, total, frequency, next date, StatusBadge) |
| /plans/new | PlanCreatePage | PlanForm, LineItemEditor, SchedulePreview, TotalsSummary |
| /plans/:id | PlanDetailPage | PlanHeader, SchedulePreview, BillTable, PlanActions |
| /plans/:id/edit | PlanEditPage | PlanForm, LineItemEditor |

---

### Module 5: Bills / Invoices
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/bills | List, `?status=&customerId=&from=&to=` |
| POST | /api/v1/bills | Create one-off bill (draft) |
| GET | /api/v1/bills/{id} | Detail + line items + payments + email history |
| PUT | /api/v1/bills/{id} | Edit (draft only, else 409) |
| POST | /api/v1/bills/{id}/send | `send_bill` (draft/sent → re-send) |
| POST | /api/v1/bills/{id}/remind | Send reminder now (sent/partially_paid/overdue) |
| POST | /api/v1/bills/{id}/cancel | Void (409 if any payment exists) |
| GET | /api/v1/bills/{id}/pdf | Download PDF (render on demand if missing) |
| GET | /api/v1/public/bills/{publicToken} | Public read-only bill + business branding + payment link (rate-limited, no auth) |

| Route | Page | Components |
|-------|------|------------|
| /bills | BillsPage | StatusTabs, BillTable, DateRangeFilter |
| /bills/new | BillCreatePage | CustomerSelect, LineItemEditor, TotalsSummary |
| /bills/:id | BillDetailPage | BillPreview (PDF iframe), BillActions, PaymentList, RecordPaymentModal, EmailHistory |
| /pay/:publicToken | PublicBillPage | PublicBillView, PayNowButton (public layout, no app shell) |

---

### Module 6: Payments
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/payments | List, `?customerId=&method=&from=&to=` |
| POST | /api/v1/bills/{id}/payments | Record manual payment (rejects overpayment → 400) |
| DELETE | /api/v1/payments/{id} | Delete manual payment only; recalc bill |
| POST | /api/v1/webhooks/dodo | Dodo webhook (see Core Domain Logic) |

| Route | Page | Components |
|-------|------|------------|
| /payments | PaymentsPage | PaymentTable, filters |
| (modal on /bills/:id) | RecordPaymentModal | PaymentForm |

---

### Module 7: Dashboard & Analytics
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/analytics/summary | `{mrr, collectedThisMonth, outstanding, overdueAmount, overdueCount, activePlans, upcomingBills[7d]}` (**MVP**) |
| GET | /api/v1/analytics/revenue?months=12 | `[{month, billed, collected}]` *(post-MVP)* |
| GET | /api/v1/analytics/aging | `{"0-30","31-60","61-90","90+"}` amounts *(post-MVP)* |
| GET | /api/v1/analytics/top-customers?limit=5 | *(post-MVP)* |

MRR = Σ over active plans of plan_total normalized to a month (weekly × 52/12, quarterly ÷ 3, yearly ÷ 12, ÷ interval_count). It's reported in the business's default currency, and plans in other currencies are excluded with a note.

| Route | Page | Components |
|-------|------|------------|
| /dashboard | DashboardPage | StatTile ×4, UpcomingBillsList, RecentPayments; RevenueChart, AgingChart *(post-MVP)* |

---

### Module 8: Admin Panel *(post-MVP)*
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/admin/users | List/search users (`require_admin`) |
| PUT | /api/v1/admin/users/{id} | Toggle is_active / is_admin (can't demote self) |
| GET | /api/v1/admin/stats | Users, active plans, bills sent (30d), payment volume |
| GET | /api/v1/admin/email-logs | Recent failed emails |

| Route | Page | Components |
|-------|------|------------|
| /admin | AdminDashboardPage | StatTiles, FailedEmailsTable |
| /admin/users | AdminUsersPage | UserTable, toggles |

### Health
| GET | /health | DB ping + scheduler status → `{status, db, scheduler}` |

---

## AGENT ASSIGNMENTS

```yaml
DATABASE-AGENT:
  skills: [skills/DATABASE.md]
  outputs: backend/app/database.py, models/base.py, models/*.py (15 models), models/__init__.py,
           alembic.ini, alembic/env.py, alembic/versions/0001_initial.py, app/enums.py
  done_when: alembic upgrade head && alembic downgrade base && alembic upgrade head succeed

BACKEND-AGENT:
  skills: [skills/BACKEND.md]
  outputs: main.py (lifespan starts scheduler), config.py, schemas/ (APIModel base),
           auth/, routers/ (11 routers), services/ (billing_engine, bill_sender, pdf_service,
           email_service, dodo_service, storage_service, analytics_service), jobs/scheduler.py,
           templates/ (bill.html, emails/*.html), requirements.txt, .env.example (backend keys)
  done_when: ruff clean, OpenAPI loads at /docs, all endpoints listed above present

FRONTEND-AGENT:
  skills: [skills/FRONTEND.md]
  outputs: Vite app, theme.ts, types/api.ts (mirrors contracts), services/api.ts (axios + refresh
           interceptor), context/AuthContext.tsx, hooks/use*.ts (react-query), components/, pages/ (25),
           AppRouter with ProtectedRoute + AdminRoute + PublicLayout
  done_when: npm run lint && npm run type-check && npm run build

DEVOPS-AGENT:   # no agents/devops-agent.md yet. Brief inline from this PRP + skills/DEPLOYMENT.md
  skills: [skills/DEPLOYMENT.md]
  outputs: backend/Dockerfile (python:3.11-slim + WeasyPrint system libs: libpango-1.0-0,
           libpangoft2-1.0-0, libharfbuzz0b, fonts-dejavu), frontend/Dockerfile + nginx.conf,
           docker-compose.yml (db, backend, frontend; healthchecks; volume for uploads),
           .env.example (root), .gitignore (.env, uploads/, node_modules, __pycache__, .claude/settings.local.json),
           .github/workflows/ci.yml (ruff, pytest w/ postgres service, npm lint/type-check/test/build)
  done_when: docker-compose config && docker-compose build

TEST-AGENT:     # no agents/test-agent.md yet. Brief inline
  skills: [skills/TESTING.md]
  focus: billing_engine (month-end, catch-up, idempotency via double run), money rounding,
         webhook (bad signature, duplicate event, partial payment), tenancy (cross-user 404),
         auth flows; Resend/Dodo mocked; freezegun for dates. Frontend: forms, LineItemEditor
         totals display, ProtectedRoute, BillsPage status tabs (MSW).
  done_when: pytest --cov=app --cov-fail-under=80 && npm test

REVIEW-AGENT:   # no agents/review-agent.md yet. Brief inline
  checklist: CLAUDE.md forbidden patterns, tenancy filter on every query, no float money,
             webhook signature + idempotency, OAuth state, rate limits, upload validation,
             Jinja autoescape, no secrets in code, no `any`, no console.log, no inline styles
```

---

## PHASE EXECUTION PLAN

**Phase 1: Foundation (4 agents in parallel)**
- DATABASE-AGENT: `enums.py`, all 15 models, initial migration, `database.py`
- BACKEND-AGENT: `main.py` (+ `/health`, CORS, lifespan, slowapi), `config.py` (all env vars from CLAUDE.md), `schemas/base.py` (APIModel, Page[T], Money), exception handlers, empty router registration, `requirements.txt`
- FRONTEND-AGENT: Vite + TS strict, Chakra provider + theme, `types/api.ts` (all enums + entity interfaces from this PRP), axios client, AuthContext skeleton, layouts (AppShell with sidebar, PublicLayout), router with placeholder pages
- DEVOPS-AGENT: Dockerfiles, docker-compose, `.env.example`, `.gitignore`, CI workflow

**Validation Gate 1:** `pip install -r backend/requirements.txt`, `alembic upgrade head`, `npm install && npm run type-check`, `docker-compose config`

**Phase 2A: Core modules (backend + frontend in parallel per module)**
- Auth: JWT + refresh rotation + Google OAuth + Resend verify/reset ↔ auth pages
- Business Profile & Uploads ↔ Settings + Onboarding
- Customers ↔ Customer pages

**Phase 2B: Billing engine (depends on 2A)**
- Billing Plans + `billing_engine` ↔ Plan pages with SchedulePreview
- Bills + `pdf_service` + `email_service` + `bill_sender` + scheduler jobs 1–2 ↔ Bill pages + PublicBillPage
- Payments + `dodo_service` + webhook ↔ PaymentsPage + RecordPaymentModal
- Dashboard summary endpoint ↔ DashboardPage tiles + upcoming bills

**Validation Gate 2 (MVP gate):** `ruff check backend/`, `mypy backend/app`, `npm run lint`, `npm run type-check`, `pytest backend/tests/test_billing_engine.py backend/tests/test_webhooks.py -v`

**Phase 2C: Post-MVP features (parallel)**
- Overdue reminders job 3 + ReminderScheduleForm
- Analytics revenue/aging/top-customers ↔ Recharts charts
- Admin panel (API + pages)
- Bill attachments

**Validation Gate 2C:** same as Gate 2

**Phase 3: Quality (3 agents in parallel)**
- TEST-AGENT: pytest + Vitest/RTL to ≥ 80% backend coverage (100% on `billing_engine`)
- REVIEW-AGENT: security and quality audit against the checklist above; files findings as fixes
- RESEARCH-AGENT: confirm the Dodo, Resend and WeasyPrint integration details from the research items above match the implementation

**Final Validation:** full test suite, `docker-compose build && docker-compose up -d`, `curl localhost:8000/health`, then a manual smoke test: register → onboard → customer → plan starting today → trigger `generate-now` → bill emailed (Resend test mode) → pay via Dodo test mode → bill shows **paid**

---

## VALIDATION GATES

| Gate | Commands |
|------|----------|
| 1 | `alembic upgrade head`, `npm install`, `npm run type-check`, `docker-compose config` |
| 2 | `ruff check backend/`, `mypy backend/app`, `npm run lint`, `npm run type-check`, `pytest backend/tests/test_billing_engine.py backend/tests/test_webhooks.py` |
| 3 | `pytest --cov=app --cov-fail-under=80`, `npm test` |
| Final | `docker-compose up -d`, `curl localhost:8000/health`, E2E smoke flow above |

---

## ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/bill_maker

# Auth
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

# Resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=billing@yourdomain.com

# Dodo Payments
DODO_PAYMENTS_API_KEY=...
DODO_PAYMENTS_WEBHOOK_SECRET=...
DODO_PAYMENTS_ENVIRONMENT=test_mode

# Storage
STORAGE_BACKEND=local
UPLOAD_DIR=./uploads
S3_BUCKET=
S3_ENDPOINT_URL=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
MAX_UPLOAD_MB=5

# Scheduler
SCHEDULER_ENABLED=true
SCHEDULER_CRON_HOUR=6

# App
APP_BASE_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173

# Frontend
VITE_API_URL=http://localhost:8000
```

---

## RISKS & DECISIONS

| Risk | Mitigation |
|------|------------|
| Double-billing if the scheduler runs twice or on two instances | DB unique `(plan_id, period_start)` + `SCHEDULER_ENABLED` on one instance only |
| Month-end drift (31st → 28th → 28th…) | Re-anchor to `start_date.day` on every advance; tested explicitly |
| Duplicate or forged webhooks | Signature verification + `WebhookEvent.event_id` unique + `provider_payment_id` unique |
| Email outage blocks billing | Send failures are logged, never roll back the bill; "Resend" button in UI |
| WeasyPrint system deps on Windows dev | Run backend via Docker for PDF work; document the GTK runtime for native Windows |
| Dodo per-bill dynamic amount | Research item #1; isolated behind `dodo_service` |
| Multi-currency analytics | MVP reports in default currency only; other currencies excluded and flagged |

---

## NEXT STEP

Execute with parallel agents:

```bash
/execute-prp PRPs/bill-maker-prp.md
```
