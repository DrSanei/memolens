create extension if not exists pgcrypto;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null,
  event_id text not null unique,
  session_id text not null,
  sequence_number integer not null,
  occurred_at_utc timestamptz not null,
  received_at_utc timestamptz not null default now(),
  event_name text not null,
  page_path text not null,
  role_mode text not null default '',
  workflow_step text not null default '',
  cta_id text not null default '',
  source text not null default '',
  elapsed_ms integer,
  device_type text not null,
  browser_family text not null,
  os_family text not null,
  language text not null,
  timezone text not null,
  online boolean not null,
  analytics_consent_version text not null,
  properties_json jsonb not null default '{}'::jsonb,
  constraint analytics_schema_v1 check (schema_version = '1.0'),
  constraint analytics_event_uuid check (
    event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint analytics_session_uuid check (
    session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint analytics_sequence_range check (sequence_number between 1 and 1000000),
  constraint analytics_elapsed_range check (elapsed_ms is null or elapsed_ms between 0 and 86400000),
  constraint analytics_device_type check (device_type in ('mobile', 'tablet', 'desktop')),
  constraint analytics_page_path check (page_path like '/%' and char_length(page_path) <= 200),
  constraint analytics_short_fields check (
    char_length(role_mode) <= 40
    and char_length(workflow_step) <= 60
    and char_length(cta_id) <= 80
    and char_length(source) <= 80
    and char_length(browser_family) <= 40
    and char_length(os_family) <= 40
    and char_length(language) <= 30
    and char_length(timezone) <= 80
    and char_length(analytics_consent_version) <= 60
  ),
  constraint analytics_properties_object check (jsonb_typeof(properties_json) = 'object'),
  constraint analytics_properties_size check (octet_length(properties_json::text) <= 8000),
  constraint analytics_properties_no_media check (
    properties_json::text !~* '(data:(audio|video|image)/|;base64,|blob:|audio_url|video_url|media_url|thumbnail|transcript|prompt_text|medication_name|medication_dose|diagnosis|wearer_name|caregiver_name)'
  ),
  constraint analytics_event_allowlist check (
    event_name in (
      'landing_viewed', 'privacy_viewed', 'test_route_viewed', 'consent_viewed',
      'caregiver_setup_viewed', 'preflight_viewed', 'wearer_ready_viewed',
      'caregiver_inbox_viewed', 'caregiver_review_viewed', 'test_completion_viewed',
      'test_memolens_clicked', 'see_how_it_works_clicked', 'preorder_opened',
      'preorder_submitted', 'preorder_submission_failed', 'analytics_consent_accepted',
      'test_consent_completed', 'test_consent_cancelled', 'caregiver_setup_started',
      'routine_saved', 'prompt_previewed', 'voice_prompt_recorded', 'preflight_started',
      'camera_permission_granted', 'camera_permission_denied',
      'microphone_permission_granted', 'microphone_permission_denied', 'test_armed',
      'run_test_now_started', 'wearer_mode_entered', 'recording_started',
      'announcement_played', 'prompt_played', 'prompt_repeated', 'privacy_stop_used',
      'recording_completed', 'recording_failed', 'caregiver_mode_entered',
      'video_playback_started', 'video_playback_completed', 'video_review_skipped',
      'caregiver_disposition_selected', 'research_observations_submitted', 'test_closed',
      'recording_deleted', 'session_cleared', 'session_abandoned',
      'research_logging_failed'
    )
  )
);

create table if not exists public.test_sessions (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null,
  session_id text not null unique,
  participant_code text,
  participant_type text,
  test_condition text,
  started_at_utc timestamptz not null,
  ended_at_utc timestamptz not null,
  received_at_utc timestamptz not null default now(),
  completion_state text not null,
  furthest_step text not null,
  zero_touch_success boolean,
  wearer_interaction_count integer not null,
  prompt_type text not null,
  prompt_delivered boolean not null,
  prompt_repeat_count integer not null,
  camera_permission text not null,
  microphone_permission text not null,
  recording_status text not null,
  recording_duration_seconds integer not null,
  recording_blob_bytes integer not null,
  privacy_stop boolean not null,
  video_review_status text not null,
  caregiver_review_started_at_utc timestamptz,
  review_duration_seconds integer not null,
  caregiver_disposition text,
  clip_usefulness text,
  prompt_comprehension text,
  false_reassurance text,
  review_burden text,
  privacy_rating integer,
  technical_error_code text,
  research_notes text,
  research_consent_version text not null,
  submitted_at_utc timestamptz not null,
  constraint sessions_schema_v1 check (schema_version = '1.0'),
  constraint sessions_session_uuid check (
    session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint sessions_participant_code_length check (participant_code is null or char_length(participant_code) <= 40),
  constraint sessions_participant_type check (
    participant_type is null or participant_type in (
      'family_caregiver', 'professional_caregiver', 'healthcare_professional',
      'researcher', 'potential_partner', 'other'
    )
  ),
  constraint sessions_test_condition check (
    test_condition is null or test_condition in (
      'live_unscripted', 'clear_role_played_routine', 'silent_role_played_routine',
      'no_activity', 'role_played_uncertainty', 'obstructed_camera', 'privacy_stop',
      'technical_failure_test'
    )
  ),
  constraint sessions_completion_state check (
    completion_state in ('caregiver_review', 'left_open', 'acknowledged_closed')
  ),
  constraint sessions_nonnegative_counts check (
    wearer_interaction_count >= 0
    and prompt_repeat_count >= 0
    and recording_duration_seconds >= 0
    and recording_blob_bytes >= 0
    and review_duration_seconds >= 0
  ),
  constraint sessions_privacy_rating check (privacy_rating is null or privacy_rating between 1 and 5),
  constraint sessions_notes_length check (research_notes is null or char_length(research_notes) <= 1000),
  constraint sessions_error_length check (technical_error_code is null or char_length(technical_error_code) <= 300),
  constraint sessions_no_sensitive_note_labels check (
    research_notes is null or research_notes !~* '(diagnosis|dose|medication name|transcript)\s*:'
  )
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null,
  lead_id text not null unique,
  submitted_at_utc timestamptz not null,
  received_at_utc timestamptz not null default now(),
  name text not null,
  phone_country_code text not null,
  phone_number text not null,
  role_interest text not null,
  source_cta text not null,
  contact_consent boolean not null,
  consent_text_version text not null,
  constraint leads_schema_v1 check (schema_version = '1.0'),
  constraint leads_lead_uuid check (
    lead_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint leads_name_length check (char_length(name) between 1 and 100),
  constraint leads_country_code check (phone_country_code ~ '^\+[1-9][0-9]{0,3}$'),
  constraint leads_phone_number check (phone_number ~ '^[0-9]{6,18}$'),
  constraint leads_role_interest check (
    role_interest in (
      'Family caregiver', 'Professional caregiver', 'Healthcare professional',
      'Researcher', 'Potential partner', 'Other'
    )
  ),
  constraint leads_source_cta check (source_cta in ('hero_preorder', 'final_preorder')),
  constraint leads_contact_consent check (contact_consent is true),
  constraint leads_consent_version_length check (char_length(consent_text_version) between 1 and 60)
);

create table if not exists public.ingestion_errors (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null,
  received_at_utc timestamptz not null default now(),
  request_id text,
  error_code text not null,
  error_message text not null,
  payload_type text,
  session_id text,
  constraint errors_schema_v1 check (schema_version = '1.0'),
  constraint errors_safe_lengths check (
    char_length(coalesce(request_id, '')) <= 80
    and char_length(error_code) <= 80
    and char_length(error_message) <= 300
    and char_length(coalesce(payload_type, '')) <= 40
    and char_length(coalesce(session_id, '')) <= 80
  )
);

create index if not exists analytics_events_session_sequence_idx
  on public.analytics_events (session_id, sequence_number);
create index if not exists analytics_events_occurred_at_idx
  on public.analytics_events (occurred_at_utc desc);
create index if not exists test_sessions_submitted_at_idx
  on public.test_sessions (submitted_at_utc desc);
create index if not exists leads_submitted_at_idx
  on public.leads (submitted_at_utc desc);

alter table public.analytics_events enable row level security;
alter table public.test_sessions enable row level security;
alter table public.leads enable row level security;
alter table public.ingestion_errors enable row level security;

revoke all on public.analytics_events from anon, authenticated;
revoke all on public.test_sessions from anon, authenticated;
revoke all on public.leads from anon, authenticated;
revoke all on public.ingestion_errors from anon, authenticated;

grant usage on schema public to anon;
grant insert (
  schema_version, event_id, session_id, sequence_number, occurred_at_utc, event_name,
  page_path, role_mode, workflow_step, cta_id, source, elapsed_ms, device_type,
  browser_family, os_family, language, timezone, online,
  analytics_consent_version, properties_json
) on public.analytics_events to anon;

grant insert (
  schema_version, session_id, participant_code, participant_type, test_condition,
  started_at_utc, ended_at_utc, completion_state, furthest_step, zero_touch_success,
  wearer_interaction_count, prompt_type, prompt_delivered, prompt_repeat_count,
  camera_permission, microphone_permission, recording_status,
  recording_duration_seconds, recording_blob_bytes, privacy_stop, video_review_status,
  caregiver_review_started_at_utc, review_duration_seconds, caregiver_disposition,
  clip_usefulness, prompt_comprehension, false_reassurance, review_burden,
  privacy_rating, technical_error_code, research_notes, research_consent_version,
  submitted_at_utc
) on public.test_sessions to anon;

grant update (
  participant_code, participant_type, test_condition, ended_at_utc, completion_state,
  furthest_step, zero_touch_success, wearer_interaction_count, prompt_type,
  prompt_delivered, prompt_repeat_count, camera_permission, microphone_permission,
  recording_status, recording_duration_seconds, recording_blob_bytes, privacy_stop,
  video_review_status, caregiver_review_started_at_utc, review_duration_seconds,
  caregiver_disposition, clip_usefulness, prompt_comprehension, false_reassurance,
  review_burden, privacy_rating, technical_error_code, research_notes,
  research_consent_version, submitted_at_utc
) on public.test_sessions to anon;

grant insert (
  schema_version, lead_id, submitted_at_utc, name, phone_country_code, phone_number,
  role_interest, source_cta, contact_consent, consent_text_version
) on public.leads to anon;

drop policy if exists "anonymous analytics insert" on public.analytics_events;
create policy "anonymous analytics insert"
  on public.analytics_events for insert to anon with check (schema_version = '1.0');

drop policy if exists "anonymous session insert" on public.test_sessions;
create policy "anonymous session insert"
  on public.test_sessions for insert to anon with check (schema_version = '1.0');

drop policy if exists "anonymous session update" on public.test_sessions;
create policy "anonymous session update"
  on public.test_sessions for update to anon
  using (schema_version = '1.0')
  with check (schema_version = '1.0');

drop policy if exists "anonymous lead insert" on public.leads;
create policy "anonymous lead insert"
  on public.leads for insert to anon
  with check (schema_version = '1.0' and contact_consent is true);

comment on table public.analytics_events is
  'Consented, allowlisted, non-media Memolens interaction and technical events.';
comment on table public.test_sessions is
  'Consented minimized Memolens test summaries; no raw media or exact prompts.';
comment on table public.leads is
  'Separately consented contact interest, intentionally isolated from test details.';
comment on table public.ingestion_errors is
  'Safe Edge Function errors only; never stores rejected payloads, contact details, notes, or secrets.';
