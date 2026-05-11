# Email Campaign Platform

An in-house email campaign platform for managing contacts, building email templates, sending campaigns, tracking engagement, handling unsubscribes, and viewing analytics.

The project is a PNPM monorepo with a React/Vite frontend, Express API, background worker, PostgreSQL database, Prisma ORM, and optional AWS SES/SQS/S3 integration.

## Features

- Admin login, JWT authentication, refresh tokens, logout, password reset, and role-based access.
- Three admin roles: Super Admin, Campaign Manager, and Viewer.
- Contact list management with CSV preview/import, search, pagination, contact detail, segments, and suppression list.
- Email template library and block-based template editor.
- Campaign creation wizard with details, recipients, design, review, send now, schedule, test send, pause/resume/cancel, progress, and reports.
- Open and click tracking through public tracking routes.
- Bounce and complaint handling through SES webhook processing.
- Public unsubscribe page and preference center.
- Dashboard and campaign analytics.
- Seed data for demo users, contacts, lists, templates, segment, and campaign.

## Tech Stack

- Frontend: React 19, Vite, TypeScript
- Backend: Node.js, Express, TypeScript
- Worker: Node.js, TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Email/Queue/Storage: AWS SES, SQS, S3
- Tests: Playwright and smoke API checks

## Repository Structure

```txt
apps/
  api/       Express API
  web/       React/Vite frontend
  worker/    Background sending and scheduled campaign worker
prisma/      Prisma schema and migrations
scripts/     Smoke and frontend tests
docs/        Deployment and readiness documentation
```

## Prerequisites

- Node.js 22+
- PNPM 11+
- PostgreSQL
- AWS account for production SES/SQS/S3 sending

On Windows PowerShell, use `pnpm.cmd` if `pnpm` is blocked by script execution policy.

## Local Setup

Install dependencies:

```bash
pnpm install
```

Create local environment file:

```bash
cp .env.example .env
```

Update `.env` with your local PostgreSQL URL and secrets. Never commit `.env`.

Generate Prisma client and migrate the database:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Start the services:

```bash
pnpm start:api
pnpm start:web
pnpm start:worker
```

Local URLs:

```txt
Web: http://localhost:5173
API: http://localhost:4000
Health: http://localhost:4000/health
```

## Demo Accounts

After running `pnpm db:seed`:

```txt
Super Admin: manapuramshiri17@gmail.com / Admin@123
Campaign Manager: yasalapun@gmail.com / Admin@123
Viewer: nikhilyasalapu77@gmail.com / Admin@123
```

Change or remove these before real production use.

## Environment Variables

See `.env.example` for the full list.

Important variables:

```env
DATABASE_URL="postgresql://..."
JWT_ACCESS_SECRET="..."
JWT_REFRESH_SECRET="..."
API_PORT=4000
WEB_ORIGIN="http://localhost:5173"
VITE_API_BASE_URL="http://localhost:4000"
PUBLIC_API_URL="http://localhost:4000"
EMAIL_PROVIDER=dev
AWS_REGION="ap-south-1"
SES_FROM_EMAIL="verified@example.com"
S3_BUCKET=""
SQS_SEND_QUEUE_URL=""
SQS_EVENTS_QUEUE_URL=""
```

Use `EMAIL_PROVIDER=dev` for local development. Use `EMAIL_PROVIDER=ses` only after AWS SES, SQS, S3, and credentials are configured.

## Scripts

```bash
pnpm dev            # Run all app dev servers in parallel
pnpm build          # Build API, web, and worker
pnpm typecheck      # TypeScript checks
pnpm verify         # Typecheck and build
pnpm db:generate    # Generate Prisma client
pnpm db:migrate     # Run Prisma migrations
pnpm db:seed        # Seed demo data
pnpm test:smoke     # API smoke test
pnpm test:frontend  # Playwright frontend/route test
```

## Verification

Run:

```bash
pnpm verify
pnpm test:smoke
pnpm test:frontend
```

The smoke test expects the API to be running. The frontend test expects both API and web to be running.

## Deployment

Recommended deployment:

- Vercel: `apps/web`
- Render Web Service: `apps/api`
- Render Background Worker: `apps/worker`
- Render PostgreSQL, Neon, Supabase, or another managed PostgreSQL provider

PostgreSQL is deployed separately. The API and worker connect to it through `DATABASE_URL`.

Full deployment instructions are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Production Checklist

- Rotate any local/demo credentials before production.
- Use long unique JWT secrets.
- Use a managed PostgreSQL database and run migrations.
- Verify SES sender identity/domain.
- Move SES out of sandbox before sending to real recipients.
- Configure SQS queues and SES event handling.
- Configure S3 bucket permissions for template assets.
- Serve API and public tracking/unsubscribe links over HTTPS.
- Set `WEB_ORIGIN` to the deployed frontend URL.
- Set `PUBLIC_API_URL` and `VITE_API_BASE_URL` to the deployed API URL.
- Run smoke and frontend tests against production/staging.

## Security Notes

Do not commit `.env`, AWS keys, database passwords, JWT secrets, or production connection strings.

If any AWS credential was ever exposed locally or in logs, rotate it in AWS IAM before deploying.
