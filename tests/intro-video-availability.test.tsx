import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemolensApp } from "../src/App";
import { researchLogger } from "../src/services/researchLogger";

describe("intro video and availability request", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    researchLogger.resetForTests();
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  it("places a poster-backed player before How It Works and keeps contact consent separate", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return Response.json([], { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<MemolensApp />);
    const player = container.querySelector(".intro-video-player") as HTMLVideoElement;
    expect(player).toHaveAttribute("preload", "none");
    expect(player).toHaveAttribute("poster", "/video/memolenz-intro-poster.webp");
    expect(player).toHaveAttribute("controls");
    expect(player.closest("section")?.nextElementSibling).toHaveAttribute("id", "how-it-works");

    fireEvent.click(screen.getByRole("button", { name: "Continue without analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Notify Me When Available" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "LaunchCon Test" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "caregiver@example.com" } });
    vi.mocked(Date.now).mockReturnValue(1_003_000);
    fireEvent.click(screen.getByRole("button", { name: /^Notify Me$/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please agree to be contacted");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/I agree that the Memolenz team may store my contact details/));
    fireEvent.click(screen.getByRole("button", { name: /^Notify Me$/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const rows = JSON.parse(String(request.body)) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      email: "caregiver@example.com",
      phone_number: null,
      phone_country_code: null,
      source_cta: "intro_video_notify",
      contact_consent: true,
    });
    expect(researchLogger.inspectQueueForTests()).toHaveLength(0);
    expect(await screen.findByText("Thank you for your interest.")).toBeVisible();
  });
});
