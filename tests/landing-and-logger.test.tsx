import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemolensApp } from "../src/App";
import { researchLogger } from "../src/services/researchLogger";

function acknowledgedFetch() {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    void _input;
    void _init;
    return Response.json([], { status: 201 });
  });
}

describe("landing CTAs and analytics consent", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    researchLogger.resetForTests();
  });

  it("renders stable CTA identifiers", () => {
    vi.stubGlobal("fetch", acknowledgedFetch());
    render(<MemolensApp />);

    expect(document.getElementById("hero_test_memolens")).toBeVisible();
    expect(document.getElementById("final_test_memolens")).toBeVisible();
    expect(document.getElementById("sticky_test_memolens")).toBeInTheDocument();
    expect(document.getElementById("hero_see_how_it_works")).toBeVisible();
    expect(document.getElementById("hero_preorder")).toBeVisible();
    expect(document.getElementById("final_preorder")).toBeVisible();
  });

  it("queues one landing view but transmits nothing before consent", async () => {
    const fetchMock = acknowledgedFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <StrictMode>
        <MemolensApp />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(
        researchLogger.inspectQueueForTests().filter((event) => event.event_name === "landing_viewed"),
      ).toHaveLength(1);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discards queued behavior and sends nothing after decline", async () => {
    const fetchMock = acknowledgedFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<MemolensApp />);

    fireEvent.click(screen.getByRole("button", { name: "Continue without analytics" }));
    fireEvent.click(document.getElementById("hero_test_memolens") as HTMLButtonElement);

    await screen.findByRole("heading", { name: "Before you test Memolens" });
    expect(researchLogger.inspectQueueForTests()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushes the original landing event after consent", async () => {
    const fetchMock = acknowledgedFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<MemolensApp />);

    fireEvent.click(screen.getByRole("button", { name: "Allow anonymous research data" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as Array<{
      event_name: string;
      analytics_consent_version: string;
    }>;
    expect(payload.map((event) => event.event_name)).toEqual([
      "landing_viewed",
      "analytics_consent_accepted",
    ]);
    expect(payload.every((event) => event.analytics_consent_version)).toBe(
      true,
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain("/rest/v1/analytics_events");
  });
});

describe("research logger reliability and minimization", () => {
  beforeEach(() => researchLogger.resetForTests());

  it("prevents duplicate genuine-view events", () => {
    researchLogger.logViewOnce("landing", "landing_viewed");
    researchLogger.logViewOnce("landing", "landing_viewed");
    expect(researchLogger.inspectQueueForTests()).toHaveLength(1);
  });

  it("reuses the original event ID during a failed-send retry", async () => {
    const bodies: Array<Array<{ event_id: string }>> = [];
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Array<{ event_id: string }>;
        bodies.push(body);
        if (fail) throw new Error("offline");
        return Response.json([], { status: 201 });
      }),
    );

    researchLogger.log("landing_viewed");
    researchLogger.allowAnalytics();
    await waitFor(() => expect(bodies).toHaveLength(1));
    const originalId = bodies[0][0].event_id;
    await waitFor(() => expect(researchLogger.inspectQueueForTests().length).toBeGreaterThan(0));

    fail = false;
    await researchLogger.flush();
    expect(bodies[1].some((event) => event.event_id === originalId)).toBe(true);
  });

  it("filters phone numbers and typed prompts out of analytics properties", () => {
    researchLogger.log("routine_saved", {
      properties: {
        phone_number: "+15551234567",
        prompt_text: "private exact prompt",
        prompt_type: "typed",
      },
    });
    const properties = researchLogger.inspectQueueForTests()[0]
      .properties_json as Record<string, unknown>;
    expect(properties).toEqual({ prompt_type: "typed" });
  });
});
