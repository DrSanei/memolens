/* eslint-disable */
import { createClient } from "npm:@supabase/supabase-js@2";

const SCHEMA_VERSION = "1.0";
const MAX_BODY_BYTES = 60 * 1024;
const MAX_BATCH = 50;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_NAMES = new Set([
  "landing_viewed", "privacy_viewed", "test_route_viewed", "consent_viewed",
  "caregiver_setup_viewed", "preflight_viewed", "wearer_ready_viewed",
  "caregiver_inbox_viewed", "caregiver_review_viewed", "test_completion_viewed",
  "test_memolens_clicked", "see_how_it_works_clicked", "preorder_opened",
  "preorder_submitted", "preorder_submission_failed", "analytics_consent_accepted",
  "test_consent_completed", "test_consent_cancelled", "caregiver_setup_started",
  "routine_saved", "prompt_previewed", "voice_prompt_recorded", "preflight_started",
  "camera_permission_granted", "camera_permission_denied",
  "microphone_permission_granted", "microphone_permission_denied", "test_armed",
  "run_test_now_started", "wearer_mode_entered", "recording_started",
  "announcement_played", "prompt_played", "prompt_repeated", "privacy_stop_used",
  "recording_completed", "recording_failed", "caregiver_mode_entered",
  "video_playback_started", "video_playback_completed", "video_review_skipped",
  "caregiver_disposition_selected", "research_observations_submitted", "test_closed",
  "recording_deleted", "session_cleared", "session_abandoned",
  "research_logging_failed",
]);
const ENVELOPE_KEYS = new Set([
  "schema_version", "request_id", "sent_at_utc", "analytics_events",
  "test_sessions", "leads", "lead_submission_context",
]);
const ANALYTICS_KEYS = new Set([
  "schema_version", "event_id", "session_id", "sequence_number",
  "occurred_at_utc", "event_name", "page_path", "role_mode", "workflow_step",
  "cta_id", "source", "elapsed_ms", "device_type", "browser_family", "os_family",
  "language", "timezone", "online", "analytics_consent_version", "properties_json",
]);
const SESSION_KEYS = new Set([
  "schema_version", "session_id", "participant_code", "participant_type",
  "test_condition", "started_at_utc", "ended_at_utc", "completion_state",
  "furthest_step", "zero_touch_success", "wearer_interaction_count", "prompt_type",
  "prompt_delivered", "prompt_repeat_count", "camera_permission",
  "microphone_permission", "recording_status", "recording_duration_seconds",
  "recording_blob_bytes", "privacy_stop", "video_review_status",
  "caregiver_review_started_at_utc", "review_duration_seconds",
  "caregiver_disposition", "clip_usefulness", "prompt_comprehension",
  "false_reassurance", "review_burden", "privacy_rating", "technical_error_code",
  "research_notes", "research_consent_version", "submitted_at_utc",
]);
const LEAD_KEYS = new Set([
  "schema_version", "lead_id", "submitted_at_utc", "name",
  "phone_country_code", "phone_number", "role_interest", "source_cta",
  "contact_consent", "consent_text_version",
]);
const FORBIDDEN_KEYS = [
  "audio", "base64", "blob", "caregiver_name", "diagnosis", "dose", "media",
  "medication_name", "prompt_text", "thumbnail", "transcript", "video",
  "wearer_name",
];
const FORBIDDEN_VALUE =
  /(?:data:(?:audio|video|image)\/|blob:|;base64,|\b(?:diagnosis|dose|medication name|transcript)\s*:)/i;
const SAFE_TECHNICAL_KEYS = new Set([
  "recording_blob_bytes",
  "video_review_status",
]);


type DenoLikeGlobal = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
};

function env(name: string): string | undefined {
  return (globalThis as DenoLikeGlobal).Deno?.env?.get?.(name);
}

function readNamedKey(
  pluralEnvName: string,
  singularEnvName: string,
  legacyEnvName?: string,
): string | undefined {
  const named = env(pluralEnvName);
  if (named) {
    try {
      const parsed = JSON.parse(named) as Record<string, unknown>;
      const value = parsed.default;
      if (typeof value === "string" && value) return value;
    } catch {
      // Fall through to local/legacy environment variables.
    }
  }
  return env(singularEnvName) || (legacyEnvName ? env(legacyEnvName) : undefined);
}

