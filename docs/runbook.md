# GP4U — Deployment Runbook

Step-by-step guide to going from zero to a live GP4U instance.
Follow these sections in order for a first deployment.

---

## 1. Prerequisites

- Node.js 20+ and pnpm 9+
- A PostgreSQL 16 database (see §2)
- A Stripe account (see §4)
- A Resend account for email (see §5)
- A Vercel account for hosting (or any Node.js host)

---

## 2. Database

Recommended: **Neon** (serverless Postgres, free tier) or **Supabase**.

```bash
# Neon: https://neon.tech → New project → copy connection string
# It looks like: postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require

DATABASE_URL="postgresql://..."
```

Run migrations:
```bash
cd apps/web
pnpm db:migrate     # applies all migrations
pnpm db:generate    # regenerates Prisma client
```

---

## 3. Auth secret

Generate a strong token secret:
```bash
openssl rand -hex 32
# → e.g. 4a9f3c2d1b8e7a6f5c4d3e2b1a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1
```

Set `GP4U_TOKEN_SECRET` to this value in your environment.

> **Never reuse secrets between environments.** Generate a unique one for prod.

---

## 4. Stripe

### 4a. API keys
Go to [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys):
- `STRIPE_SECRET_KEY` → Secret key (`sk_live_...` in prod, `sk_test_...` in staging)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → Publishable key (`pk_live_...` / `pk_test_...`)

### 4b. Webhook endpoint

1. Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://yourdomain.com/api/billing/webhook`
3. Events to listen for: `payment_intent.succeeded`
4. Copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET=whsec_...`

### 4c. Local testing (Stripe CLI)
```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:3000/api/billing/webhook
# Copy the webhook signing secret it prints → STRIPE_WEBHOOK_SECRET
```

---

## 5. Email (Resend)

1. Create account at [resend.com](https://resend.com)
2. Add and verify your domain (`gp4u.com`)
3. Create an API key → `RESEND_API_KEY=re_...`
4. Set `GP4U_EMAIL_FROM="GP4U <no-reply@gp4u.com>"`

> Without `RESEND_API_KEY`, emails are printed to the server console. Useful for dev.

---

## 6. Redis (Upstash — rate limiting)

1. Create account at [upstash.com](https://upstash.com)
2. Create a Redis database (free tier is sufficient for MVP)
3. Go to **REST API** tab → copy URL and token
4. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

> Without these, rate limiting falls back to in-memory (single-instance only).

---

## 7. Monitoring (Sentry) — optional but recommended

1. Create project at [sentry.io](https://sentry.io) → Platform: **Next.js**
2. Copy DSN → set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`
3. For source maps: create auth token at sentry.io/settings/auth-tokens → `SENTRY_AUTH_TOKEN`

---

## 8. Deploy to Vercel

### First deploy
```bash
npm i -g vercel
vercel login
cd /path/to/GP4U-Review
vercel --prod
```

Follow the prompts. When asked for the project root, point to `apps/web`.

### Environment variables
In Vercel dashboard → Project → Settings → Environment Variables, add all vars from `.env.example`:
- `DATABASE_URL`
- `GP4U_TOKEN_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `RESEND_API_KEY`, `GP4U_EMAIL_FROM`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` *(optional)*
- `NEXT_PUBLIC_APP_URL` = your production URL

### CI/CD (GitHub Actions → Vercel)
Add these GitHub Secrets (repo → Settings → Secrets):
- `VERCEL_TOKEN` — from vercel.com/account/tokens
- `VERCEL_ORG_ID` — from `.vercel/project.json` after first deploy
- `VERCEL_PROJECT_ID` — same file

Pushes to `main` automatically deploy via `.github/workflows/deploy.yml`.

---

## 9. Provider agent image

The agent is published to `ghcr.io/gp4u/agent:latest` automatically
when `.github/workflows/deploy.yml` runs on `main`.

For manual publish:
```bash
docker build -t ghcr.io/gp4u/agent:latest apps/provider-agent/
docker push ghcr.io/gp4u/agent:latest
```

Providers pull it with:
```bash
docker run --gpus all --rm \
  -e GP4U_PROVIDER_TOKEN=<token> \
  -e GP4U_REGION=us-east-1 \
  ghcr.io/gp4u/agent:latest
```

---

## 10. Pre-launch checklist

Run through this before going live with real users:

- [ ] `DATABASE_URL` points to production DB
- [ ] `pnpm db:migrate` ran successfully on prod DB
- [ ] `GP4U_TOKEN_SECRET` is a unique 32-byte random value
- [ ] Stripe webhook registered at `/api/billing/webhook` with correct secret
- [ ] Test card payment works end-to-end (use Stripe test card `4242 4242 4242 4242`)
- [ ] Verify email flow works (register → check inbox → click link → clearance_level=1)
- [ ] Forgot password flow works
- [ ] Sign out clears session
- [ ] `/api/health/public` returns 200
- [ ] Sentry test event received (throw a test error, check Sentry dashboard)
- [ ] Rate limiting tested (try 11 login attempts — should 429 on 11th)
- [ ] Provider agent Docker image accessible at `ghcr.io/gp4u/agent:latest`

---

## 11. First admin user

After deploying, create your first admin via Prisma Studio:
```bash
cd apps/web
pnpm db:studio
# Open browser → User table → find your user → set clearance_level = 3
```

Or via SQL:
```sql
UPDATE "User" SET clearance_level = 3 WHERE email = 'your@email.com';
```

---

## Common issues

| Issue | Fix |
|-------|-----|
| `GP4U_TOKEN_SECRET not set` | Add the env var and redeploy |
| `401 on all routes` | Token expired or `GP4U_TOKEN_SECRET` changed — re-login |
| `Stripe webhook 400` | Wrong `STRIPE_WEBHOOK_SECRET` — re-copy from Stripe dashboard |
| `Email not sending` | Check `RESEND_API_KEY` and that the sender domain is verified |
| `Rate limit not working across instances` | `UPSTASH_REDIS_REST_URL` not set — add Upstash |
| `prisma.user.findUnique is not a function` | Run `pnpm db:generate` and redeploy |
