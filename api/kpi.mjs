import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const COOKIE_NAME = "memolens_kpi_session";
const SESSION_SECONDS = 10 * 60 * 60;
const MAX_ROWS = 10000;
const loginFailures = new Map();

function env(name) {
  return process.env[name] || "";
}

function isConfigured() {
  return Boolean(
    env("KPI_PASSWORD") &&
    env("KPI_SESSION_SECRET") &&
    (env("SUPABASE_URL") || env("VITE_SUPABASE_URL")) &&
    (env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY")),
  );
}

function supabaseAdmin() {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("kpi_database_not_configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sendSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none';");
}

function json(res, status, body) {
  sendSecurityHeaders(res);
  res.status(status).json(body);
}

function parseCookies(req) {
  const raw = req.headers?.cookie || "";
  const output = {};
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) output[key] = decodeURIComponent(value);
  }
  return output;
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return createHmac("sha256", env("KPI_SESSION_SECRET")).update(value).digest("base64url");
}

function makeSession() {
  const payload = JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    nonce: randomBytes(18).toString("base64url"),
  });
  const encoded = b64url(payload);
  return `${encoded}.${sign(encoded)}`;
}

function constantEqual(a, b) {
  const left = createHash("sha256").update(String(a)).digest();
  const right = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(left, right);
}

function validSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token || !env("KPI_SESSION_SECRET")) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;
  const expected = sign(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return Number.isFinite(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function setSessionCookie(res) {
  const secure = env("VERCEL") === "1" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(makeSession())}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`,
  );
}

function clearSessionCookie(res) {
  const secure = env("VERCEL") === "1" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
  );
}

function clientKey(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.headers?.["x-real-ip"] || "unknown");
}

function throttleLogin(req) {
  const key = clientKey(req);
  const now = Date.now();
  const item = loginFailures.get(key);
  if (!item || item.resetAt <= now) {
    loginFailures.set(key, { count: 0, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  return item.count >= 8;
}

function recordLoginFailure(req) {
  const key = clientKey(req);
  const now = Date.now();
  const item = loginFailures.get(key);
  if (!item || item.resetAt <= now) {
    loginFailures.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    item.count += 1;
  }
  if (loginFailures.size > 500) {
    for (const [bucket, value] of loginFailures) {
      if (value.resetAt <= now) loginFailures.delete(bucket);
    }
  }
}

function clearLoginFailures(req) {
  loginFailures.delete(clientKey(req));
}

function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function safeRate(numerator, denominator) {
  return denominator ? (numerator / denominator) * 100 : null;
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function round(value, digits = 1) {
  return value === null ? null : Number(value.toFixed(digits));
}

function choiceBreakdown(rows, field) {
  const values = rows.map((row) => row[field]).filter((value) => ["yes", "maybe", "no"].includes(value));
  return {
    yes: values.filter((value) => value === "yes").length,
    maybe: values.filter((value) => value === "maybe").length,
    no: values.filter((value) => value === "no").length,
    total: values.length,
  };
}

function groupField(rows, field, labels = {}) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[field];
    if (typeof value !== "string" || !value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: labels[key] || key.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()),
      count,
      rate: total ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function uniqueSessionCount(events, eventName) {
  return new Set(events.filter((event) => event.event_name === eventName).map((event) => event.session_id)).size;
}

function lastDays(rows, days = 14) {
  const output = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    const key = date.toISOString().slice(0, 10);
    output.push({
      date: key,
      count: rows.filter((row) => String(row.submitted_at_utc || "").slice(0, 10) === key).length,
    });
  }
  return output;
}

async function fetchAll(table, select = "*", orderBy = null) {
  const client = supabaseAdmin();
  let query = client.from(table).select(select).limit(MAX_ROWS);
  if (orderBy) query = query.order(orderBy, { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(`${table}:${error.code || "query_failed"}`);
  return data || [];
}

async function fetchOptionalAll(table, select = "*", orderBy = null) {
  try {
    return { rows: await fetchAll(table, select, orderBy), available: true };
  } catch {
    // Optional diagnostics must never block the core learning dashboard.
    return { rows: [], available: false };
  }
}

async function leadCount() {
  const client = supabaseAdmin();
  const { count, error } = await client.from("leads").select("lead_id", { count: "exact", head: true });
  if (error) throw new Error(`leads:${error.code || "count_failed"}`);
  return count || 0;
}

async function summary() {
  const [sessions, events, errorResult, leads] = await Promise.all([
    // Use "*" here so the dashboard remains readable across the original,
    // post-feedback, and care-recipient terminology schema revisions.
    // Missing newer fields are treated as "not yet recorded" by the KPI logic.
    fetchAll("test_sessions", "*", "submitted_at_utc"),
    fetchAll("analytics_events", "session_id,event_name,occurred_at_utc", "occurred_at_utc"),
    fetchOptionalAll(
      "ingestion_errors",
      "received_at_utc,error_code,payload_type,session_id",
      "received_at_utc",
    ),
    leadCount(),
  ]);
  const errors = errorResult.rows;

  const recordingEligible = sessions.filter((row) => typeof row.recording_status === "string" && row.recording_status);
  const recordingSuccess = recordingEligible.filter((row) =>
    ["evidence_available", "completed"].includes(row.recording_status),
  ).length;
  const completionStarts = uniqueSessionCount(events, "test_consent_completed");
  const completedSessions = uniqueSessionCount(events, "test_closed");
  const handsFreeEligible = sessions.filter((row) => typeof row.zero_touch_success === "boolean");
  const reminderEligible = sessions.filter((row) => typeof row.prompt_delivered === "boolean");
  const cameraEligible = sessions.filter((row) => ["granted", "denied"].includes(row.camera_permission));
  const microphoneEligible = sessions.filter((row) => ["granted", "denied"].includes(row.microphone_permission));
  const technicalEligible = sessions.filter((row) => "technical_error_code" in row);
  const privacyEligible = sessions.filter((row) => typeof row.privacy_stop === "boolean");

  const funnelSpec = [
    ["test_consent_completed", "Test consent completed"],
    ["caregiver_setup_started", "Caregiver setup started"],
    ["preflight_started", "Device check started"],
    ["care_recipient_mode_entered", "Care-recipient mode entered"],
    ["recording_completed", "Memo recording completed"],
    ["caregiver_review_viewed", "Caregiver review opened"],
    ["test_closed", "Test closed"],
    ["post_test_feedback_submitted", "Feedback submitted"],
  ];
  const funnel = funnelSpec.map(([event, label]) => {
    const count = uniqueSessionCount(events, event);
    return {
      event,
      label,
      count,
      rate: completionStarts ? (count / completionStarts) * 100 : 0,
    };
  });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return {
    generated_at_utc: new Date().toISOString(),
    definitions: {
      submitted_tests: "Rows submitted to test_sessions after consented MVP testing.",
      completion_rate: "Unique analytics sessions with test_closed divided by unique sessions with test_consent_completed.",
      hands_free_success: "Share of submitted sessions with zero_touch_success=true among sessions where that field was recorded.",
      recording_success: "Share of submitted sessions whose recording_status is evidence_available or completed.",
      value_rating: "Average voluntary overall_value_rating among submitted post-test responses.",
      pilot_interest: "Yes/Maybe/No voluntary pilot_interest responses.",
    },
    diagnostics: {
      ingestion_errors_available: errorResult.available,
    },
    counts: {
      submitted_sessions: sessions.length,
      analytics_sessions: new Set(events.map((event) => event.session_id)).size,
      leads,
      ingestion_errors_7d: errors.filter((row) => Date.parse(row.received_at_utc) >= sevenDaysAgo).length,
      feedback_responses: sessions.filter((row) => Number.isFinite(Number(row.overall_value_rating))).length,
    },
    rates: {
      completion_rate: round(safeRate(completedSessions, completionStarts)),
      hands_free_success: round(safeRate(handsFreeEligible.filter((row) => row.zero_touch_success === true).length, handsFreeEligible.length)),
      recording_success: round(safeRate(recordingSuccess, recordingEligible.length)),
      reminder_delivery: round(safeRate(reminderEligible.filter((row) => row.prompt_delivered === true).length, reminderEligible.length)),
      camera_permission: round(safeRate(cameraEligible.filter((row) => row.camera_permission === "granted").length, cameraEligible.length)),
      microphone_permission: round(safeRate(microphoneEligible.filter((row) => row.microphone_permission === "granted").length, microphoneEligible.length)),
      privacy_stop: round(safeRate(privacyEligible.filter((row) => row.privacy_stop === true).length, privacyEligible.length)),
      technical_error: round(safeRate(technicalEligible.filter((row) => Boolean(row.technical_error_code)).length, technicalEligible.length)),
    },
    averages: {
      overall_value_rating: round(average(sessions.map((row) => row.overall_value_rating))),
      privacy_rating: round(average(sessions.map((row) => row.privacy_rating))),
      review_duration_seconds: round(average(sessions.map((row) => row.review_duration_seconds))),
      recording_duration_seconds: round(average(sessions.map((row) => row.recording_duration_seconds))),
      prompt_repeat_count: round(average(sessions.map((row) => row.prompt_repeat_count))),
    },
    choices: {
      would_consider_use: choiceBreakdown(sessions, "would_consider_use"),
      pilot_interest: choiceBreakdown(sessions, "pilot_interest"),
    },
    review: {
      dispositions: groupField(sessions, "caregiver_disposition", {
        appears_completed: "Appears completed",
        uncertain_follow_up: "Uncertain · follow-up",
        wearer_requested_help: "Care recipient requested help",
        no_usable_evidence: "No usable evidence",
        false_alert: "False alert",
        technical_failure: "Technical failure",
      }),
      burden: groupField(sessions, "review_burden"),
      clip_usefulness: groupField(sessions, "clip_usefulness"),
      prompt_comprehension: groupField(sessions, "prompt_comprehension"),
      false_reassurance: groupField(sessions, "false_reassurance"),
    },
    funnel,
    activity: lastDays(sessions, 14),
    recent_sessions: sessions.slice(0, 20).map((row) => ({
      session_id: row.session_id,
      participant_code: row.participant_code,
      submitted_at_utc: row.submitted_at_utc,
      completion_state: row.completion_state,
      zero_touch_success: row.zero_touch_success,
      recording_status: row.recording_status,
      caregiver_disposition: row.caregiver_disposition,
      overall_value_rating: row.overall_value_rating ?? null,
      pilot_interest: row.pilot_interest ?? null,
      privacy_rating: row.privacy_rating ?? null,
    })),
    recent_errors: errors.slice(0, 20),
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const string = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

function toCsv(rows) {
  if (!rows.length) return "no_data\r\n";
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    keys.map(csvEscape).join(","),
    ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(",")),
  ].join("\r\n");
}

function stamp() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

async function exportDataset(dataset) {
  const allowed = new Set(["sessions", "analytics", "errors", "leads", "all"]);
  if (!allowed.has(dataset)) throw new Error("invalid_export_dataset");

  if (dataset === "all") {
    const [analytics_events, test_sessions, leads, ingestion_errors] = await Promise.all([
      fetchAll("analytics_events", "*", "occurred_at_utc"),
      fetchAll("test_sessions", "*", "submitted_at_utc"),
      fetchAll("leads", "*", "submitted_at_utc"),
      fetchAll("ingestion_errors", "*", "received_at_utc"),
    ]);
    return {
      type: "application/json; charset=utf-8",
      filename: `memolens-research-backup-${stamp()}.json`,
      content: JSON.stringify({
        exported_at_utc: new Date().toISOString(),
        analytics_events,
        test_sessions,
        leads,
        ingestion_errors,
      }, null, 2),
    };
  }

  const config = {
    sessions: ["test_sessions", "submitted_at_utc"],
    analytics: ["analytics_events", "occurred_at_utc"],
    errors: ["ingestion_errors", "received_at_utc"],
    leads: ["leads", "submitted_at_utc"],
  }[dataset];
  const rows = await fetchAll(config[0], "*", config[1]);
  return {
    type: "text/csv; charset=utf-8",
    filename: `memolens-${config[0]}-${stamp()}.csv`,
    content: `\uFEFF${toCsv(rows)}`,
  };
}

export default async function handler(req, res) {
  sendSecurityHeaders(res);
  const action = String(req.query?.action || "status");

  if (action === "status" && req.method === "GET") {
    return json(res, 200, {
      configured: isConfigured(),
      authenticated: isConfigured() && validSession(req),
    });
  }

  if (!isConfigured()) {
    return json(res, 503, {
      ok: false,
      error_code: "kpi_not_configured",
      message: "The private KPI dashboard is not configured.",
    });
  }

  if (action === "login" && req.method === "POST") {
    if (throttleLogin(req)) {
      return json(res, 429, { ok: false, error_code: "too_many_attempts" });
    }
    const password = body(req).password;
    if (typeof password !== "string" || password.length > 256 || !constantEqual(password, env("KPI_PASSWORD"))) {
      recordLoginFailure(req);
      return json(res, 401, { ok: false, error_code: "invalid_password" });
    }
    clearLoginFailures(req);
    setSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (action === "logout" && req.method === "POST") {
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (!validSession(req)) {
    return json(res, 401, { ok: false, error_code: "authentication_required" });
  }

  try {
    if (action === "summary" && req.method === "GET") {
      return json(res, 200, await summary());
    }

    if (action === "export" && req.method === "GET") {
      const dataset = String(req.query?.dataset || "");
      const file = await exportDataset(dataset);
      sendSecurityHeaders(res);
      res.setHeader("Content-Type", file.type);
      res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
      return res.status(200).send(file.content);
    }

    return json(res, 404, { ok: false, error_code: "kpi_action_not_found" });
  } catch (error) {
    const internalMessage = error instanceof Error ? error.message : "";
    const failedDataset =
      internalMessage.startsWith("test_sessions:") ? "test_sessions" :
      internalMessage.startsWith("analytics_events:") ? "analytics_events" :
      internalMessage.startsWith("ingestion_errors:") ? "ingestion_errors" :
      internalMessage.startsWith("leads:") ? "leads" :
      "unknown";

    return json(res, 500, {
      ok: false,
      error_code: "kpi_query_failed",
      failed_dataset: failedDataset,
      message:
        failedDataset === "unknown"
          ? "The research dashboard could not retrieve the requested data."
          : `The dashboard could not read ${failedDataset}. Check the deployed Supabase key and database migrations.`,
    });
  }
}
