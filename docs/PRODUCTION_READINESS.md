# Production Readiness Checklist

This repo is now buildable and locally smoke-testable, but production readiness still depends on environment-specific checks.

## Verified Locally

- API, worker, and web TypeScript checks pass.
- API, worker, and web production builds pass.
- Prisma schema validates.
- API health, login, authenticated lists/templates/campaigns/dashboard, token refresh, and campaign progress are covered by `pnpm test:smoke`.
- Frontend API URL can be configured with `VITE_API_BASE_URL`.
- `EMAIL_PROVIDER=ses` now requires AWS credentials and `SQS_SEND_QUEUE_URL`.

## Before Production

- Use long, unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values.
- Run PostgreSQL migrations against the production database.
- Verify SES sending domain/email identity and move the AWS account out of SES sandbox if needed.
- Create SES configuration set events and connect delivery, bounce, complaint, open, and click events.
- Create SQS queues for send jobs and SES event processing, including dead-letter queues.
- Configure S3 bucket permissions and lifecycle rules for uploaded template assets.
- Run `EMAIL_PROVIDER=ses` in a staging AWS account and execute a real send, bounce, complaint, unsubscribe, and preference-center test.
- Put API, web, and worker behind supervised process/runtime management.
- Serve public links over HTTPS and set the public API base used in generated tracking/unsubscribe URLs.
- Add database backups, log retention, monitoring, and alerting.

## Useful Commands

```bash
pnpm verify
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm start:api
pnpm start:web
pnpm start:worker
pnpm test:smoke
```
