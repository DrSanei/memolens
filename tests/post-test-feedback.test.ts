import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateResearchEnvelope } from "../src/services/researchValidation";

const now = "2026-08-20T10:00:00.000Z";

function session(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0",
    session_id: "11111111-1111-4111-8111-111111111111",
    participant_code: "MEM-20260820-ABC12345",
    participant_type: "family_caregiver",
    test_condition: "live_unscripted",
    started_at_utc: now,
    ended_at_utc: now,
    completion_state: "acknowledged_closed",
    furthest_step: "acknowledged_closed",
    zero_touch_success: true,
    care_recipient_interaction_count: 0,
    prompt_type: "typed",
    prompt_delivered: true,
    prompt_repeat_count: 1,
    camera_permission: "granted",
    microphone_permission: "granted",
    recording_status: "evidence_available",
    recording_duration_seconds: 30,
    recording_blob_bytes: 1000,
    privacy_stop: false,
    video_review_status: "completed",
    caregiver_review_started_at_utc: now,
    review_duration_seconds: 20,
    caregiver_disposition: "appears_completed",
    clip_usefulness: "yes",
    prompt_comprehension: "yes",
    false_reassurance: "no",
    review_burden: "low",
    privacy_rating: 5,
    technical_error_code: null,
    research_notes: null,
    overall_value_rating: 5,
    would_consider_use: "yes",
    pilot_interest: "maybe",
    feedback_text: "The caregiver handoff was clear.",
    feedback_submitted_at_utc: now,
    research_consent_version: "research-analytics-v1",
    submitted_at_utc: now,
    ...overrides,
  };
}

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0",
    request_id: "22222222-2222-4222-8222-222222222222",
    sent_at_utc: now,
    analytics_events: [],
    test_sessions: [session()],
    leads: [],
    ...overrides,
  };
}

describe("post-test feedback validation", () => {
  it("accepts anonymous feedback plus an email-only consented lead", () => {
    const value = envelope({
      leads: [
        {
          schema_version: "1.0",
          lead_id: "33333333-3333-4333-8333-333333333333",
          submitted_at_utc: now,
          name: null,
          phone_country_code: null,
          phone_number: null,
          email: "tester@example.com",
          role_interest: "Family caregiver",
          source_cta: "post_test_feedback",
          contact_consent: true,
          consent_text_version: "contact-v1",
        },
      ],
      lead_submission_context: { honeypot: "", elapsed_ms: 3000 },
    });

    expect(() => validateResearchEnvelope(value)).not.toThrow();
  });

  it("rejects an out-of-range overall value rating", () => {
    expect(() =>
      validateResearchEnvelope(
        envelope({ test_sessions: [session({ overall_value_rating: 6 })] }),
      ),
    ).toThrow(/Overall value rating/i);
  });

  it("rejects an invalid email-only lead", () => {
    expect(() =>
      validateResearchEnvelope(
        envelope({
          leads: [
            {
              schema_version: "1.0",
              lead_id: "44444444-4444-4444-8444-444444444444",
              submitted_at_utc: now,
              name: null,
              phone_country_code: null,
              phone_number: null,
              email: "not-an-email",
              role_interest: "Family caregiver",
              source_cta: "post_test_feedback",
              contact_consent: true,
              consent_text_version: "contact-v1",
            },
          ],
          lead_submission_context: { honeypot: "", elapsed_ms: 3000 },
        }),
      ),
    ).toThrow(/Email is invalid/i);
  });

  it("ships matching Edge Function and migration allowlists", () => {
    const edge = readFileSync("supabase/functions/ingest/index.ts", "utf8");
    const migration = readFileSync(
      "supabase/migrations/202608200002_post_test_feedback.sql",
      "utf8",
    );
    expect(edge).toContain('"post_test_feedback_submitted"');
    expect(edge).toContain('"post_test_lead_submitted"');
    expect(edge).toContain('"overall_value_rating"');
    expect(edge).toContain('"email"');
    expect(migration).toContain("overall_value_rating");
    expect(migration).toContain("post_test_feedback");
  });
});
