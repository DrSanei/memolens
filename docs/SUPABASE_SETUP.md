# Supabase setup

This guide configures the only external research-data service used by Memolens. Supabase stores structured, consented research records and separately consented contact interest. It never receives media.

## 1. Create the project

1. Create a private Supabase project.
2. Keep the project owned by the authorized Memolens organization.
3. Do not enable public table browsing or expose a service-role key.
4. Copy the project URL and public anon key from **Project Settings → API**.

The anon key is intentionally browser-visible. RLS, column grants, and constraints limit what it can write and prevent public reads.

## 2. Apply the database migration

Use either the Supabase SQL Editor or CLI.

### SQL Editor

Open `supabase/migrations/202608160001_memolens_research.sql`, copy it into a new query, review it, and run it once.

### CLI

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Confirm that the migration created:

- `analytics_events`
- `test_sessions`
- `leads`
- `ingestion_errors`

Confirm RLS is enabled on all four tables. The public role can insert only approved columns in the first three tables. It cannot SELECT research rows and cannot write `ingestion_errors`.

## 3. Configure direct mode

Copy `.env.example` to `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
VITE_RESEARCH_TRANSPORT=direct
VITE_BASE_PATH=/
```

Restart the Vite development server after changing environment values.

Direct mode uses:

- `analytics_events`: conflict-safe insert by `event_id`;
- `test_sessions`: upsert by `session_id`;
- `leads`: conflict-safe insert by `lead_id`.

No public SELECT policy is needed by the application. If a target Supabase/PostgREST configuration requires SELECT for test-session upsert, use Edge mode instead of adding a broad public read policy.

## 4. Optional hardened Edge Function

The included function is recommended for public demonstrations that collect contact interest.

```bash
npx supabase functions deploy ingest
npx supabase secrets set ALLOWED_ORIGIN=https://your-memolens-domain.example
```

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to its hosted function. Do not add either secret to frontend files.

Configure the browser:

```env
VITE_RESEARCH_TRANSPORT=edge
VITE_SUPABASE_EDGE_FUNCTION_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/ingest
```

The browser sends the public anon key as the function authorization token. The function then validates the request, applies best-effort per-instance throttling without storing an IP address, and performs privileged writes using its server-only environment.

## 5. Local Supabase development

With Docker and the Supabase CLI installed:

```bash
npx supabase start
npx supabase db reset
npx supabase functions serve ingest --env-file supabase/.env.local
```

Do not commit `supabase/.env.local`. Use placeholder values in examples only.

## 6. Security verification

Before collecting real research data:

- Verify an anon request cannot SELECT from any research table.
- Verify anon cannot insert into `ingestion_errors`.
- Verify unexpected event names and extra fields fail.
- Verify a data URL, encoded-media field, transcript field, exact prompt field, diagnosis field, and dose field fail.
- Verify contact consent is required.
- Verify contact data appears only in `leads`.
- Verify duplicate `event_id` and `lead_id` values do not create duplicate rows.
- Verify a repeated `session_id` updates one test-session row.
- Verify Edge mode rejects the wrong origin, filled honeypot, too-fast lead, oversized body, and batch above 50.

Use [SUPABASE_INTEGRATION_QA.md](SUPABASE_INTEGRATION_QA.md) to record the real results.
