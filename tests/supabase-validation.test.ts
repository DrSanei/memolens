import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateResearchEnvelope } from "../src/services/researchValidation";
import {
  resetSupabaseClientForTests,
  submitResearchEnvelope,
} from "../src/services/supabaseClient";
import type {
  AnalyticsEventRecord,
  LeadRecord,
  ResearchEnvelope,
  TestSessionRecord,
} from "../src/services/researchTypes";

function event(
  overrides: Partial<AnalyticsEventRecord> = {},
): AnalyticsEventRecord {
  return {
    schema_version: "1.0",
    event_id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    sequence_number: 1,
    occurred_at_utc: new Date().toISOString(),
    event_name: "landing_viewed",
    page_path: "/",
    role_mode: "",
    workflow_step: "",
    cta_id: "",
    source: "direct",
    elapsed_ms: null,
    device_type: "desktop",
    browser_family: "Chrome",
    os_family: "Linux",
    language: "en-US",
    timezone: "America/New_York",
    online: true,
    analytics_consent_version: "2026-08-16.v1",
    properties_json: {},
    ...overrides,
  };
}

function session(sessionId: string): TestSessionRecord {
  const now = new Date().toISOString();
  return {
    schema_version: "1.0",
    session_id: sessionId,
    participant_code: "DEMO-001",
    participant_type: "family_caregiver",
    test_condition: "clear_role_played_routine",
    started_at_utc: now,
    ended_at_utc: now,
    completion_state: "acknowledged_closed",
    furthest_step: "acknowledged_closed",
    zero_touch_success: true,
    wearer_interaction_count: 0,
    prompt_type: "typed",
    prompt_delivered: true,
    prompt_repeat_count: 1,
    camera_permission: "granted",
    microphone_permission: "granted",
    recording_status: "evidence_available",
    recording_duration_seconds: 15,
    recording_blob_bytes: 1024,
    privacy_stop: false,
    video_review_status: "completed",
    caregiver_review_started_at_utc: now,
    review_duration_seconds: 10,
    caregiver_disposition: "appears_completed",
    clip_usefulness: "yes",
    prompt_comprehension: "yes",
    false_reassurance: "no",
    review_burden: "easy",
    privacy_rating: 4,
    technical_error_code: null,
    research_notes: null,
    research_consent_version: "2026-08-16.v1",
    submitted_at_utc: now,
  };
}

function lead(): LeadRecord {
  return {
    schema_version: "1.0",
    lead_id: crypto.randomUUID(),
    submitted_at_utc: new Date().toISOString(),
    name: "LaunchCon Test",
    phone_country_code: "+1",
    phone_number: "5551234567",
    role_interest: "Family caregiver",
    source_cta: "hero_preorder",
    contact_consent: true,
    consent_text_version: "2026-08-16.v1",
  };
}

function envelope(
  content: Partial<ResearchEnvelope> = {},
): ResearchEnvelope {
  return {
    schema_version: "1.0",
    request_id: crypto.randomUUID(),
    sent_at_utc: new Date().toISOString(),
    analytics_events: [],
    test_sessions: [],
    leads: [],
    ...content,
  };
}

describe("Supabase research validation", () => {
  it("accepts a minimized allowlisted analytics event", () => {
    const value = envelope({ analytics_events: [event()] });
    expect(validateResearchEnvelope(value)).toBe(value);
  });

  it("rejects media, encoded data, and phone fields in analytics", () => {
    expect(() =>
      validateResearchEnvelope(
        envelope({
          analytics_events: [
            event({
              properties_json: {
                video_data: "data:video/webm;base64,AAAA",
                phone_number: "+15551234567",
              },
            }),
          ],
        }),
      ),
    ).toThrow(/forbidden|encoded|media/i);
  });

  it("keeps phone details in leads and out of analytics records", () => {
    const value = envelope({
      analytics_events: [
        event({
          event_name: "preorder_submitted",
          properties_json: { role_interest: "Family caregiver" },
        }),
      ],
      leads: [lead()],
      lead_submission_context: { honeypot: "", elapsed_ms: 5000 },
    });
    validateResearchEnvelope(value);
    expect(JSON.stringify(value.analytics_events)).not.toContain("5551234567");
    expect(value.leads[0].phone_number).toBe("5551234567");
  });
});

describe("direct Supabase transport", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_RESEARCH_TRANSPORT", "direct");
    resetSupabaseClientForTests();
  });

  it("writes each record type only to its intended table", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
        });
        return Response.json([], { status: 201 });
      }),
    );
    const sessionId = crypto.randomUUID();
    const result = await submitResearchEnvelope(
      envelope({
        analytics_events: [event({ session_id: sessionId })],
        test_sessions: [session(sessionId)],
        leads: [lead()],
        lead_submission_context: { honeypot: "", elapsed_ms: 5000 },
      }),
    );

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/rest/v1/analytics_events"),
        expect.stringContaining("/rest/v1/test_sessions"),
        expect.stringContaining("/rest/v1/leads"),
      ]),
    );
    const analyticsCall = calls.find((call) =>
      call.url.includes("analytics_events"),
    );
    const leadCall = calls.find((call) => call.url.includes("/leads"));
    expect(JSON.stringify(analyticsCall?.body)).not.toContain("5551234567");
    expect(JSON.stringify(leadCall?.body)).toContain("5551234567");
  });

  it("fails closed when Supabase does not acknowledge the write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { code: "PGRST500", message: "unavailable" },
          { status: 500 },
        ),
      ),
    );
    await expect(
      submitResearchEnvelope(envelope({ analytics_events: [event()] })),
    ).rejects.toThrow(/did not confirm/i);
  });
});
