import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateResearchEnvelope } from "./researchValidation";
import type {
  ResearchEnvelope,
  SupabaseAcknowledgement,
} from "./researchTypes";

export type ResearchTransport = "direct" | "edge";

export class SupabaseResearchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SupabaseResearchError";
  }
}

interface SupabaseConfiguration {
  url: string;
  anonKey: string;
  transport: ResearchTransport;
  edgeFunctionUrl: string;
}

let standardClient: SupabaseClient | undefined;
let keepaliveClient: SupabaseClient | undefined;

function configuration(): SupabaseConfiguration {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  const transport =
    import.meta.env.VITE_RESEARCH_TRANSPORT === "edge" ? "edge" : "direct";
  if (!url || !anonKey) {
    throw new SupabaseResearchError(
      "supabase_not_configured",
      "Supabase research collection is not configured.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SupabaseResearchError(
      "supabase_not_configured",
      "Supabase project URL is invalid.",
    );
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new SupabaseResearchError(
      "supabase_not_configured",
      "Supabase project URL must use HTTPS.",
    );
  }
  const edgeFunctionUrl =
    import.meta.env.VITE_SUPABASE_EDGE_FUNCTION_URL?.trim() ||
    `${url}/functions/v1/ingest`;
  return { url, anonKey, transport, edgeFunctionUrl };
}

function clientFor(keepalive: boolean): SupabaseClient {
  if (keepalive && keepaliveClient) return keepaliveClient;
  if (!keepalive && standardClient) return standardClient;
  const config = configuration();
  const transportFetch: typeof fetch = (input, init) =>
    globalThis.fetch(input, {
      ...init,
      ...(keepalive ? { keepalive: true } : {}),
    });
  const client = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      fetch: transportFetch,
      headers: { "X-Client-Info": "memolens-mvp/1.0" },
    },
  });
  if (keepalive) keepaliveClient = client;
  else standardClient = client;
  return client;
}

function ensureSucceeded(
  error: { code?: string; message?: string } | null,
  fallbackCode: string,
): void {
  if (!error) return;
  throw new SupabaseResearchError(
    error.code || fallbackCode,
    "Supabase did not confirm the research write.",
  );
}

async function submitDirect(
  envelope: ResearchEnvelope,
  keepalive: boolean,
): Promise<SupabaseAcknowledgement> {
  const supabase = clientFor(keepalive);
  if (envelope.analytics_events.length) {
    const { error } = await supabase
      .from("analytics_events")
      .upsert(envelope.analytics_events, {
        onConflict: "event_id",
        ignoreDuplicates: true,
      });
    ensureSucceeded(error, "analytics_write_failed");
  }
  if (envelope.test_sessions.length) {
    const { error } = await supabase
      .from("test_sessions")
      .upsert(envelope.test_sessions, { onConflict: "session_id" });
    ensureSucceeded(error, "test_session_write_failed");
  }
  if (envelope.leads.length) {
    const { error } = await supabase
      .from("leads")
      .upsert(envelope.leads, {
        onConflict: "lead_id",
        ignoreDuplicates: true,
      });
    ensureSucceeded(error, "lead_write_failed");
  }
  return {
    ok: true,
    request_id: envelope.request_id,
    transport: "direct",
    inserted: {
      analytics_events: envelope.analytics_events.length,
      test_sessions: envelope.test_sessions.length,
      leads: envelope.leads.length,
    },
    duplicates: { analytics_events: 0, leads: 0 },
    updated: { test_sessions: 0 },
  };
}

async function submitThroughEdgeFunction(
  envelope: ResearchEnvelope,
  keepalive: boolean,
): Promise<SupabaseAcknowledgement> {
  const config = configuration();
  const response = await globalThis.fetch(config.edgeFunctionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
    body: JSON.stringify(envelope),
    keepalive,
  });
  let acknowledgement: SupabaseAcknowledgement;
  try {
    acknowledgement = (await response.json()) as SupabaseAcknowledgement;
  } catch {
    throw new SupabaseResearchError(
      "invalid_edge_acknowledgement",
      "The Supabase Edge Function returned an invalid acknowledgement.",
    );
  }
  if (
    !response.ok ||
    acknowledgement.ok !== true ||
    acknowledgement.request_id !== envelope.request_id
  ) {
    throw new SupabaseResearchError(
      acknowledgement.error_code || "edge_write_failed",
      "The Supabase Edge Function did not confirm the research write.",
    );
  }
  return { ...acknowledgement, transport: "edge" };
}

export async function submitResearchEnvelope(
  envelope: ResearchEnvelope,
  options: { keepalive?: boolean } = {},
): Promise<SupabaseAcknowledgement> {
  const validated = validateResearchEnvelope(envelope);
  const config = configuration();
  return config.transport === "edge"
    ? submitThroughEdgeFunction(validated, options.keepalive ?? false)
    : submitDirect(validated, options.keepalive ?? false);
}

export function resetSupabaseClientForTests(): void {
  // Clients delegate to globalThis.fetch at request time, so one in-memory
  // instance is safe across unit tests and avoids duplicate auth clients.
}
