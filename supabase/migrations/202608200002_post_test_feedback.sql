begin;

alter table public.test_sessions
  add column if not exists overall_value_rating integer,
  add column if not exists would_consider_use text,
  add column if not exists pilot_interest text,
  add column if not exists feedback_text text,
  add column if not exists feedback_submitted_at_utc timestamptz;

alter table public.test_sessions drop constraint if exists test_sessions_overall_value_rating_check;
alter table public.test_sessions
  add constraint test_sessions_overall_value_rating_check
  check (overall_value_rating is null or overall_value_rating between 1 and 5);

alter table public.test_sessions drop constraint if exists test_sessions_would_consider_use_check;
alter table public.test_sessions
  add constraint test_sessions_would_consider_use_check
  check (would_consider_use is null or would_consider_use in ('yes','maybe','no'));

alter table public.test_sessions drop constraint if exists test_sessions_pilot_interest_check;
alter table public.test_sessions
  add constraint test_sessions_pilot_interest_check
  check (pilot_interest is null or pilot_interest in ('yes','maybe','no'));

alter table public.test_sessions drop constraint if exists test_sessions_feedback_text_check;
alter table public.test_sessions
  add constraint test_sessions_feedback_text_check
  check (
    feedback_text is null
    or (
      char_length(feedback_text) <= 1000
      and feedback_text !~* '(diagnosis|dose|medication name|transcript)\s*:'
    )
  );

alter table public.leads add column if not exists email text;

alter table public.leads
  alter column name drop not null,
  alter column phone_country_code drop not null,
  alter column phone_number drop not null;

alter table public.leads drop constraint if exists leads_name_length;
alter table public.leads
  add constraint leads_name_length
  check (name is null or (char_length(btrim(name)) between 1 and 100));

alter table public.leads drop constraint if exists leads_country_code_format;
alter table public.leads
  add constraint leads_country_code_format
  check (phone_country_code is null or phone_country_code ~ '^\+[1-9][0-9]{0,3}$');

alter table public.leads drop constraint if exists leads_phone_format;
alter table public.leads
  add constraint leads_phone_format
  check (phone_number is null or phone_number ~ '^[0-9]{6,18}$');

alter table public.leads drop constraint if exists leads_email_format;
alter table public.leads
  add constraint leads_email_format
  check (
    email is null
    or (
      char_length(email) <= 254
      and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

alter table public.leads drop constraint if exists leads_contact_method;
alter table public.leads
  add constraint leads_contact_method
  check (
    email is not null
    or (phone_country_code is not null and phone_number is not null)
  );

alter table public.leads drop constraint if exists leads_source_cta;
alter table public.leads
  add constraint leads_source_cta
  check (source_cta in ('hero_preorder','final_preorder','post_test_feedback'));

alter table public.analytics_events drop constraint if exists analytics_event_allowlist;
alter table public.analytics_events
  add constraint analytics_event_allowlist check (
    event_name in (
      'landing_viewed','privacy_viewed','test_route_viewed','consent_viewed',
      'caregiver_setup_viewed','preflight_viewed','wearer_ready_viewed',
      'caregiver_inbox_viewed','caregiver_review_viewed','test_completion_viewed',
      'test_memolens_clicked','see_how_it_works_clicked','preorder_opened',
      'preorder_submitted','preorder_submission_failed','analytics_consent_accepted',
      'test_consent_completed','test_consent_cancelled','caregiver_setup_started',
      'routine_saved','prompt_previewed','voice_prompt_recorded','preflight_started',
      'camera_permission_granted','camera_permission_denied',
      'microphone_permission_granted','microphone_permission_denied','test_armed',
      'run_test_now_started','wearer_mode_entered','recording_started',
      'announcement_played','prompt_played','prompt_repeated','privacy_stop_used',
      'recording_completed','recording_failed','caregiver_mode_entered',
      'video_playback_started','video_playback_completed','video_review_skipped',
      'caregiver_disposition_selected','research_observations_submitted','test_closed',
      'post_test_feedback_submitted','post_test_lead_submitted',
      'recording_deleted','session_cleared','session_abandoned',
      'research_logging_failed'
    )
  );

grant insert, update (
  schema_version, session_id, participant_code, participant_type, test_condition,
  started_at_utc, ended_at_utc, completion_state, furthest_step, zero_touch_success,
  wearer_interaction_count, prompt_type, prompt_delivered, prompt_repeat_count,
  camera_permission, microphone_permission, recording_status,
  recording_duration_seconds, recording_blob_bytes, privacy_stop,
  video_review_status, caregiver_review_started_at_utc, review_duration_seconds,
  caregiver_disposition, clip_usefulness, prompt_comprehension,
  false_reassurance, review_burden, privacy_rating, technical_error_code,
  research_notes, overall_value_rating, would_consider_use, pilot_interest,
  feedback_text, feedback_submitted_at_utc, research_consent_version,
  submitted_at_utc
) on public.test_sessions to anon, authenticated;

grant insert (
  schema_version, lead_id, submitted_at_utc, name, phone_country_code,
  phone_number, email, role_interest, source_cta, contact_consent,
  consent_text_version
) on public.leads to anon, authenticated;

commit;