function getPublishableKeys(): string[] {
  const keys: string[] = [];
  const named = env("SUPABASE_PUBLISHABLE_KEYS");
  if (named) {
    try {
      const parsed = JSON.parse(named) as Record<string, unknown>;
      for (const value of Object.values(parsed)) {
        if (typeof value === "string" && value) keys.push(value);
      }
    } catch {
      // Fall through to singular/legacy environment variables.
    }
  }
  const singular = env("SUPABASE_PUBLISHABLE_KEY");
  const legacy = env("SUPABASE_ANON_KEY");
  if (singular) keys.push(singular);
  if (legacy) keys.push(legacy);
  return [...new Set(keys)];
}

function getSecretKey(): string | undefined {
  return readNamedKey(
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
}

function getSupabaseUrl(): string | undefined {
  return env("SUPABASE_URL");
}

function configuredOrigins(): string[] {
  const raw = env("ALLOWED_ORIGINS") || env("ALLOWED_ORIGIN") || "";
  return raw
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function originAllowed(origin: string | null): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, "");
  const configured = configuredOrigins();
  if (configured.length) return configured.includes(normalized);
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized);
}

function createAdminClient() {
  const url = getSupabaseUrl();
  const secretKey = getSecretKey();
  if (!url || !secretKey) {
    throw new SafeError("service_not_configured", "Research service is unavailable.", 503);
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const throttleBuckets = new Map<string, { count: number; resetAt: number }>();

class SafeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new SafeError("unexpected_key", `${label} contains an unexpected field.`);
  }
}

function assertUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new SafeError("invalid_identifier", `${label} is invalid.`);
  }
}

function assertTimestamp(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) {
    throw new SafeError("invalid_timestamp", `${label} is invalid.`);
  }
}

function assertString(value: unknown, label: string, max: number, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new SafeError("invalid_string", `${label} is invalid.`);
  }
  if (FORBIDDEN_VALUE.test(value)) {
    throw new SafeError("forbidden_content", `${label} contains forbidden content.`);
  }
  if (value.length > 512 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new SafeError("encoded_content_rejected", `${label} resembles encoded data.`);
  }
}

function assertNoForbiddenKeys(value: Record<string, unknown>): void {
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      !SAFE_TECHNICAL_KEYS.has(normalized) &&
      FORBIDDEN_KEYS.some((blocked) => normalized.includes(blocked))
    ) {
      throw new SafeError("forbidden_field", "The payload contains a forbidden field.");
    }
    if (Array.isArray(item)) {
      item.forEach((entry) => {
        if (isObject(entry)) assertNoForbiddenKeys(entry);
      });
    } else if (isObject(item)) {
      assertNoForbiddenKeys(item);
    } else if (typeof item === "string") {
      assertString(item, "Payload value", 4000);
    }
  }
}

function enforceBestEffortThrottle(req: Request): void {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || req.headers.get("origin") || "anonymous";
  const now = Date.now();
  const existing = throttleBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    throttleBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  existing.count += 1;
  if (existing.count > 60) {
    throw new SafeError(
      "rate_limit_exceeded",
      "Too many requests. Retry shortly.",
      429,
    );
  }
  if (throttleBuckets.size > 1_000) {
    for (const [bucketKey, bucket] of throttleBuckets) {
      if (bucket.resetAt <= now) throttleBuckets.delete(bucketKey);
    }
  }
}

function validateAnalytics(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new SafeError("invalid_event", "Analytics event is invalid.");
  assertKeys(value, ANALYTICS_KEYS, "Analytics event");
  assertNoForbiddenKeys(value);
  if (value.schema_version !== SCHEMA_VERSION) throw new SafeError("schema_version_mismatch", "Schema version does not match.");
  assertUuid(value.event_id, "Event ID");
  assertUuid(value.session_id, "Session ID");
  assertTimestamp(value.occurred_at_utc, "Event time");
  if (typeof value.event_name !== "string" || !EVENT_NAMES.has(value.event_name)) {
    throw new SafeError("event_not_allowed", "Event name is not allowlisted.");
  }
  if (!Number.isInteger(value.sequence_number) || Number(value.sequence_number) < 1) {
    throw new SafeError("invalid_sequence", "Sequence number is invalid.");
  }
  if (!isObject(value.properties_json)) {
    throw new SafeError("invalid_properties", "Analytics properties must be one flat object.");
  }
  for (const item of Object.values(value.properties_json)) {
    if (item !== null && !["string", "number", "boolean"].includes(typeof item)) {
      throw new SafeError("nested_properties_rejected", "Nested analytics properties are not accepted.");
    }
  }
  if (JSON.stringify(value.properties_json).length > 4000) {
    throw new SafeError("properties_too_large", "Analytics properties are too large.");
  }
  return value;
}

