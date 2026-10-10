# CLAUDE.md - Bill Maker Project Rules

> Project-specific rules for Claude Code. This file is read automatically.

---

## Project Overview

**Project Name:** Bill Maker
**Description:** Recurring billing for small businesses. Owners set up a plan once, and Bill Maker generates, emails, and collects payment on every bill automatically.
**Tech Stack:**
- Backend: FastAPI + Python 3.11+ (APScheduler, WeasyPrint)
- Frontend: React + Vite + TypeScript
- Database: PostgreSQL + SQLAlchemy + Alembic
- Auth: Email/Password (bcrypt) + Google OAuth, JWT
- UI: Chakra UI + Framer Motion (Recharts for charts)
- Email: Resend
- Payments: Dodo Payments

---

## Project Structure

```
bill-maker/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── user.py              # User, RefreshToken, PasswordResetToken, EmailVerificationToken
│   │   │   ├── business_profile.py  # BusinessProfile
│   │   │   ├── upload.py            # UploadedFile
│   │   │   ├── customer.py          # Customer
│   │   │   ├── billing_plan.py      # BillingPlan, PlanLineItem
│   │   │   ├── bill.py              # Bill, BillLineItem, BillAttachment
│   │   │   ├── payment.py           # Payment, WebhookEvent
│   │   │   └── email_log.py         # EmailLog
│   │   ├── schemas/
│   │   ├── routers/
│   │   │   ├── auth.py, business_profile.py, uploads.py, customers.py
│   │   │   ├── billing_plans.py, bills.py, payments.py, webhooks.py
│   │   │   ├── public.py, analytics.py, admin.py
│   │   ├── services/
│   │   │   ├── billing_engine.py    # schedule math + bill generation
│   │   │   ├── pdf_service.py       # WeasyPrint rendering
│   │   │   ├── email_service.py     # Resend wrapper
│   │   │   ├── dodo_service.py      # pay links + webhook verification
│   │   │   └── storage_service.py   # local / S3
│   │   ├── jobs/
│   │   │   └── scheduler.py         # APScheduler daily jobs
│   │   ├── templates/               # Jinja2: bill PDF + email HTML
│   │   └── auth/
│   ├── alembic/
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── context/
│   │   └── types/
│   └── package.json
├── .claude/
│   └── commands/
├── skills/
├── agents/
└── PRPs/
```

---

## Code Standards

### Python (Backend)
```python
# ALWAYS use type hints
def get_bill(db: Session, user_id: int, bill_id: int) -> Bill:
    pass

# ALWAYS add docstrings for public functions
def create_bill_from_plan(db: Session, plan: BillingPlan, period_start: date) -> Bill:
    """
    Generate a bill for one billing period of a plan.

    Args:
        db: Database session
        plan: Active billing plan
        period_start: Start date of the period being billed

    Returns:
        Created Bill object (or the existing one if already generated)
    """
    pass

# Plain `def` endpoints: the SQLAlchemy Session is synchronous, so FastAPI runs these in
# its threadpool. `async def` + sync DB calls would block the event loop.
@router.get("/bills/{bill_id}")
def read_bill(bill_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pass

# Routers using @limiter.limit must NOT use `from __future__ import annotations`
# (slowapi's wrapper breaks FastAPI's annotation resolution).
```

### TypeScript (Frontend)
```typescript
// ALWAYS define interfaces for props and data
type BillStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "cancelled";

interface Bill {
  id: number;
  billNumber: string;
  customerId: number;
  issueDate: string;
  dueDate: string;
  total: string;      // money is a decimal string from the API, never a float
  amountPaid: string;
  currency: string;
  status: BillStatus;
}

// NO any types allowed
const fetchBill = async (id: number): Promise<Bill> => {
  // ...
};
```

---

## Forbidden Patterns

### Backend
- ❌ Never use `print()`. Use the `logging` module.
- ❌ Never store passwords in plain text. Use bcrypt.
- ❌ Never hardcode secrets. Use environment variables (Resend, Dodo, Google, JWT).
- ❌ Never use `SELECT *`. Specify columns.
- ❌ Never skip input validation.
- ❌ Never use `float` for money. Use `Decimal` in Python and `Numeric(12, 2)` in the DB.
- ❌ Never send email via SMTP or Gmail credentials. Use Resend only.
- ❌ Never trust a webhook without verifying its signature.

### Frontend
- ❌ Never use `any` type
- ❌ Never leave console.log in production
- ❌ Never skip error handling in async operations
- ❌ Never use inline styles. Use Chakra UI style props or theme.
- ❌ Never compute bill totals on the client for persistence (display only)

---

## Module-Specific Rules

### Multi-tenancy (all modules)
- Every business record (customers, plans, bills, payments, uploads) has a `user_id` FK.
- Every query MUST filter by the current user's `user_id`. Return 404 (not 403) for another user's record.

### Customers Module
- Customers are soft-deleted (`is_active = False`). Never hard delete a customer with bills.
- `email` is required (bills are delivered by email).

