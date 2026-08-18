# Memolens Supabase logging fix — 2026-08-18

## What was wrong

1. The original direct-mode migration granted anonymous `UPDATE` on `test_sessions` but intentionally provided no anonymous `SELECT` policy. Supabase/Postgres RLS requires a matching SELECT policy for UPDATE operations. This conflicts with Memolens's requirement that anonymous users must never read research records.
2. `config.toml` used `verify_jwt = true`, while the browser uses a modern `sb_publishable_...` key. Modern publishable keys are not JWTs.
3. The Edge Function read only the legacy `SUPABASE_SERVICE_ROLE_KEY` and did not support the newer named `SUPABASE_SECRET_KEYS` environment variable.
4. The Edge Function returned `Access-Control-Allow-Origin: null` when no `ALLOWED_ORIGIN` was configured, blocking local browser calls.
5. `requestId` was inferred as the template-literal type returned by `crypto.randomUUID()`, causing the TypeScript assignment error when copying a validated string request ID.

## Fixed design

The browser sends the research envelope to the `ingest` Edge Function using the project's publishable key in the `apikey` header. The function validates the publishable key, validates/minimizes the payload, then writes with the server-side secret key. The browser receives a structured acknowledgement but never receives database rows.

## Environment

The hosted Supabase Edge runtime automatically provides `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_SECRET_KEYS`. Do not put a secret key in a `VITE_` variable.

For local Vite testing against the hosted Edge Function, localhost is accepted by default. Before production, set an Edge Function secret such as:

`ALLOWED_ORIGINS=http://localhost:5173,https://YOUR-VERCEL-DOMAIN.vercel.app`

## Deployment order

1. Replace your local `supabase/functions/ingest/index.ts` and `supabase/config.toml` with the fixed versions.
2. Deploy the function to the hosted project.
3. Switch the frontend research transport from direct database writes to the `ingest` Edge Function transport.
4. Confirm one real test-session acknowledgement and row in Supabase.
5. Run `202608180001_memolens_edge_ingestion.sql` to remove all anonymous direct table writes.

Do not add a public SELECT policy to `test_sessions`.