function validateSession(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new SafeError("invalid_session", "Test session is invalid.");
  assertKeys(value, SESSION_KEYS, "Test session");
  assertNoForbiddenKeys(value);
  if (value.schema_version !== SCHEMA_VERSION) throw new SafeError("schema_version_mismatch", "Schema version does not match.");
  assertUuid(value.session_id, "Session ID");
  assertTimestamp(value.started_at_utc, "Session start");
  assertTimestamp(value.ended_at_utc, "Session end");
  assertTimestamp(value.submitted_at_utc, "Submission time");
  if (value.caregiver_review_started_at_utc !== null) {
    assertTimestamp(value.caregiver_review_started_at_utc, "Review start");
  }
  assertString(value.participant_code, "Participant code", 40, true);
  assertString(value.technical_error_code, "Technical error code", 300, true);
  assertString(value.research_notes, "Research notes", 1000, true);
  for (const key of [
    "wearer_interaction_count", "prompt_repeat_count", "recording_duration_seconds",
    "recording_blob_bytes", "review_duration_seconds",
  ]) {
    if (!Number.isInteger(value[key]) || Number(value[key]) < 0) {
      throw new SafeError("invalid_number", `${key} is invalid.`);
    }
  }
  if (value.privacy_rating !== null && (!Number.isInteger(value.privacy_rating) || Number(value.privacy_rating) < 1 || Number(value.privacy_rating) > 5)) {
    throw new SafeError("invalid_privacy_rating", "Privacy rating is invalid.");
  }
  return value;
}

function validateLead(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new SafeError("invalid_lead", "Lead is invalid.");
  assertKeys(value, LEAD_KEYS, "Lead");
  if (value.schema_version !== SCHEMA_VERSION) throw new SafeError("schema_version_mismatch", "Schema version does not match.");
  assertUuid(value.lead_id, "Lead ID");
  assertTimestamp(value.submitted_at_utc, "Lead submission time");
  assertString(value.name, "Name", 100);
  assertString(value.phone_country_code, "Country code", 8);
  assertString(value.phone_number, "Phone number", 24);
  assertString(value.role_interest, "Role or interest", 80);
  assertString(value.source_cta, "CTA source", 80);
  assertString(value.consent_text_version, "Consent version", 60);
  if (!/^\+[1-9]\d{0,3}$/.test(String(value.phone_country_code))) throw new SafeError("invalid_country_code", "Country calling code is invalid.");
  if (!/^\d{6,18}$/.test(String(value.phone_number))) throw new SafeError("invalid_phone", "Phone number is invalid.");
  if (value.contact_consent !== true) throw new SafeError("contact_consent_required", "Contact consent is required.");
  return value;
}

function validateEnvelope(value: unknown): {
  schema_version: string;
  request_id: string;
  sent_at_utc: string;
  analytics_events: Record<string, unknown>[];
  test_sessions: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  lead_submission_context?: { honeypot: string; elapsed_ms: number };
} {
  if (!isObject(value)) throw new SafeError("invalid_envelope", "Research envelope is invalid.");
  assertKeys(value, ENVELOPE_KEYS, "Research envelope");
  if (value.schema_version !== SCHEMA_VERSION) throw new SafeError("schema_version_mismatch", "Schema version does not match.");
  assertUuid(value.request_id, "Request ID");
  assertTimestamp(value.sent_at_utc, "Sent time");
  if (!Array.isArray(value.analytics_events) || !Array.isArray(value.test_sessions) || !Array.isArray(value.leads)) {
    throw new SafeError("invalid_batches", "Research batches are invalid.");
  }
  if ([value.analytics_events, value.test_sessions, value.leads].some((batch) => batch.length > MAX_BATCH)) {
    throw new SafeError("batch_too_large", "A research batch exceeds 50 records.");
  }
  if (value.analytics_events.length + value.test_sessions.length + value.leads.length === 0) {
    throw new SafeError("empty_envelope", "Research envelope is empty.");
  }
  const context = value.lead_submission_context;
  if (value.leads.length) {
    if (!isObject(context) || typeof context.honeypot !== "string" || !Number.isFinite(context.elapsed_ms)) {
      throw new SafeError("invalid_lead_context", "Lead context is invalid.");
    }
    if (context.honeypot.trim()) throw new SafeError("honeypot_rejected", "Submission rejected.", 422);
    if (Number(context.elapsed_ms) < 1200) throw new SafeError("submission_timing_rejected", "Submission rejected.", 422);
  }
  return {
    schema_version: SCHEMA_VERSION,
    request_id: value.request_id,
    sent_at_utc: String(value.sent_at_utc),
    analytics_events: value.analytics_events.map(validateAnalytics),
    test_sessions: value.test_sessions.map(validateSession),
    leads: value.leads.map(validateLead),
    ...(context && isObject(context)
      ? {
          lead_submission_context: {
            honeypot: String(context.honeypot),
            elapsed_ms: Number(context.elapsed_ms),
          },
        }
      : {}),
  };
}