### Billing Plans Module
- `frequency` must be one of: `weekly`, `monthly`, `quarterly`, `yearly`; `interval_count >= 1`.
- `status` must be one of: `active`, `paused`, `cancelled`.
- Use `dateutil.relativedelta` for schedule math. Month-end dates clamp to the last day of the month.
- Editing a plan affects future bills only; never mutate already-generated bills.
- A plan must have at least one line item.

### Bills Module
- `status` must be one of: `draft`, `sent`, `partially_paid`, `paid`, `overdue`, `cancelled`.
- Bill generation MUST be idempotent: unique constraint on `(plan_id, period_start)`.
- `bill_number` is unique per user: `{prefix}{next_bill_number:05d}`, allocated with row lock (`SELECT ... FOR UPDATE`).
- Line items are copied from the plan at generation time (snapshot).
- Totals are always computed server-side: `amount = quantity * unit_price`, rounded `ROUND_HALF_UP` to 2 dp.
- Only `draft` bills may be edited; sent bills can only be cancelled.
- Public bill links use `public_token` (`secrets.token_urlsafe(32)`), never the numeric id.
- Escape all user-supplied text in PDF/email templates (Jinja2 autoescape on).

### Payments Module
- `amount_paid` = sum of succeeded payments; status recalculated after every payment change.
- Dodo webhooks: verify signature → store in `WebhookEvent` (unique `event_id`) → process once.
- `provider_payment_id` is unique, so duplicate webhook deliveries never create duplicate payments.
- Overpayment is rejected for manual payments.

### Email (Resend)
- All sends go through `services/email_service.py` and are logged to `EmailLog`.
- Email failures must never roll back the bill/payment transaction. Log and surface them in the UI.
- Sender address comes from `RESEND_FROM_EMAIL` (must be a verified Resend domain).

### Scheduler
- Jobs run daily (configurable cron) and must be safe to run multiple times.
- In multi-instance deployments only one instance runs the scheduler (`SCHEDULER_ENABLED` env flag).

### Admin
- Admin routes require `is_admin = True`; return 403 otherwise.

---

## API Conventions

- All endpoints prefixed with `/api/v1/`
- Use plural nouns for resources: `/customers`, `/billing-plans`, `/bills`, `/payments`
- Money fields are serialized as decimal strings (`"1250.00"`) with an ISO 4217 `currency`
- Dates are ISO 8601 (`YYYY-MM-DD`); timestamps are UTC
- Return appropriate HTTP status codes:
  - 200: Success
  - 201: Created
  - 400: Bad Request
  - 401: Unauthorized
  - 403: Forbidden (admin routes)
  - 404: Not Found
  - 409: Conflict
  - 422: Validation Error

---

## Authentication

### JWT Configuration
- Access token expires: 30 minutes
- Refresh token expires: 7 days (stored hashed, revocable)
- Algorithm: HS256

### Email/Password
- Passwords hashed with bcrypt
- Verification and reset emails sent via Resend; tokens stored hashed, single-use
- Reset tokens expire in 1 hour

### OAuth Providers
- Google OAuth 2.0 enabled
- Always verify state parameter for CSRF protection
- Link Google login to existing account by verified email

---

## Environment Variables

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

# Resend (email)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=billing@yourdomain.com

# Dodo Payments
DODO_PAYMENTS_API_KEY=...
DODO_PAYMENTS_WEBHOOK_SECRET=...
DODO_PAYMENTS_ENVIRONMENT=test_mode

# File storage
STORAGE_BACKEND=local            # local | s3
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
APP_BASE_URL=http://localhost:5173   # used for public bill / pay links in emails

# Frontend
VITE_API_URL=http://localhost:8000
```

---

## Development Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Docker
docker-compose up -d

# Tests
pytest backend/tests -v
cd frontend && npm test

# Linting
ruff check backend/
cd frontend && npm run lint && npm run type-check
```

---

## Validation

```bash
ruff check backend/ && pytest
npm run lint && npm run type-check
docker-compose build
```

---

## Commit Message Format

```
feat([module]): add [feature]
fix([module]): fix [bug]
refactor([module]): refactor [component]
test([module]): add tests for [feature]
docs: update [documentation]
```

Modules: `auth`, `business-profile`, `customers`, `plans`, `bills`, `payments`, `analytics`, `admin`, `scheduler`, `email`

---

## Workflow

```
1. Edit INITIAL.md (define product)
2. /generate-prp INITIAL.md
3. /execute-prp PRPs/bill-maker-prp.md
```

---

## Skills Reference

| Task | Skill to Read |
|------|---------------|
| Database models | skills/DATABASE.md |
| API + Auth | skills/BACKEND.md |
| React + UI | skills/FRONTEND.md |
| Testing | skills/TESTING.md |
| Deployment | skills/DEPLOYMENT.md |

---

## Agent Coordination

For complex tasks, the ORCHESTRATOR coordinates:
- DATABASE-AGENT → Backend models
- BACKEND-AGENT → API development
- FRONTEND-AGENT → UI components
- TEST-AGENT → Testing
- REVIEW-AGENT → Code review
- DEVOPS-AGENT → Deployment

Read agent definitions in `/agents/` folder.
