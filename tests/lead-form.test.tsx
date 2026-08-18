import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemolensApp } from "../src/App";
import { researchLogger } from "../src/services/researchLogger";

function openAndFillForm() {
  fireEvent.click(screen.getByRole("button", { name: "Continue without analytics" }));
  fireEvent.click(document.getElementById("hero_preorder") as HTMLButtonElement);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "LaunchCon Test" } });
  fireEvent.change(screen.getByLabelText("Country code"), { target: { value: "+46" } });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "070 123 45 67" } });
  fireEvent.click(screen.getByLabelText(/I agree that the Memolens team may store/i));
}

describe("contact-interest acknowledgement behavior", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    researchLogger.resetForTests();
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-08-16T12:00:00.000Z").getTime(),
    );
  });

  it("does not show success until Supabase confirms acknowledgement", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        void _input;
        void _init;
        return new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<MemolensApp />);
    openAndFillForm();
    vi.mocked(Date.now).mockReturnValue(
      new Date("2026-08-16T12:00:03.000Z").getTime(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit interest" }));
    expect(screen.getByRole("button", { name: /Awaiting confirmation/ })).toBeDisabled();
    expect(screen.queryByText("Thank you for your interest.")).not.toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const rows = JSON.parse(String(request.body)) as Array<{
      phone_number: string;
    }>;
    expect(rows[0].phone_number).toBe("0701234567");
    resolveRequest(Response.json([], { status: 201 }));
    await waitFor(() => expect(screen.getByText("Thank you for your interest.")).toBeVisible());
  });

  it("requires contact consent and shows a retryable failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { code: "PGRST500", message: "write unavailable" },
          { status: 500 },
        ),
      ),
    );
    render(<MemolensApp />);
    fireEvent.click(screen.getByRole("button", { name: "Continue without analytics" }));
    fireEvent.click(document.getElementById("hero_preorder") as HTMLButtonElement);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "LaunchCon Test" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "5551234567" } });
    vi.mocked(Date.now).mockReturnValue(
      new Date("2026-08-16T12:00:03.000Z").getTime(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit interest" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Contact consent is required");

    fireEvent.click(screen.getByLabelText(/I agree that the Memolens team may store/i));
    fireEvent.click(screen.getByRole("button", { name: "Submit interest" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry submission" })).toBeVisible());
    expect(screen.getByRole("alert")).toHaveTextContent("could not confirm");
  });
});