function keyKind(value: string | undefined | null): string {
  if (!value) return "missing";
  if (value.startsWith("sb_publishable_")) return "publishable";
  if (value.startsWith("sb_secret_")) return "secret";
  if (value.split(".").length === 3) return "legacy_jwt";
  return "other";
}

function trace(
  level: "info" | "warn" | "error",
  traceId: string,
  stage: string,
  details: Record<string, unknown> = {},
): void {
  const record = {
    service: "memolens-research-ingest",
    trace_id: traceId,
    stage,
    at_utc: new Date().toISOString(),
    ...details,
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function dbErrorDetails(error: unknown): Record<string, unknown> {
  if (!isObject(error)) return { kind: typeof error };
  return {
    db_code: typeof error.code === "string" ? error.code.slice(0, 80) : undefined,
    db_message: typeof error.message === "string" ? error.message.slice(0, 300) : undefined,
    db_details: typeof error.details === "string" ? error.details.slice(0, 300) : undefined,
    db_hint: typeof error.hint === "string" ? error.hint.slice(0, 300) : undefined,
  };
}

function corsHeaders(origin: string | null): HeadersInit {
  const requestOrigin = origin?.replace(/\/$/, "") ?? "";
  return {
    "Access-Control-Allow-Origin": requestOrigin && originAllowed(origin) ? requestOrigin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
  traceId?: string,
  stage?: string,
): Response {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(origin),
      "Cache-Control": "no-store",
      ...(traceId ? { "X-Memolens-Trace-Id": traceId } : {}),
      ...(stage ? { "X-Memolens-Stage": stage } : {}),
    },
  });
}

function payloadType(payload: unknown): string {
  if (!isObject(payload)) return "unknown";
  const parts: string[] = [];
  if (Array.isArray(payload.analytics_events) && payload.analytics_events.length) parts.push("analytics");
  if (Array.isArray(payload.test_sessions) && payload.test_sessions.length) parts.push("test_session");
  if (Array.isArray(payload.leads) && payload.leads.length) parts.push("lead");
  return parts.join("+").slice(0, 40) || "unknown";
}

