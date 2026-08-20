import type { ResearchEventName } from "../researchSchema";

export type ResearchPrimitive = string | number | boolean | null;
export type ResearchProperties = Record<string, ResearchPrimitive>;

export interface AnalyticsEventRecord {
  schema_version: string;
  event_id: string;
  session_id: string;
  sequence_number: number;
  occurred_at_utc: string;
  event_name: ResearchEventName;
  page_path: string;
  role_mode: string;
  workflow_step: string;
  cta_id: string;
  source: string;
  elapsed_ms: number | null;
  device_type: "mobile" | "tablet" | "desktop";
  browser_family: string;
  os_family: string;
  language: string;
  timezone: string;
  online: boolean;
  analytics_consent_version: string;
  properties_json: ResearchProperties;
}

export interface TestSessionRecord {
  schema_version: string;
  session_id: string;
  participant_code: string;
  participant_type: string;
  test_condition: string;
  started_at_utc: string;
  ended_at_utc: string;
  completion_state: string;
  furthest_step: string;
  zero_touch_success: boolean | null;
  care_recipient_interaction_count: number;
  prompt_type: string;
  prompt_delivered: boolean;
  prompt_repeat_count: number;
  camera_permission: string;
  microphone_permission: string;
  recording_status: string;
  recording_duration_seconds: number;
  recording_blob_bytes: number;
  privacy_stop: boolean;
  video_review_status: string;
  caregiver_review_started_at_utc: string | null;
  review_duration_seconds: number;
  caregiver_disposition: string | null;
  clip_usefulness: string | null;
  prompt_comprehension: string | null;
  false_reassurance: string | null;
  review_burden: string | null;
  privacy_rating: number | null;
  technical_error_code: string | null;
  research_notes: string | null;
  overall_value_rating?: number | null;
  would_consider_use?: "yes" | "maybe" | "no" | null;
  pilot_interest?: "yes" | "maybe" | "no" | null;
  feedback_text?: string | null;
  feedback_submitted_at_utc?: string | null;
  research_consent_version: string;
  submitted_at_utc: string;
}

export interface LeadRecord {
  schema_version: string;
  lead_id: string;
  submitted_at_utc: string;
  name: string | null;

  phone_country_code: string | null;

  phone_number: string | null;

  email?: string | null;
  role_interest: string;
  source_cta: string;
  contact_consent: true;
  consent_text_version: string;
}

export interface ResearchEnvelope {
  schema_version: string;
  request_id: string;
  sent_at_utc: string;
  analytics_events: AnalyticsEventRecord[];
  test_sessions: TestSessionRecord[];
  leads: LeadRecord[];
  lead_submission_context?: {
    honeypot: string;
    elapsed_ms: number;
  };
}

export interface SupabaseAcknowledgement {
  ok: boolean;
  request_id: string;
  transport?: "direct" | "edge";
  inserted?: {
    analytics_events: number;
    test_sessions: number;
    leads: number;
  };
  duplicates?: { analytics_events: number; leads: number };
  updated?: { test_sessions: number };
  error_code?: string;
}
