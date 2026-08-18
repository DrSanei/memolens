import {
  ANALYTICS_CONSENT_VERSION,
  SCHEMA_VERSION,
} from "../constants";
import type { ResearchEventName } from "../researchSchema";
import type { RoleMode, WorkflowStep } from "../types";
import {
  resetSupabaseClientForTests,
  submitResearchEnvelope,
} from "./supabaseClient";
import type {
  AnalyticsEventRecord,
  LeadRecord,
  ResearchEnvelope,
  ResearchProperties,
  SupabaseAcknowledgement,
  TestSessionRecord,
} from "./researchTypes";

export {
  RESEARCH_EVENT_NAMES,
  type ResearchEventName,
} from "../researchSchema";
export type {
  AnalyticsEventRecord,
  LeadRecord,
  ResearchEnvelope,
  SupabaseAcknowledgement as CollectorAcknowledgement,
  TestSessionRecord,
} from "./researchTypes";

export interface ResearchEventContext {
  roleMode?: RoleMode | "";
  workflowStep?: WorkflowStep | "";
  ctaId?: string;
  source?: string;
  elapsedMs?: number;
  properties?: ResearchProperties;
}

const BLOCKED_PROPERTY_KEYS = [
  "audio",
  "base64",
  "blob",
  "caregiver_name",
  "diagnosis",
  "dose",
  "media",
  "medication",
  "phone",
  "prompt_text",
  "thumbnail",
  "transcript",
  "video",
  "wearer_name",
];
const CRITICAL_EVENTS = new Set<ResearchEventName>([
  "camera_permission_denied",
  "microphone_permission_denied",
  "privacy_stop_used",
  "recording_failed",
  "research_observations_submitted",
  "test_closed",
]);

function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function pagePath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function deviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|android(?!.*mobile)/.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android/.test(ua)) return "mobile";
  return "desktop";
}

function browserFamily(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/CriOS|Chrome\//.test(ua)) return "Chrome";
  if (/FxiOS|Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome|Chromium/.test(ua)) return "Safari";
  return "Other";
}

function osFamily(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Mac OS/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

function safeProperties(properties?: ResearchProperties): ResearchProperties {
  if (!properties) return {};
  const filtered: ResearchProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    const normalized = key.toLowerCase();
    if (BLOCKED_PROPERTY_KEYS.some((blocked) => normalized.includes(blocked))) continue;
    if (typeof value === "string" && /^(?:data:|blob:)|;base64,/i.test(value)) continue;
    filtered[key.slice(0, 80)] =
      typeof value === "string" ? value.slice(0, 500) : value;
  }
  while (JSON.stringify(filtered).length > 4_000) {
    const lastKey = Object.keys(filtered).at(-1);
    if (!lastKey) break;
    delete filtered[lastKey];
  }
  return filtered;
}

class ResearchLogger {
  private sessionId = createId();
  private sequence = 0;
  private consent: "unknown" | "allowed" | "declined" = "unknown";
  private queue: AnalyticsEventRecord[] = [];
  private viewed = new Set<string>();
  private inFlight = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private batchTimer?: ReturnType<typeof setTimeout>;
  private failureQueued = false;
  private failureListeners = new Set<() => void>();

  getSessionId(): string {
    return this.sessionId;
  }

  startNewTestSession(): string {
    this.sessionId = createId();
    this.sequence = 0;
    this.viewed.clear();
    this.failureQueued = false;
    return this.sessionId;
  }

  getConsent(): "unknown" | "allowed" | "declined" {
    return this.consent;
  }

  onFailure(listener: () => void): () => void {
    this.failureListeners.add(listener);
    return () => this.failureListeners.delete(listener);
  }

  logViewOnce(
    key: string,
    eventName: ResearchEventName,
    context: ResearchEventContext = {},
  ): string | null {
    if (this.viewed.has(key)) return null;
    this.viewed.add(key);
    return this.log(eventName, context);
  }

  log(
    eventName: ResearchEventName,
    context: ResearchEventContext = {},
  ): string | null {
    if (this.consent === "declined") return null;
    const event: AnalyticsEventRecord = {
      schema_version: SCHEMA_VERSION,
      event_id: createId(),
      session_id: this.sessionId,
      sequence_number: ++this.sequence,
      occurred_at_utc: new Date().toISOString(),
      event_name: eventName,
      page_path: pagePath(),
      role_mode: context.roleMode ?? "",
      workflow_step: context.workflowStep ?? "",
      cta_id: context.ctaId ?? "",
      source: context.source ?? "",
      elapsed_ms: context.elapsedMs ?? null,
      device_type: deviceType(),
      browser_family: browserFamily(),
      os_family: osFamily(),
      language:
        typeof navigator === "undefined" ? "unknown" : navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      analytics_consent_version:
        this.consent === "allowed" ? ANALYTICS_CONSENT_VERSION : "",
      properties_json: safeProperties(context.properties),
    };
    this.queue.push(event);
    if (this.queue.length > 200) this.queue.shift();
    if (this.consent === "allowed") {
      if (CRITICAL_EVENTS.has(eventName) || this.queue.length >= 10) {
        void this.flush();
      } else {
        this.scheduleBatch();
      }
    }
    return event.event_id;
  }

