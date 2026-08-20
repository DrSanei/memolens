"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CircleAlert,
  Clock3,
  FlipHorizontal2,
  Frame,
  Mic,
  ShieldCheck,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMemolens } from "../../state/context";
import {
  attachPreview,
  detachPreview,
  listVideoInputs,
  MediaCaptureError,
  playPrompt,
  requestCaptureStream,
  stopMediaStream,
} from "../../services/media";
import { researchLogger } from "../../services/researchLogger";

interface PreflightProps {
  onStreamChange: (stream: MediaStream | null) => void;
  onContinue: () => void;
  onCancel: () => void;
}

type PermissionResult = "granted" | "denied" | "unknown";

async function queryPermission(name: "camera" | "microphone"): Promise<PermissionResult> {
  if (!navigator.permissions?.query) return "unknown";
  try {
    const result = await navigator.permissions.query(
      { name } as unknown as PermissionDescriptor,
    );
    return result.state === "granted" || result.state === "denied" ? result.state : "unknown";
  } catch {
    return "unknown";
  }
}

function CheckRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: boolean;
  detail?: string;
}) {
  return (
    <li className={value ? "preflight-check passed" : "preflight-check failed"}>
      <span aria-hidden="true">{value ? <Check size={16} /> : <X size={16} />}</span>
      <div>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </li>
  );
}

