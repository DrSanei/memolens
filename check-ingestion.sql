-- READ-ONLY Memolens diagnostic queries. Safe to run in Supabase SQL Editor.

-- 1. Confirm the expected tables exist.
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('analytics_events','test_sessions','leads','ingestion_errors')
order by table_name;

-- 2. Show RLS policies currently installed.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('analytics_events','test_sessions','leads','ingestion_errors')
order by tablename, policyname;

-- 3. Show the latest safe ingestion errors recorded by the Edge Function.
select received_at_utc, request_id, error_code, error_message, payload_type, session_id
from public.ingestion_errors
order by received_at_utc desc
limit 20;

-- 4. Confirm whether diagnostic/test writes have reached each table.
select 'analytics_events' as table_name, count(*) as row_count, max(received_at_utc) as latest_received_at from public.analytics_events
union all
select 'test_sessions', count(*), max(received_at_utc) from public.test_sessions
union all
select 'leads', count(*), max(received_at_utc) from public.leads
union all
select 'ingestion_errors', count(*), max(received_at_utc) from public.ingestion_errors;
