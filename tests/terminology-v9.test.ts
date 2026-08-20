import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function textFiles(dir: string): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  const output: string[] = [];
  for (const name of readdirSync(full)) {
    const item = join(full, name);
    const stat = statSync(item);
    if (stat.isDirectory()) {
      output.push(...textFiles(relative(root, item)));
    } else if (/\.(?:ts|tsx|css|md)$/.test(name)) {
      output.push(item);
    }
  }
  return output;
}

describe("Memolens v9 terminology", () => {
  it("uses Care recipient instead of wearer in active application code", () => {
    const files = [
      ...textFiles("src"),
      ...textFiles("supabase/functions"),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (/\bwearer\b/i.test(content)) {
        offenders.push(relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("renames the care-recipient experience component", () => {
    expect(
      existsSync(join(root, "src/components/test/CareRecipientExperience.tsx")),
    ).toBe(true);
    expect(
      existsSync(join(root, "src/components/test/WearerExperience.tsx")),
    ).toBe(false);
  });

  it("ships the approved plain-language product vocabulary", () => {
    const caregiverSetup = readFileSync(
      join(root, "src/components/test/CaregiverSetup.tsx"),
      "utf8",
    );
    const preflight = readFileSync(
      join(root, "src/components/test/Preflight.tsx"),
      "utf8",
    );
    const review = readFileSync(
      join(root, "src/components/test/CaregiverReview.tsx"),
      "utf8",
    );
    const landing = readFileSync(join(root, "src/routes/Landing.tsx"), "utf8");

    expect(caregiverSetup).toContain("Time between reminders");
    expect(caregiverSetup).toContain("Maximum Memo length");
    expect(preflight).toContain("Quick device check");
    expect(review).toContain("Memo inbox");
    expect(review).toContain("Review outcome");
    expect(review).toContain("Finish review");
    expect(landing).toContain("hands-free");
  });

  it("aligns the active research schema with care-recipient terminology", () => {
    const types = readFileSync(join(root, "src/services/researchTypes.ts"), "utf8");
    const edge = readFileSync(
      join(root, "supabase/functions/ingest/index.ts"),
      "utf8",
    );
    const migration = readFileSync(
      join(root, "supabase/migrations/202608200003_care_recipient_terminology.sql"),
      "utf8",
    );

    expect(types).toContain("care_recipient_interaction_count");
    expect(types).not.toContain("wearer_interaction_count");
    expect(edge).toContain('"care_recipient_ready_viewed"');
    expect(edge).toContain('"care_recipient_mode_entered"');
    expect(migration).toContain(
      "rename column wearer_interaction_count to care_recipient_interaction_count",
    );
  });
});
