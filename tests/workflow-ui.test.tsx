import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemolensApp } from "../src/App";
import { researchLogger } from "../src/services/researchLogger";

class SupportedMediaRecorder extends EventTarget {
  static isTypeSupported = () => true;
  state: RecordingState = "inactive";
  mimeType = "video/webm";
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.dispatchEvent(new Event("stop"));
  }
}

describe("test workflow UI", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/test");
    researchLogger.resetForTests();
  });

  it("moves from consent to caregiver setup without requesting media", () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    render(<MemolensApp />);

    [
      /I have permission from everyone/i,
      /I will use an empty pillbox/i,
      /I understand the recording stays/i,
      /I understand Memolens does not verify/i,
    ].forEach((label) => fireEvent.click(screen.getByLabelText(label)));
    fireEvent.click(screen.getByRole("button", { name: /Continue to caregiver setup/i }));

    expect(screen.getByRole("heading", { name: "Prepare a safe test routine" })).toBeVisible();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("surfaces permission denial and does not create a success state", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([]) },
    });
    vi.stubGlobal("MediaRecorder", SupportedMediaRecorder);
    render(<MemolensApp />);

    [
      /I have permission from everyone/i,
      /I will use an empty pillbox/i,
      /I understand the recording stays/i,
      /I understand Memolens does not verify/i,
    ].forEach((label) => fireEvent.click(screen.getByLabelText(label)));
    fireEvent.click(screen.getByRole("button", { name: /Continue to caregiver setup/i }));
    fireEvent.click(screen.getByRole("button", { name: /Run Test Now/i }));
    fireEvent.click(screen.getByRole("button", { name: /Allow camera and microphone/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("PERMISSION_DENIED"));
    expect(screen.getByRole("button", { name: /Start experience/i })).toBeDisabled();
    expect(screen.queryByText("Memo ready")).not.toBeInTheDocument();
  });
});
