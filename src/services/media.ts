import type { CameraPreference } from "../types";

export interface RecordingResult {
  blob: Blob;
  byteLength: number;
  mimeType: string;
}

export interface RecordingHandle {
  recorder: MediaRecorder;
  result: Promise<RecordingResult>;
  stop: () => void;
}

export class MediaCaptureError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MediaCaptureError";
  }
}

export function supportedRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

export async function requestCaptureStream(
  cameraPreference: CameraPreference,
  deviceId?: string,
): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new MediaCaptureError(
      "INSECURE_CONTEXT",
      "Camera and microphone access requires HTTPS or a trusted local development context.",
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MediaCaptureError(
      "MEDIA_API_UNAVAILABLE",
      "This browser does not provide the required camera and microphone API.",
    );
  }
  if (typeof MediaRecorder === "undefined") {
    throw new MediaCaptureError(
      "MEDIA_RECORDER_UNAVAILABLE",
      "This browser cannot create the required local recording.",
    );
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : {
            facingMode: { ideal: cameraPreference },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "UnknownError";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new MediaCaptureError(
        "PERMISSION_DENIED",
        "Camera or microphone permission was denied. Allow both permissions in the browser, then retry.",
      );
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new MediaCaptureError(
        "CAPTURE_DEVICE_NOT_FOUND",
        "A usable camera and microphone were not found on this device.",
      );
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      throw new MediaCaptureError(
        "CAPTURE_DEVICE_BUSY",
        "The camera or microphone is unavailable, possibly because another application is using it.",
      );
    }
    throw new MediaCaptureError(
      "CAPTURE_REQUEST_FAILED",
      "The camera and microphone could not be started.",
    );
  }
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

export function attachPreview(video: HTMLVideoElement, stream: MediaStream): void {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  void video.play();
}

export function stopMediaStream(stream?: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function detachPreview(video?: HTMLVideoElement | null): void {
  if (!video) return;
  video.pause();
  video.srcObject = null;
}

export function beginRecording(stream: MediaStream): RecordingHandle {
  if (typeof MediaRecorder === "undefined") {
    throw new MediaCaptureError(
      "MEDIA_RECORDER_UNAVAILABLE",
      "Recording is not supported in this browser.",
    );
  }
  if (stream.getAudioTracks().length === 0 || stream.getVideoTracks().length === 0) {
    throw new MediaCaptureError(
      "REQUIRED_TRACK_MISSING",
      "Both a camera track and a microphone track are required.",
    );
  }
  const mimeType = supportedRecordingMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  let settled = false;
  let resolveResult!: (value: RecordingResult) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<RecordingResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener("error", () => {
    if (settled) return;
    settled = true;
    rejectResult(
      new MediaCaptureError(
        "RECORDING_INTERRUPTED",
        "The browser reported that the recording was interrupted.",
      ),
    );
  });
  recorder.addEventListener("stop", () => {
    if (settled) return;
    settled = true;
    const type = recorder.mimeType || mimeType || "video/webm";
    const blob = new Blob(chunks, { type });
    if (blob.size === 0) {
      rejectResult(
        new MediaCaptureError(
          "EMPTY_RECORDING",
          "The recording ended without usable video data.",
        ),
      );
      return;
    }
    resolveResult({ blob, byteLength: blob.size, mimeType: type });
  });
  recorder.start(250);

  return {
    recorder,
    result,
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
}

export function createPlaybackUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokePlaybackUrl(url?: string): void {
  if (url) URL.revokeObjectURL(url);
}

export async function speakText(text: string): Promise<void> {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    throw new MediaCaptureError(
      "SPEECH_SYNTHESIS_UNAVAILABLE",
      "Spoken prompt playback is unavailable in this browser.",
    );
  }
  window.speechSynthesis.cancel();
  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("speech_playback_failed"));
    window.speechSynthesis.speak(utterance);
  });
}

export async function playAudioUrl(url: string): Promise<void> {
  const audio = new Audio(url);
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("recorded_prompt_playback_failed"));
    void audio.play().catch(reject);
  });
}

export async function playPrompt(options: {
  promptType: "typed" | "caregiver_voice";
  typedPrompt: string;
  voicePromptUrl?: string;
}): Promise<void> {
  if (options.promptType === "caregiver_voice" && options.voicePromptUrl) {
    await playAudioUrl(options.voicePromptUrl);
    return;
  }
  await speakText(options.typedPrompt);
}

export async function playGentleTone(): Promise<void> {
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.45);
    await new Promise((resolve) => setTimeout(resolve, 480));
  } finally {
    await context.close();
  }
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export async function requestScreenWakeLock(): Promise<WakeLockSentinelLike | null> {
  const wakeLock = (
    navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
    }
  ).wakeLock;
  if (!wakeLock) return null;
  try {
    return await wakeLock.request("screen");
  } catch {
    return null;
  }
}

