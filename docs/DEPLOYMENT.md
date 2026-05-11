# Deployment Guide

## Recommended Production Shape

- Web: static Vite build served by Vercel, Netlify, AWS S3 + CloudFront, or Nginx.
- API: Node.js service running `apps/api/dist/index.js` behind HTTPS.
- Worker: separate Node.js service running `apps/worker/dist/index.js`.
- Database: managed PostgreSQL.
- Email/queue/storage: AWS SES, SQS, and S3.

## Required Environment Variables

Set these in the API and worker runtime:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB"
JWT_ACCESS_SECRET="long-random-secret"
JWT_REFRESH_SECRET="another-long-random-secret"
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=7
API_PORT=4000
WEB_ORIGIN="https://your-web-domain.com"
PUBLIC_API_URL="https://your-api-domain.com"
EMAIL_PROVIDER=ses
AWS_REGION="ap-south-1"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
SES_CONFIGURATION_SET="email-platform-events"
SES_FROM_EMAIL="verified@your-domain.com"
SES_SNS_TOPIC_ARN="..."
S3_BUCKET="your-template-assets-bucket"
SQS_SEND_QUEUE_URL="https://sqs..."
SQS_EVENTS_QUEUE_URL="https://sqs..."
WORKER_MAX_RECEIVE_COUNT=5
```

Set this for the web build:

```bash
VITE_API_BASE_URL="https://your-api-domain.com"
```

## Build

```bash
pnpm install
pnpm --filter api db:generate
pnpm verify
```

On Windows PowerShell, use `pnpm.cmd` if script execution blocks `pnpm.ps1`.

## Database

Run migrations against production before starting services:

```bash
pnpm --filter api db:migrate
```

Optionally seed demo data only for staging:

```bash
pnpm --filter api db:seed
```

## Start Services

API:

```bash
pnpm --filter api start
```

Worker:

```bash
pnpm --filter worker start
```

Web preview for a Node host:

```bash
pnpm --filter web preview
```

For static hosting, deploy `apps/web/dist`.

## AWS Setup Checklist

- Verify the sender domain or sender email in SES.
- Move SES out of sandbox before sending to arbitrary recipients.
- Create an SES configuration set named by `SES_CONFIGURATION_SET`.
- Connect SES delivery, bounce, complaint, open, and click events to SNS/SQS or the `/webhooks/ses` endpoint.
- Create the send queue used by `SQS_SEND_QUEUE_URL`.
- Configure S3 bucket access for template image uploads.
- Put the API behind HTTPS so tracking, unsubscribe, and preference links use `PUBLIC_API_URL`.

## Post-Deploy Checks

```bash
SMOKE_API_BASE="https://your-api-domain.com" pnpm test:smoke
FRONTEND_WEB_BASE="https://your-web-domain.com" FRONTEND_API_BASE="https://your-api-domain.com" pnpm test:frontend
```

Then test a real SES send, open tracking, click tracking, bounce/complaint handling, unsubscribe, and preference updates.
