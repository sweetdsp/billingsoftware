# Bill Maker

Recurring billing for small businesses. An owner sets up a billing plan once, and Bill Maker
generates each bill on schedule, emails it as a PDF with a pay link, and marks it paid when the
customer pays.

## How it works

1. **Set up** a business profile (name, logo, currency, bill numbering, default due days and tax).
2. **Add customers** and create a **billing plan** for each: line items, frequency
   (weekly / monthly / quarterly / yearly), interval, start and end date.
3. A **daily scheduler job** generates every due bill, once only, and emails it
   (PDF attached, plus a public pay link) if the plan has auto-send on.
4. The customer opens the public bill page and pays online through **Dodo Payments**.
   A signed webhook records the payment and marks the bill paid.
5. Cash, bank transfers and cheques can be recorded manually.

## Tech stack

| Area | Technology |
|------|------------|
| Backend | FastAPI, Python 3.11+, SQLAlchemy, Alembic, APScheduler, WeasyPrint |
| Database | PostgreSQL |
| Frontend | React, Vite, TypeScript, Chakra UI, Framer Motion, Recharts, TanStack Query |
| Auth | Email + password (bcrypt), Google OAuth, JWT with rotating refresh tokens |
| Email | Resend |
| Payments | Dodo Payments |

## Project status

| Area | State |
|------|-------|
| Auth, business profile and uploads, customers | Built, with tests |
| Billing plans and billing engine (schedule math, bill generation) | Built |
| Bills: create, edit, send, remind, cancel, PDF, public bill page | Built, tests written |
| Payments: manual payments and the Dodo webhook | Built, tests written |
| Daily scheduler jobs (generate due bills, mark overdue) | Built |
| Analytics endpoints (summary, revenue, aging, top customers) | Built |
| Frontend: auth, onboarding, settings, customers | Built |
| Frontend: plans, bills, payments, dashboard, public bill page | Page shells only |
| Overdue reminder job, admin panel API, bill attachments | Not built yet |

The new bills, payments and webhook tests have not been run against a database yet.
The full plan lives in [`PRPs/bill-maker-prp.md`](PRPs/bill-maker-prp.md).

## Getting started

### 1. Create your `.env`

`.env` is git-ignored and there is no example file in the repo. Create `.env` in the project
root with the variables listed under **Environment Variables** in [`CLAUDE.md`](CLAUDE.md). Docker
Compose also needs `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`. Never commit real keys.

### 2. Run with Docker (recommended)

```bash
make dev        # hot-reload stack: frontend :5173, backend :8000, postgres :5432
make up         # production-like stack: frontend :3000, backend :8000
make down
```

Without `make`, use `docker compose -f docker-compose.dev.yml up --build` (dev) or
`docker compose up --build -d` (production-like). The backend container runs
`alembic upgrade head` on start when `RUN_MIGRATIONS=true`. Health check:
`curl localhost:8000/health`.

Docker is the easiest way to get PDF rendering working: WeasyPrint needs the Pango system
libraries, which are awkward to install on Windows.

### 3. Run without Docker

```bash
# Backend
cd backend
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload     # http://localhost:8000, docs at /docs

# Frontend
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

This needs a running PostgreSQL that matches `DATABASE_URL`.

## Testing and linting

Backend tests run against a real PostgreSQL database (the models use JSONB), taken from
`TEST_DATABASE_URL`. Each test runs in a transaction that is rolled back afterwards.

```bash
make test       # backend (coverage >= 80%) and frontend tests
make lint       # ruff, mypy, eslint, tsc

# or individually
cd backend && pytest
cd backend && ruff check . && ruff format --check . && mypy app
cd frontend && npm test && npm run lint && npm run type-check
```

GitHub Actions (`.github/workflows/ci.yml`) runs the same checks plus a Docker build on every push.

## API overview

All endpoints live under `/api/v1/`. Interactive docs are at `/docs` outside production.

| Resource | Endpoints |
|----------|-----------|
| Auth | register, login, refresh, logout, verify email, password reset, Google OAuth |
| Business profile and uploads | `/business-profile`, `/uploads` |
| Customers | `/customers` (soft delete) |
| Billing plans | `/billing-plans` (pause, resume, cancel, generate now) |
| Bills | `/bills` (send, remind, cancel, `/pdf`, `/payments`) |
| Payments | `/payments` |
| Analytics | `/analytics/summary`, `/revenue`, `/aging`, `/top-customers` |
| Public | `/public/bills/{publicToken}` (no auth, rate-limited) |
| Webhooks | `/webhooks/dodo` (signature verified) |

Money is always a decimal string such as `"1250.00"` with a currency code. Totals are computed
on the server only.

## Project layout

```
backend/
  app/
    models/      SQLAlchemy models
    schemas/     Pydantic request/response models
    routers/     HTTP endpoints
    services/    business logic (billing_engine, bill_service, bill_sender,
                 payment_service, dodo_service, pdf_service, email_service)
    jobs/        scheduler and daily billing jobs
    templates/   bill PDF and email HTML
  alembic/       migrations
  tests/
frontend/src/    components, pages, hooks, services, context, types
PRPs/            product requirements and build plan
```

## Design rules

- Every record is scoped to a user. Another user's record returns 404, never 403.
- Bill generation is idempotent: `(plan_id, period_start)` is unique, so the scheduler can
  run any number of times.
- Bill numbers are allocated under a row lock, so they are unique per user even under concurrent requests.
- Money uses `Decimal` and `Numeric(12, 2)`, never floats. Rounding is half-up to 2 places.
- Webhooks are verified, stored once by event id, and payments are unique by provider payment
  id, so a replayed delivery never creates a duplicate payment.
- Email failures never roll back a bill or payment. They are logged and shown in the bill's
  email history.
- Public bill pages use an unguessable token, never the numeric id.

## Contributing notes

Project conventions (code style, forbidden patterns, commit format) are in
[`CLAUDE.md`](CLAUDE.md). Commit messages follow `feat(module): ...`, `fix(module): ...` and so on.
`.claude/commands/`, `agents/` and `skills/` hold the Claude Code workflow files this project was
scaffolded with.
