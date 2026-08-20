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
  it("surfaces a summary read failure instead of remaining on the loading screen", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ configured: true, authenticated: true }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error_code: "kpi_query_failed",
          failed_dataset: "test_sessions",
          message: "The dashboard could not read test_sessions. Check the deployed Supabase key and database migrations.",
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<KpiPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Dashboard data unavailable" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText("Preparing the current KPI view.")).not.toBeInTheDocument();
  });

  it("keeps ingestion_errors optional so diagnostics cannot block core KPIs", async () => {
    const fs = await import("node:fs/promises");
    const api = await fs.readFile("api/kpi.mjs", "utf8");
    expect(api).toContain("fetchOptionalAll");
    expect(api).toContain("ingestion_errors_available");
  });

});