export function Preflight({ onStreamChange, onContinue, onCancel }: PreflightProps) {
  const { state, dispatch, activeRoutine } = useMemolens();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handedOffRef = useRef(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [testingPrompt, setTestingPrompt] = useState(false);
  const [showFrameGuide, setShowFrameGuide] = useState(false);

  useEffect(() => {
    dispatch({
      type: "SET_PREFLIGHT",
      changes: {
        secureContext: window.isSecureContext,
        mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
        mediaRecorder: typeof MediaRecorder !== "undefined",
        speechSynthesis: "speechSynthesis" in window,
        visibility: document.visibilityState === "visible" ? "visible" : "hidden",
      },
    });
    const onVisibility = () =>
      dispatch({
        type: "SET_PREFLIGHT",
        changes: { visibility: document.visibilityState === "visible" ? "visible" : "hidden" },
      });
    document.addEventListener("visibilitychange", onVisibility);
    const previewNode = videoRef.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      detachPreview(previewNode);
      if (!handedOffRef.current) {
        stopMediaStream(streamRef.current);
        onStreamChange(null);
      }
    };
  }, [dispatch, onStreamChange]);

  const connectStream = async (deviceId?: string) => {
    setRequesting(true);
    setStreamReady(false);
    dispatch({
      type: "SET_PREFLIGHT",
      changes: { errorCode: undefined, errorMessage: undefined, previewReady: false },
    });
    try {
      const stream = await requestCaptureStream(activeRoutine.cameraPreference, deviceId);
      stopMediaStream(streamRef.current);
      streamRef.current = stream;
      setStreamReady(true);
      onStreamChange(stream);
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (!videoTrack || !audioTrack) throw new Error("required_track_missing");
      if (videoRef.current) attachPreview(videoRef.current, stream);
      const inputs = await listVideoInputs();
      setDevices(inputs);
      const activeIndex = inputs.findIndex((device) => device.deviceId === videoTrack.getSettings().deviceId);
      if (activeIndex >= 0) setDeviceIndex(activeIndex);
      dispatch({
        type: "SET_PREFLIGHT",
        changes: {
          cameraPermission: "granted",
          microphonePermission: "granted",
          selectedCameraLabel: videoTrack.label || "Selected camera",
          selectedDeviceId: videoTrack.getSettings().deviceId,
          errorCode: undefined,
          errorMessage: undefined,
        },
      });
      researchLogger.log("camera_permission_granted", {
        roleMode: "caregiver",
        workflowStep: "preflight",
      });
      researchLogger.log("microphone_permission_granted", {
        roleMode: "caregiver",
        workflowStep: "preflight",
      });
    } catch (error) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      setStreamReady(false);
      onStreamChange(null);
      const cameraPermission = await queryPermission("camera");
      const microphonePermission = await queryPermission("microphone");
      const captureError =
        error instanceof MediaCaptureError
          ? error
          : new MediaCaptureError(
              "CAPTURE_REQUEST_FAILED",
              "The camera and microphone could not be prepared.",
            );
      dispatch({
        type: "SET_PREFLIGHT",
        changes: {
          cameraPermission,
          microphonePermission,
          previewReady: false,
          errorCode: captureError.code,
          errorMessage: captureError.message,
        },
      });
      if (cameraPermission === "denied" || captureError.code === "PERMISSION_DENIED") {
        researchLogger.log("camera_permission_denied", {
          roleMode: "caregiver",
          workflowStep: "preflight",
          properties: { technical_error_code: captureError.code },
        });
      }
      if (microphonePermission === "denied" || captureError.code === "PERMISSION_DENIED") {
        researchLogger.log("microphone_permission_denied", {
          roleMode: "caregiver",
          workflowStep: "preflight",
          properties: { technical_error_code: captureError.code },
        });
      }
    } finally {
      setRequesting(false);
    }
  };

  const switchCamera = async () => {
    if (devices.length < 2) return;
    const nextIndex = (deviceIndex + 1) % devices.length;
    setDeviceIndex(nextIndex);
    await connectStream(devices[nextIndex].deviceId);
  };

  const testPrompt = async () => {
    setTestingPrompt(true);
    try {
      await playPrompt(activeRoutine);
      dispatch({ type: "SET_PREFLIGHT", changes: { promptPlayback: "passed" } });
      researchLogger.log("prompt_previewed", {
        roleMode: "caregiver",
        workflowStep: "preflight",
        properties: {
          prompt_type: activeRoutine.promptType,
          prompt_character_count: activeRoutine.typedPrompt.length,
          preview_played: true,
        },
      });
    } catch {
      dispatch({
        type: "SET_PREFLIGHT",
        changes: {
          promptPlayback: "failed",
          errorCode: "PROMPT_PLAYBACK_FAILED",
          errorMessage: "Reminder playback failed. Check device volume and browser audio support.",
        },
      });
    } finally {
      setTestingPrompt(false);
    }
  };

  const ready =
    state.preflight.secureContext &&
    state.preflight.mediaDevices &&
    state.preflight.mediaRecorder &&
    state.preflight.speechSynthesis &&
    state.preflight.cameraPermission === "granted" &&
    state.preflight.microphonePermission === "granted" &&
    state.preflight.previewReady &&
    state.preflight.promptPlayback === "passed" &&
    state.preflight.visibility === "visible" &&
    streamReady;

  const continueAndArm = () => {
    if (!ready) return;
    handedOffRef.current = true;
    detachPreview(videoRef.current);
    onContinue();
  };

  const cancel = () => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setStreamReady(false);
    onStreamChange(null);
    onCancel();
  };

  return (
    <section className="workflow-card preflight-card" aria-labelledby="preflight-title">
      <div className="workflow-heading-row">
        <div>
          <p className="eyebrow">Caregiver mode · Step 2 of 2</p>
          <h1 id="preflight-title">Quick device check</h1>
          <p className="lead-copy">
            Check the camera, microphone, and reminder before starting the care recipient experience.
          </p>
        </div>
        <span className={ready ? "readiness-badge ready" : "readiness-badge"}>
          {ready ? <Check size={17} /> : <CircleAlert size={17} />}
          {ready ? "Ready to start" : "Checks required"}
        </span>
      </div>

      <div className="preflight-layout">
        <div className="preview-panel">
          <div className={showFrameGuide ? "preview-frame show-guide" : "preview-frame"}>
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Muted camera framing preview"
              onCanPlay={() =>
                dispatch({ type: "SET_PREFLIGHT", changes: { previewReady: true } })
              }
            />
            {!state.preflight.previewReady ? (
              <div className="preview-placeholder">
                <Camera size={34} />
                <span>Camera preview appears here</span>
              </div>
            ) : null}
            {showFrameGuide ? <div className="frame-guide" aria-hidden="true" /> : null}
          </div>
          <p className="selected-camera">
            <Camera size={16} /> {state.preflight.selectedCameraLabel}
          </p>
          <div className="preview-actions">
            <button
              className="button button-primary button-small"
              type="button"
              onClick={() => connectStream()}
              disabled={requesting}
            >
              <ShieldCheck size={17} />
              {requesting ? "Requesting access…" : "Allow camera and microphone"}
            </button>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={switchCamera}
              disabled={devices.length < 2 || requesting}
            >
              <FlipHorizontal2 size={17} /> Switch camera
            </button>
            <button
              className="button button-ghost button-small"
              type="button"
              onClick={() => {
                setShowFrameGuide((value) => !value);
                videoRef.current?.focus();
              }}
              disabled={!state.preflight.previewReady}
            >
              <Frame size={17} /> Reframe camera
            </button>
          </div>
        </div>

        <div className="preflight-checks-panel">
          <h2>Device checks</h2>
          <ul className="preflight-check-list">
            <CheckRow label="Secure connection" value={state.preflight.secureContext} detail="HTTPS or trusted local context" />
            <CheckRow label="Camera available" value={state.preflight.mediaDevices} />
            <CheckRow label="Microphone available" value={state.preflight.mediaDevices} />
            <CheckRow label="Memo recording available" value={state.preflight.mediaRecorder} />
            <CheckRow label="Camera permission" value={state.preflight.cameraPermission === "granted"} />
            <CheckRow label="Microphone permission" value={state.preflight.microphonePermission === "granted"} />
            <CheckRow label="Camera preview" value={state.preflight.previewReady} />
            <CheckRow label="Reminder playback" value={state.preflight.promptPlayback === "passed"} />
            <CheckRow label="App ready" value={state.preflight.visibility === "visible"} />
          </ul>
          <div className="preflight-summary">
            <span>
              <Mic size={16} /> Camera and microphone requested together
            </span>
            <span>
              <Clock3 size={16} /> Maximum {activeRoutine.maxDurationSeconds}s
            </span>
          </div>
          <button
            className="button button-secondary button-full"
            type="button"
            onClick={testPrompt}
            disabled={testingPrompt}
          >
            <Volume2 size={18} /> {testingPrompt ? "Playing reminder…" : "Test reminder"}
          </button>
        </div>
      </div>

      {state.preflight.errorMessage ? (
        <div className="technical-error" role="alert">
          <CircleAlert size={20} />
          <div>
            <strong>{state.preflight.errorCode}</strong>
            <p>{state.preflight.errorMessage}</p>
          </div>
        </div>
      ) : null}

      <p className="notice-soft">
        Memo audio and video stay on this device during the test. They are never uploaded to the research Supabase, an Edge Function, or another network destination.
      </p>

      <div className="split-actions">
        <button className="button button-ghost" type="button" onClick={cancel}>
          <ArrowLeft size={18} /> Cancel
        </button>
        <button
          className="button button-primary"
          type="button"
          onClick={continueAndArm}
          disabled={!ready}
        >
          Start experience <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}
