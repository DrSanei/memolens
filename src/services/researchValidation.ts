import { SCHEMA_VERSION } from "../constants";
import {
  ANALYTICS_EVENT_HEADERS,
  LEAD_HEADERS,
  RESEARCH_EVENT_NAMES,
  TEST_SESSION_HEADERS,
} from "../researchSchema";
import type {
  AnalyticsEventRecord,
  LeadRecord,
  ResearchEnvelope,
  ResearchPrimitive,
  TestSessionRecord,
} from "./researchTypes";

const MAX_BODY_BYTES = 60 * 1024;
const MAX_BATCH_SIZE = 50;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_NAMES = new Set<string>(RESEARCH_EVENT_NAMES);
const ANALYTICS_KEYS = new Set(
  ANALYTICS_EVENT_HEADERS.filter((key) => key !== "received_at_utc"),
);
const TEST_SESSION_KEYS = new Set(
  TEST_SESSION_HEADERS.filter((key) => key !== "received_at_utc"),
);
const LEAD_KEYS = new Set(LEAD_HEADERS.filter((key) => key !== "received_at_utc"));
const ENVELOPE_KEYS = new Set([
  "schema_version",
  "request_id",
  "sent_at_utc",
  "analytics_events",
  "test_sessions",
  "leads",
  "lead_submission_context",
]);
const BLOCKED_KEY_PARTS = [
  "audio",
  "base64",
  "blob",
  "caregiver_name",
  "diagnosis",
  "dose",
  "media",
  "medication_name",
  "prompt_text",
  "thumbnail",
  "transcript",
  "video",
  "care_recipient_name",
];
const BLOCKED_TEXT_PATTERN =
  /(?:data:(?:audio|video|image)\/|blob:|;base64,|\b(?:diagnosis|dose|medication name|transcript)\s*:)/i;

export class ResearchValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ResearchValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertAllowedKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new ResearchValidationError("unexpected_key", `${label} contains an unexpected field.`);
    }
  }
}

function assertUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ResearchValidationError("invalid_identifier", `${label} is invalid.`);
  }
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new ResearchValidationError("invalid_timestamp", `${label} is invalid.`);
  }
}

function assertSafeString(value: unknown, label: string, maxLength: number): void {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new ResearchValidationError("invalid_string", `${label} is invalid.`);
  }
  if (BLOCKED_TEXT_PATTERN.test(value) || value.includes("\u0000")) {
    throw new ResearchValidationError("forbidden_content", `${label} contains forbidden content.`);
  }
  if (
    value.length > 512 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new ResearchValidationError("encoded_content_rejected", `${label} resembles encoded data.`);
  }
}

function assertNoBrowserObjects(value: unknown): void {
  if (
    (typeof Blob !== "undefined" && value instanceof Blob) ||
    (typeof File !== "undefined" && value instanceof File) ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    throw new ResearchValidationError("media_rejected", "Binary or media data is not accepted.");
  }
}

function assertFlatProperties(value: unknown): asserts value is Record<string, ResearchPrimitive> {
  if (!isPlainObject(value)) {
    throw new ResearchValidationError("invalid_properties", "Analytics properties must be one flat object.");
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (BLOCKED_KEY_PARTS.some((part) => normalized.includes(part))) {
      throw new ResearchValidationError("forbidden_property", "Analytics properties contain a forbidden field.");
    }
    if (
      item !== null &&
      typeof item !== "string" &&
      typeof item !== "number" &&
      typeof item !== "boolean"
    ) {
      throw new ResearchValidationError("nested_property_rejected", "Nested analytics properties are not accepted.");
    }
    if (typeof item === "string") assertSafeString(item, "Analytics property", 500);
  }
  if (JSON.stringify(value).length > 4_000) {
    throw new ResearchValidationError("properties_too_large", "Analytics properties are too large.");
  }
}

