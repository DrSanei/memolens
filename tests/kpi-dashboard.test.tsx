import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KpiPage } from "../src/routes/Kpi";

describe("private KPI dashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the password gate when no dashboard session is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ configured: true, authenticated: false }),
      }),
    );

    render(<KpiPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Memolens Learning Dashboard" })).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Dashboard password")).toHaveAttribute("type", "password");
  });

  it("does not expose Supabase service credentials in the KPI route source", async () => {
    const fs = await import("node:fs/promises");
    const route = await fs.readFile("src/routes/Kpi.tsx", "utf8");
    expect(route).not.toMatch(/SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/);
    expect(route).toContain("/api/kpi");
  });
});
