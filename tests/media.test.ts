import { describe, expect, it, vi } from "vitest";
import {
  beginRecording,
  createPlaybackUrl,
  MediaCaptureError,
  requestCaptureStream,
  revokePlaybackUrl,
  stopMediaStream,
} from "../src/services/media";

function mockStream(): MediaStream {
  const audioTrack = { kind: "audio", readyState: "live", stop: vi.fn() };
  const videoTrack = {
    kind: "video",
    readyState: "live",
    stop: vi.fn(),
    getSettings: () => ({}),
  };
  return {
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [videoTrack],
    getTracks: () => [audioTrack, videoTrack],
  } as unknown as MediaStream;
}

class MockMediaRecorder extends EventTarget {
  static emitData = true;
  static isTypeSupported = () => true;
  state: RecordingState = "inactive";
  mimeType = "video/webm";

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    if (options?.mimeType) this.mimeType = options.mimeType;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (MockMediaRecorder.emitData) {
      const dataEvent = new Event("dataavailable") as Event & { data: Blob };
      Object.defineProperty(dataEvent, "data", {
        value: new Blob(["recorded bytes"], { type: this.mimeType }),
      });
      this.dispatchEvent(dataEvent);
    }
    this.state = "inactive";
    this.dispatchEvent(new Event("stop"));
  }
}

describe("browser media service", () => {
  it("assembles a real Blob only after MediaRecorder stops", async () => {
    MockMediaRecorder.emitData = true;
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    const handle = beginRecording(mockStream());

    expect(handle.recorder.state).toBe("recording");
    handle.stop();
    const result = await handle.result;

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("rejects an empty recording instead of creating evidence available", async () => {
    MockMediaRecorder.emitData = false;
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    const handle = beginRecording(mockStream());
    handle.stop();

    await expect(handle.result).rejects.toMatchObject({ code: "EMPTY_RECORDING" });
  });

  it("classifies a combined camera and microphone permission denial", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
      },
    });
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);

    await expect(requestCaptureStream("environment")).rejects.toEqual(
      expect.objectContaining<Partial<MediaCaptureError>>({ code: "PERMISSION_DENIED" }),
    );
  });

  it("stops all tracks and revokes object URLs", () => {
    const stream = mockStream();
    const create = vi.fn(() => "blob:local-evidence");
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });

    const url = createPlaybackUrl(new Blob(["video"]));
    stopMediaStream(stream);
    revokePlaybackUrl(url);

    expect(stream.getTracks().every((track) => vi.mocked(track.stop).mock.calls.length === 1)).toBe(
      true,
    );
    expect(revoke).toHaveBeenCalledWith("blob:local-evidence");
  });
});

