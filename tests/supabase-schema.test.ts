import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "supabase/migrations/202608160001_memolens_research.sql",
  ),
  "utf8",
);
const edgeFunction = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/functions/ingest/index.ts"),
  "utf8",
);

describe("Supabase repository assets", () => {
  it("creates exactly the four research tables with deduplication keys", () => {
    const tables = [
      "analytics_events",
      "test_sessions",
      "leads",
      "ingestion_errors",
    ];
    for (const table of tables) {
      expect(migration).toContain(
        `create table if not exists public.${table}`,
      );
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
    expect(migration).toMatch(/event_id text not null unique/);
    expect(migration).toMatch(/session_id text not null unique/);
    expect(migration).toMatch(/lead_id text not null unique/);
  });

  it("allows anonymous writes while withholding public reads and error writes", () => {
    expect(migration).toContain(
      "revoke all on public.analytics_events from anon",
    );
    expect(migration).toContain("grant insert (");
    expect(migration).not.toMatch(/create policy .*select/i);
    expect(migration).not.toMatch(
      /grant insert[\s\S]{0,100}ingestion_errors to anon/i,
    );
  });

  it("contains no database columns for media or exact prompts", () => {
    const columnPattern =
      /^\s*(video|audio|blob|media_url|prompt_text|transcript)\s+/im;
    expect(migration).not.toMatch(columnPattern);
    expect(migration).toContain("analytics_properties_no_media");
  });

  it("ships the optional hardened function with limits and safe errors", () => {
    expect(edgeFunction).toContain("MAX_BODY_BYTES");
    expect(edgeFunction).toContain("MAX_BATCH");
    expect(edgeFunction).toContain("honeypot_rejected");
    expect(edgeFunction).toContain("submission_timing_rejected");
    expect(edgeFunction).toContain("rate_limit_exceeded");
    expect(edgeFunction).toContain('from("ingestion_errors")');
    expect(edgeFunction).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(edgeFunction).not.toMatch(/console\.(?:log|error|warn)/);
  });
});