export default {
  fetch: async (req: Request) => {
    const traceId = crypto.randomUUID();
    let stage = "request_received";
    const origin = req.headers.get("origin");
    const providedApiKey = req.headers.get("apikey") ?? "";

    trace("info", traceId, stage, {
      method: req.method,
      origin: origin ?? "none",
      content_type: req.headers.get("content-type") ?? "none",
      provided_key_kind: keyKind(providedApiKey),
      has_apikey_header: Boolean(providedApiKey),
    });

    if (req.method === "OPTIONS") {
      stage = originAllowed(origin) ? "preflight_allowed" : "preflight_rejected";
      trace(originAllowed(origin) ? "info" : "warn", traceId, stage, {
        configured_origins: configuredOrigins(),
      });
      if (!originAllowed(origin)) {
        return new Response(null, {
          status: 403,
          headers: {
            ...corsHeaders(origin),
            "X-Memolens-Trace-Id": traceId,
            "X-Memolens-Stage": stage,
          },
        });
      }
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          "X-Memolens-Trace-Id": traceId,
          "X-Memolens-Stage": stage,
        },
      });
    }

    if (req.method !== "POST") {
      stage = "method_rejected";
      trace("warn", traceId, stage, { method: req.method });
      return json({ ok: false, error_code: "method_not_allowed", stage }, 405, origin, traceId, stage);
    }

    if (!originAllowed(origin)) {
      stage = "origin_rejected";
      trace("warn", traceId, stage, { configured_origins: configuredOrigins() });
      return json({ ok: false, error_code: "origin_not_allowed", stage }, 403, origin, traceId, stage);
    }

    const acceptedPublishableKeys = getPublishableKeys();
    const secretKey = getSecretKey();
    const supabaseUrl = getSupabaseUrl();
    stage = "configuration_checked";
    trace("info", traceId, stage, {
      has_supabase_url: Boolean(supabaseUrl),
      configured_publishable_key_count: acceptedPublishableKeys.length,
      configured_publishable_key_kinds: [...new Set(acceptedPublishableKeys.map(keyKind))],
      has_publishable_key: acceptedPublishableKeys.length > 0,
      has_secret_key: Boolean(secretKey),
      configured_origins: configuredOrigins(),
    });

    if (!providedApiKey || !acceptedPublishableKeys.includes(providedApiKey)) {
      stage = "api_key_rejected";
      trace("warn", traceId, stage, {
        configured_publishable_key_count: acceptedPublishableKeys.length,
        configured_publishable_key_kinds: [...new Set(acceptedPublishableKeys.map(keyKind))],
        provided_key_kind: keyKind(providedApiKey),
        expected_key_present: acceptedPublishableKeys.length > 0,
        provided_key_present: Boolean(providedApiKey),
      });
      return json({ ok: false, error_code: "invalid_api_key", stage }, 401, origin, traceId, stage);
    }

    stage = "api_key_accepted";
    trace("info", traceId, stage);

    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      stage = "content_type_rejected";
      trace("warn", traceId, stage, { content_type: req.headers.get("content-type") ?? "none" });
      return json({ ok: false, error_code: "json_required", stage }, 415, origin, traceId, stage);
    }

    let raw = "";
    let parsed: unknown;
    let requestId: string = crypto.randomUUID();
    try {
      stage = "throttle_check";
      enforceBestEffortThrottle(req);

      stage = "body_read";
      const declaredLength = Number(req.headers.get("content-length") || 0);
      if (declaredLength > MAX_BODY_BYTES) throw new SafeError("body_too_large", "Request body is too large.", 413);
      raw = await req.text();
      const actualBytes = new TextEncoder().encode(raw).byteLength;
      trace("info", traceId, stage, { declared_bytes: declaredLength || null, actual_bytes: actualBytes });
      if (actualBytes > MAX_BODY_BYTES) {
        throw new SafeError("body_too_large", "Request body is too large.", 413);
      }

      stage = "json_parse";
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new SafeError("invalid_json", "Request body is not valid JSON.");
      }
      if (isObject(parsed) && typeof parsed.request_id === "string" && UUID_PATTERN.test(parsed.request_id)) {
        requestId = parsed.request_id;
      }

      stage = "payload_validation";
      const payload = validateEnvelope(parsed);
      trace("info", traceId, "payload_validated", {
        request_id: requestId,
        analytics_count: payload.analytics_events.length,
        session_count: payload.test_sessions.length,
        lead_count: payload.leads.length,
        payload_type: payloadType(parsed),
      });

      stage = "admin_client_creation";
      const supabase = createAdminClient();
      trace("info", traceId, "admin_client_ready", {
        secret_key_kind: keyKind(secretKey),
      });

      let insertedEvents = 0;
      let insertedLeads = 0;
      let insertedSessions = 0;
      let updatedSessions = 0;

      if (payload.analytics_events.length) {
        stage = "analytics_write";
        const { data, error } = await supabase
          .from("analytics_events")
          .upsert(payload.analytics_events, { onConflict: "event_id", ignoreDuplicates: true })
          .select("event_id");
        if (error) {
          trace("error", traceId, "analytics_write_failed", { request_id: requestId, ...dbErrorDetails(error) });
          throw new SafeError("analytics_write_failed", "Analytics write failed.", 502);
        }
        insertedEvents = data?.length ?? 0;
        trace("info", traceId, "analytics_write_ok", { request_id: requestId, inserted: insertedEvents });
      }

      if (payload.leads.length) {
        stage = "lead_write";
        const { data, error } = await supabase
          .from("leads")
          .upsert(payload.leads, { onConflict: "lead_id", ignoreDuplicates: true })
          .select("lead_id");
        if (error) {
          trace("error", traceId, "lead_write_failed", { request_id: requestId, ...dbErrorDetails(error) });
          throw new SafeError("lead_write_failed", "Lead write failed.", 502);
        }
        insertedLeads = data?.length ?? 0;
        trace("info", traceId, "lead_write_ok", { request_id: requestId, inserted: insertedLeads });
      }

      if (payload.test_sessions.length) {
        stage = "session_lookup";
        const ids = payload.test_sessions.map((session) => String(session.session_id));
        const { data: existing, error: existingError } = await supabase
          .from("test_sessions")
          .select("session_id")
          .in("session_id", ids);
        if (existingError) {
          trace("error", traceId, "session_lookup_failed", { request_id: requestId, ...dbErrorDetails(existingError) });
          throw new SafeError("session_lookup_failed", "Session write failed.", 502);
        }
        const existingIds = new Set((existing ?? []).map((row) => row.session_id));
        trace("info", traceId, "session_lookup_ok", { request_id: requestId, existing_count: existingIds.size });

        stage = "session_write";
        const { error } = await supabase
          .from("test_sessions")
          .upsert(payload.test_sessions, { onConflict: "session_id" });
        if (error) {
          trace("error", traceId, "session_write_failed", { request_id: requestId, ...dbErrorDetails(error) });
          throw new SafeError("session_write_failed", "Session write failed.", 502);
        }
        updatedSessions = ids.filter((id) => existingIds.has(id)).length;
        insertedSessions = ids.length - updatedSessions;
        trace("info", traceId, "session_write_ok", {
          request_id: requestId,
          inserted: insertedSessions,
          updated: updatedSessions,
        });
      }

      stage = "completed";
      trace("info", traceId, stage, {
        request_id: requestId,
        inserted_events: insertedEvents,
        inserted_sessions: insertedSessions,
        updated_sessions: updatedSessions,
        inserted_leads: insertedLeads,
      });

      return json({
        ok: true,
        stage,
        trace_id: traceId,
        request_id: requestId,
        inserted: {
          analytics_events: insertedEvents,
          test_sessions: insertedSessions,
          leads: insertedLeads,
        },
        duplicates: {
          analytics_events: payload.analytics_events.length - insertedEvents,
          leads: payload.leads.length - insertedLeads,
        },
        updated: { test_sessions: updatedSessions },
      }, 200, origin, traceId, stage);
    } catch (error) {
      const failedAt = stage;
      const safe = error instanceof SafeError
        ? error
        : new SafeError("ingestion_failed", "Research ingestion failed safely.", 500);

      trace("error", traceId, "request_failed", {
        request_id: requestId,
        failed_at: failedAt,
        error_code: safe.code,
        status: safe.status,
        error_name: error instanceof Error ? error.name : typeof error,
        error_message: error instanceof Error ? error.message.slice(0, 300) : undefined,
      });

      let supabase: ReturnType<typeof createClient> | null = null;
      try {
        supabase = createAdminClient();
      } catch (adminError) {
        trace("error", traceId, "error_log_client_unavailable", {
          failed_at: failedAt,
          error_name: adminError instanceof Error ? adminError.name : typeof adminError,
        });
        supabase = null;
      }
      if (supabase) {
        const sessionId =
          isObject(parsed) &&
          Array.isArray(parsed.test_sessions) &&
          isObject(parsed.test_sessions[0]) &&
          typeof parsed.test_sessions[0].session_id === "string" &&
          UUID_PATTERN.test(parsed.test_sessions[0].session_id)
            ? parsed.test_sessions[0].session_id
            : null;
        const { error: loggingError } = await supabase.from("ingestion_errors").insert({
          schema_version: SCHEMA_VERSION,
          request_id: requestId,
          error_code: safe.code.slice(0, 80),
          error_message: `${safe.message} [stage=${failedAt}]`.slice(0, 300),
          payload_type: payloadType(parsed),
          session_id: sessionId,
        });
        if (loggingError) {
          trace("error", traceId, "ingestion_error_log_write_failed", dbErrorDetails(loggingError));
        } else {
          trace("info", traceId, "ingestion_error_logged", { request_id: requestId, error_code: safe.code });
        }
      }

      return json(
        {
          ok: false,
          trace_id: traceId,
          request_id: requestId,
          error_code: safe.code,
          stage: failedAt,
          message: safe.message,
        },
        safe.status,
        origin,
        traceId,
        failedAt,
      );
    } finally {
      raw = "";
      parsed = undefined;
    }
  },
};
