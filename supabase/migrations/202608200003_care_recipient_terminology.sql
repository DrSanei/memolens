begin;

-- IMPORTANT:
-- Drop the OLD event allowlist before historical rows are renamed to the new
-- care_recipient event names. Otherwise PostgreSQL rejects the UPDATE.

alter table public.analytics_events
  drop constraint if exists analytics_event_allowlist;

-- Rename the active test-session interaction column without losing data.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'test_sessions'
      and column_name = 'wearer_interaction_count'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'test_sessions'
      and column_name = 'care_recipient_interaction_count'
  ) then
    alter table public.test_sessions
      rename column wearer_interaction_count to care_recipient_interaction_count;
  end if;
end $$;

-- Rebuild the count constraint using the active column name.
alter table public.test_sessions
  drop constraint if exists sessions_nonnegative_counts;

alter table public.test_sessions
  add constraint sessions_nonnegative_counts check (
    care_recipient_interaction_count >= 0
    and prompt_repeat_count >= 0
    and recording_duration_seconds >= 0
    and recording_blob_bytes >= 0
    and review_duration_seconds >= 0
  );

-- Migrate historical analytics values now that the legacy allowlist is removed.
update public.analytics_events
set role_mode = 'care_recipient'
where role_mode = 'wearer';

update public.analytics_events
set event_name = case event_name
  when 'wearer_ready_viewed' then 'care_recipient_ready_viewed'
  when 'wearer_mode_entered' then 'care_recipient_mode_entered'
  else event_name
end
where event_name in ('wearer_ready_viewed', 'wearer_mode_entered');

-- Install the new active event allowlist.
alter table public.analytics_events
  add constraint analytics_event_allowlist check (
    event_name in (
      'landing_viewed','privacy_viewed','test_route_viewed','consent_viewed',
      'caregiver_setup_viewed','preflight_viewed','care_recipient_ready_viewed',
      'caregiver_inbox_viewed','caregiver_review_viewed','test_completion_viewed',
      'test_memolens_clicked','see_how_it_works_clicked','preorder_opened',
      'preorder_submitted','preorder_submission_failed','analytics_consent_accepted',
      'test_consent_completed','test_consent_cancelled','caregiver_setup_started',
      'routine_saved','prompt_previewed','voice_prompt_recorded','preflight_started',
      'camera_permission_granted','camera_permission_denied',
      'microphone_permission_granted','microphone_permission_denied','test_armed',
      'run_test_now_started','care_recipient_mode_entered','recording_started',
      'announcement_played','prompt_played','prompt_repeated','privacy_stop_used',
      'recording_completed','recording_failed','caregiver_mode_entered',
      'video_playback_started','video_playback_completed','video_review_skipped',
      'caregiver_disposition_selected','research_observations_submitted','test_closed',
      'post_test_feedback_submitted','post_test_lead_submitted',
      'recording_deleted','session_cleared','session_abandoned',
      'research_logging_failed'
    )
  );

-- Keep anonymous analytics free of media/identifying care-recipient fields.
alter table public.analytics_events
  drop constraint if exists analytics_properties_no_media;

alter table public.analytics_events
  add constraint analytics_properties_no_media check (
    properties_json::text !~*
      '(data:(audio|video|image)/|;base64,|blob:|audio_url|video_url|media_url|thumbnail|transcript|prompt_text|medication_name|medication_dose|diagnosis|wearer_name|care_recipient_name|caregiver_name)'
  );

-- Re-assert active insert/update column grants after the rename.
grant insert, update (
  schema_version, session_id, participant_code, participant_type, test_condition,
  started_at_utc, ended_at_utc, completion_state, furthest_step, zero_touch_success,
  care_recipient_interaction_count, prompt_type, prompt_delivered, prompt_repeat_count,
  camera_permission, microphone_permission, recording_status,
  recording_duration_seconds, recording_blob_bytes, privacy_stop,
  video_review_status, caregiver_review_started_at_utc, review_duration_seconds,
  caregiver_disposition, clip_usefulness, prompt_comprehension,
  false_reassurance, review_burden, privacy_rating, technical_error_code,
  research_notes, overall_value_rating, would_consider_use, pilot_interest,
  feedback_text, feedback_submitted_at_utc, research_consent_version,
  submitted_at_utc
) on public.test_sessions to anon, authenticated;

commit;