  allowAnalytics(): void {
    if (this.consent === "allowed") return;
    this.consent = "allowed";
    this.queue = this.queue.map((event) => ({
      ...event,
      analytics_consent_version: ANALYTICS_CONSENT_VERSION,
    }));
    this.log("analytics_consent_accepted", {
      source: "landing_research_choice",
      properties: { consent_version: ANALYTICS_CONSENT_VERSION },
    });
    void this.flush();
  }

  declineAnalytics(): void {
    this.consent = "declined";
    this.queue = [];
    this.clearTimers();
  }

  async flush(options: { keepalive?: boolean } = {}): Promise<boolean> {
    if (
      this.consent !== "allowed" ||
      this.inFlight ||
      this.queue.length === 0
    ) {
      return true;
    }
    this.inFlight = true;
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.batchTimer = undefined;
    const batch = this.queue.splice(0, 20);
    const envelope = this.createEnvelope({ analytics_events: batch });
    try {
      await submitResearchEnvelope(envelope, {
        keepalive: options.keepalive ?? false,
      });
      this.failureQueued = false;
      if (this.queue.length > 0 && !options.keepalive) this.scheduleBatch(0);
      return true;
    } catch {
      this.queue.unshift(...batch);
      this.queueFailureEvent();
      this.failureListeners.forEach((listener) => listener());
      this.scheduleRetry();
      return false;
    } finally {
      this.inFlight = false;
    }
  }

  flushWhenHidden(): void {
    if (this.consent === "allowed") void this.flush({ keepalive: true });
  }

  async submitLead(
    lead: LeadRecord,
    context: { honeypot: string; elapsedMs: number },
  ): Promise<SupabaseAcknowledgement> {
    if (context.honeypot.trim()) throw new Error("lead_honeypot_rejected");
    if (!Number.isFinite(context.elapsedMs) || context.elapsedMs < 1_200) {
      throw new Error("lead_submission_too_fast");
    }
    const acknowledgement = await submitResearchEnvelope(
      this.createEnvelope({
        leads: [lead],
        lead_submission_context: {
          honeypot: context.honeypot,
          elapsed_ms: context.elapsedMs,
        },
      }),
    );
    if (this.consent === "allowed") {
      this.log("preorder_submitted", {
        ctaId: lead.source_cta,
        source: "preorder_form",
        properties: { role_interest: lead.role_interest },
      });
    }
    return acknowledgement;
  }

  async submitTestSession(
    session: TestSessionRecord,
  ): Promise<SupabaseAcknowledgement | { ok: true; transmitted: false }> {
    if (this.consent !== "allowed") {
      return { ok: true, transmitted: false };
    }
    return submitResearchEnvelope(
      this.createEnvelope({ test_sessions: [session] }),
    );
  }

  private createEnvelope(
    content: Partial<
      Pick<
        ResearchEnvelope,
        "analytics_events" | "test_sessions" | "leads"
      > &
        Pick<ResearchEnvelope, "lead_submission_context">
    >,
  ): ResearchEnvelope {
    return {
      schema_version: SCHEMA_VERSION,
      request_id: createId(),
      sent_at_utc: new Date().toISOString(),
      analytics_events: content.analytics_events ?? [],
      test_sessions: content.test_sessions ?? [],
      leads: content.leads ?? [],
      ...(content.lead_submission_context
        ? { lead_submission_context: content.lead_submission_context }
        : {}),
    };
  }

  private queueFailureEvent(): void {
    if (this.failureQueued || this.consent !== "allowed") return;
    this.failureQueued = true;
    const event: AnalyticsEventRecord = {
      schema_version: SCHEMA_VERSION,
      event_id: createId(),
      session_id: this.sessionId,
      sequence_number: ++this.sequence,
      occurred_at_utc: new Date().toISOString(),
      event_name: "research_logging_failed",
      page_path: pagePath(),
      role_mode: "caregiver",
      workflow_step: "",
      cta_id: "",
      source: "supabase_transport",
      elapsed_ms: null,
      device_type: deviceType(),
      browser_family: browserFamily(),
      os_family: osFamily(),
      language:
        typeof navigator === "undefined" ? "unknown" : navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      analytics_consent_version: ANALYTICS_CONSENT_VERSION,
      properties_json: { retry_queued: true },
    };
    this.queue.push(event);
  }

  private scheduleBatch(delay = 2_500): void {
    if (this.batchTimer || this.consent !== "allowed") return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = undefined;
      void this.flush();
    }, delay);
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.consent !== "allowed") return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.flush();
    }, 2_000);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.retryTimer = undefined;
    this.batchTimer = undefined;
  }

  inspectQueueForTests(): AnalyticsEventRecord[] {
    return [...this.queue];
  }

  resetForTests(): void {
    this.clearTimers();
    this.sessionId = createId();
    this.sequence = 0;
    this.consent = "unknown";
    this.queue = [];
    this.viewed.clear();
    this.inFlight = false;
    this.failureQueued = false;
    this.failureListeners.clear();
    resetSupabaseClientForTests();
  }
}

export const researchLogger = new ResearchLogger();