export function validateAnalyticsEvent(value: unknown): AnalyticsEventRecord {
  assertNoBrowserObjects(value);
  if (!isPlainObject(value)) {
    throw new ResearchValidationError("invalid_event", "Analytics event is invalid.");
  }
  assertAllowedKeys(value, ANALYTICS_KEYS, "Analytics event");
  if (value.schema_version !== SCHEMA_VERSION) {
    throw new ResearchValidationError("schema_version_mismatch", "Schema version does not match.");
  }
  assertUuid(value.event_id, "Event ID");
  assertUuid(value.session_id, "Session ID");
  if (!Number.isInteger(value.sequence_number) || Number(value.sequence_number) < 1) {
    throw new ResearchValidationError("invalid_sequence", "Sequence number is invalid.");
  }
  assertTimestamp(value.occurred_at_utc, "Event timestamp");
  if (typeof value.event_name !== "string" || !EVENT_NAMES.has(value.event_name)) {
    throw new ResearchValidationError("event_not_allowed", "Event name is not allowlisted.");
  }
  assertSafeString(value.page_path, "Page path", 200);
  if (!String(value.page_path).startsWith("/")) {
    throw new ResearchValidationError("invalid_page_path", "Page path must be relative.");
  }
  for (const key of [
    "role_mode",
    "workflow_step",
    "cta_id",
    "source",
    "device_type",
    "browser_family",
    "os_family",
    "language",
    "timezone",
    "analytics_consent_version",
  ]) {
    assertSafeString(value[key], key, 120);
  }
  if (value.elapsed_ms !== null && (!Number.isFinite(value.elapsed_ms) || Number(value.elapsed_ms) < 0)) {
    throw new ResearchValidationError("invalid_elapsed_ms", "Elapsed time is invalid.");
  }
  if (typeof value.online !== "boolean") {
    throw new ResearchValidationError("invalid_online_state", "Online state is invalid.");
  }
  assertFlatProperties(value.properties_json);
  return value as unknown as AnalyticsEventRecord;
}

export function validateTestSession(value: unknown): TestSessionRecord {
  assertNoBrowserObjects(value);
  if (!isPlainObject(value)) {
    throw new ResearchValidationError("invalid_test_session", "Test session is invalid.");
  }
  assertAllowedKeys(value, TEST_SESSION_KEYS, "Test session");
  if (value.schema_version !== SCHEMA_VERSION) {
    throw new ResearchValidationError("schema_version_mismatch", "Schema version does not match.");
  }
  assertUuid(value.session_id, "Session ID");
  assertTimestamp(value.started_at_utc, "Session start");
  assertTimestamp(value.ended_at_utc, "Session end");
  assertTimestamp(value.submitted_at_utc, "Submission time");
  if (value.caregiver_review_started_at_utc !== null) {
    assertTimestamp(value.caregiver_review_started_at_utc, "Caregiver review start");
  }
  if (
    value.feedback_submitted_at_utc !== undefined &&
    value.feedback_submitted_at_utc !== null
  ) {
    assertTimestamp(value.feedback_submitted_at_utc, "Feedback submission time");
  }

  for (const [key, max] of [
    ["participant_code", 40],
    ["participant_type", 60],
    ["test_condition", 80],
    ["completion_state", 60],
    ["furthest_step", 60],
    ["prompt_type", 40],
    ["camera_permission", 40],
    ["microphone_permission", 40],
    ["recording_status", 60],
    ["video_review_status", 40],
    ["caregiver_disposition", 80],
    ["clip_usefulness", 20],
    ["prompt_comprehension", 20],
    ["false_reassurance", 20],
    ["review_burden", 20],
    ["technical_error_code", 300],
    ["research_notes", 1_000],
    ["would_consider_use", 10],
    ["pilot_interest", 10],
    ["feedback_text", 1_000],
    ["research_consent_version", 60],
  ] as const) {
    const item = value[key];
    if (item !== null && item !== undefined) assertSafeString(item, key, max);
  }

  for (const key of [
    "care_recipient_interaction_count",
    "prompt_repeat_count",
    "recording_duration_seconds",
    "recording_blob_bytes",
    "review_duration_seconds",
  ]) {
    if (!Number.isInteger(value[key]) || Number(value[key]) < 0) {
      throw new ResearchValidationError("invalid_number", `${key} is invalid.`);
    }
  }

  if (
    value.privacy_rating !== null &&
    (!Number.isInteger(value.privacy_rating) ||
      Number(value.privacy_rating) < 1 ||
      Number(value.privacy_rating) > 5)
  ) {
    throw new ResearchValidationError("invalid_privacy_rating", "Privacy rating is invalid.");
  }

  if (
    value.overall_value_rating !== undefined &&
    value.overall_value_rating !== null &&
    (!Number.isInteger(value.overall_value_rating) ||
      Number(value.overall_value_rating) < 1 ||
      Number(value.overall_value_rating) > 5)
  ) {
    throw new ResearchValidationError(
      "invalid_overall_value_rating",
      "Overall value rating is invalid.",
    );
  }

  for (const key of ["would_consider_use", "pilot_interest"] as const) {
    const answer = value[key];
    if (
      answer !== undefined &&
      answer !== null &&
      !["yes", "maybe", "no"].includes(String(answer))
    ) {
      throw new ResearchValidationError("invalid_feedback_choice", `${key} is invalid.`);
    }
  }

  if (
    value.zero_touch_success !== null &&
    typeof value.zero_touch_success !== "boolean"
  ) {
    throw new ResearchValidationError("invalid_zero_touch", "Zero-touch result is invalid.");
  }
  for (const key of ["prompt_delivered", "privacy_stop"]) {
    if (typeof value[key] !== "boolean") {
      throw new ResearchValidationError("invalid_boolean", `${key} is invalid.`);
    }
  }
  return value as unknown as TestSessionRecord;
}

