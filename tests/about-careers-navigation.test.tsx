import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemolensApp } from "../src/App";
import { researchLogger } from "../src/services/researchLogger";

describe("About and Careers navigation", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    researchLogger.resetForTests();
  });

  it("opens the mobile menu and reaches the About Us page and Careers CTA", () => {
    render(<MemolensApp />);
    expect(document.querySelector(".mobile-about-link")).toHaveAttribute("href", "/about");
    const toggle = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(toggle);
    const menu = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(menu).getByRole("link", { name: "Careers" })).toHaveAttribute("href", "/careers");
    fireEvent.click(within(menu).getByRole("link", { name: "About Us" }));
    expect(screen.getByRole("heading", { name: "Meet the founders." })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Ladan Kian" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Dr. Mohamad Sanei" })).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: /Invest Time or Money in Memolenz/ }));
    expect(screen.getByRole("heading", { name: "Help us make care feel more connected." })).toBeVisible();
    expect(window.location.pathname).toBe("/careers");
  });

  it("records a Careers interest only after consent and server acknowledgement", async () => {
    window.history.replaceState({}, "", "/careers");
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return Response.json([], { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MemolensApp />);

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Test Visitor" } });
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "555 234 5678" } });
    fireEvent.change(screen.getByLabelText(/I'm interested as a/), { target: { value: "Doctor or clinician" } });
    vi.mocked(Date.now).mockReturnValue(1_003_000);
    fireEvent.click(screen.getByRole("button", { name: "Get in touch" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please agree to be contacted");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/I agree that Memolenz may store my name/));
    fireEvent.click(screen.getByRole("button", { name: "Get in touch" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const rows = JSON.parse(String(request.body)) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      name: "Test Visitor",
      phone_country_code: "+1",
      phone_number: "5552345678",
      role_interest: "Doctor or clinician",
      source_cta: "careers_interest",
      contact_consent: true,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("We have your details and will contact you soon.");
    expect(researchLogger.inspectQueueForTests()).toHaveLength(0);
  });

  it("keeps the Careers form retryable if saving fails", async () => {
    window.history.replaceState({}, "", "/careers");
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Unavailable" }, { status: 503 })));
    render(<MemolensApp />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Test Visitor" } });
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "5552345678" } });
    fireEvent.change(screen.getByLabelText(/I'm interested as a/), { target: { value: "Investor or partner" } });
    fireEvent.click(screen.getByLabelText(/I agree that Memolenz may store my name/));
    vi.mocked(Date.now).mockReturnValue(1_003_000);
    fireEvent.click(screen.getByRole("button", { name: "Get in touch" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not save your details");
    expect(screen.queryByText("Thank you for reaching out.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get in touch" })).toBeEnabled();
  });
});
