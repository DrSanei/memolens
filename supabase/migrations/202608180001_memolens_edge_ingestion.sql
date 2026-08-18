-- Memolens research ingestion hardening
-- Apply after the `ingest` Edge Function has been deployed and the frontend
-- has been switched from direct Data API writes to the Edge Function transport.
--
-- Reason: anonymous UPDATE/UPSERT of test_sessions requires a corresponding
-- SELECT policy under RLS. Memolens must not expose research rows publicly,
-- so all research writes are routed through the validated Edge Function instead.

alter table public.analytics_events enable row level security;
alter table public.test_sessions enable row level security;
alter table public.leads enable row level security;
alter table public.ingestion_errors enable row level security;

revoke all on public.analytics_events from anon, authenticated;
revoke all on public.test_sessions from anon, authenticated;
revoke all on public.leads from anon, authenticated;
revoke all on public.ingestion_errors from anon, authenticated;

drop policy if exists "anonymous analytics insert" on public.analytics_events;
drop policy if exists "anonymous session insert" on public.test_sessions;
drop policy if exists "anonymous session update" on public.test_sessions;
drop policy if exists "anonymous lead insert" on public.leads;

comment on table public.analytics_events is
  'Consented, allowlisted, non-media Memolens events. Writes are accepted only through the ingest Edge Function.';
comment on table public.test_sessions is
  'Consented minimized Memolens test summaries. No public SELECT/INSERT/UPDATE; Edge Function only.';
comment on table public.leads is
  'Separately consented contact interest. No public table access; Edge Function only.';
comment on table public.ingestion_errors is
  'Safe ingestion errors written only by the Edge Function; never public.';