export function validateLead(value: unknown): LeadRecord {
  assertNoBrowserObjects(value);
  if (!isPlainObject(value)) {
    throw new ResearchValidationError("invalid_lead", "Lead is invalid.");
  }
  assertAllowedKeys(value, LEAD_KEYS, "Lead");
  if (value.schema_version !== SCHEMA_VERSION) {
    throw new ResearchValidationError("schema_version_mismatch", "Schema version does not match.");
  }
  assertUuid(value.lead_id, "Lead ID");
  assertTimestamp(value.submitted_at_utc, "Lead submission time");

  if (value.name !== null) assertSafeString(value.name, "Name", 100);
  if (value.email !== undefined && value.email !== null) {
    assertSafeString(value.email, "Email", 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value.email))) {
      throw new ResearchValidationError("invalid_email", "Email is invalid.");
    }
  }

  const hasCountryCode =
    typeof value.phone_country_code === "string" && value.phone_country_code.length > 0;
  const hasPhone =
    typeof value.phone_number === "string" && value.phone_number.length > 0;
  if (hasCountryCode !== hasPhone) {
    throw new ResearchValidationError(
      "incomplete_phone",
      "Phone country code and phone number must be provided together.",
    );
  }
  if (hasPhone) {
    assertSafeString(value.phone_country_code, "Country code", 8);
    assertSafeString(value.phone_number, "Phone number", 24);
    if (!/^\+[1-9]\d{0,3}$/.test(String(value.phone_country_code))) {
      throw new ResearchValidationError("invalid_country_code", "Country calling code is invalid.");
    }
    if (!/^\d{6,18}$/.test(String(value.phone_number))) {
      throw new ResearchValidationError("invalid_phone", "Phone number is invalid.");
    }
  }

  const hasEmail = typeof value.email === "string" && value.email.trim().length > 0;
  if (!hasPhone && !hasEmail) {
    throw new ResearchValidationError(
      "contact_method_required",
      "At least one contact method is required.",
    );
  }

  assertSafeString(value.role_interest, "Role or interest", 80);
  assertSafeString(value.source_cta, "CTA source", 80);
  assertSafeString(value.consent_text_version, "Consent version", 60);
  if (value.contact_consent !== true) {
    throw new ResearchValidationError("contact_consent_required", "Contact consent is required.");
  }
  return value as unknown as LeadRecord;
}
export function validateResearchEnvelope(value: unknown): ResearchEnvelope {
  assertNoBrowserObjects(value);
  if (!isPlainObject(value)) {
    throw new ResearchValidationError("invalid_envelope", "Research envelope is invalid.");
  }
  assertAllowedKeys(value, ENVELOPE_KEYS, "Research envelope");
  if (value.schema_version !== SCHEMA_VERSION) {
    throw new ResearchValidationError("schema_version_mismatch", "Schema version does not match.");
  }
  assertUuid(value.request_id, "Request ID");
  assertTimestamp(value.sent_at_utc, "Sent time");
  if (
    !Array.isArray(value.analytics_events) ||
    !Array.isArray(value.test_sessions) ||
    !Array.isArray(value.leads)
  ) {
    throw new ResearchValidationError("invalid_batches", "Research batches are invalid.");
  }
  for (const batch of [value.analytics_events, value.test_sessions, value.leads]) {
    if (batch.length > MAX_BATCH_SIZE) {
      throw new ResearchValidationError("batch_too_large", "A research batch exceeds 50 records.");
    }
  }
  if (
    value.analytics_events.length +
      value.test_sessions.length +
      value.leads.length ===
    0
  ) {
    throw new ResearchValidationError("empty_envelope", "Research envelope is empty.");
  }
  value.analytics_events.forEach(validateAnalyticsEvent);
  value.test_sessions.forEach(validateTestSession);
  value.leads.forEach(validateLead);
  if (value.lead_submission_context !== undefined) {
    if (
      !isPlainObject(value.lead_submission_context) ||
      typeof value.lead_submission_context.honeypot !== "string" ||
      !Number.isFinite(value.lead_submission_context.elapsed_ms)
    ) {
      throw new ResearchValidationError("invalid_lead_context", "Lead context is invalid.");
    }
  }
  const body = JSON.stringify(value);
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new ResearchValidationError("payload_too_large", "Research payload is too large.");
  }
  return value as unknown as ResearchEnvelope;
}
