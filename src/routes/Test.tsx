import { ArrowLeft, CircleAlert, FlaskConical, LockKeyhole } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import { CaregiverReview } from "../components/test/CaregiverReview";
import { CaregiverSetup } from "../components/test/CaregiverSetup";
import { Preflight } from "../components/test/Preflight";
import { TestConsentGate } from "../components/test/TestConsentGate";
import { WearerExperience } from "../components/test/WearerExperience";
import { PRODUCT_BOUNDARY } from "../constants";
import { useMemolens } from "../state/context";
import { revokePlaybackUrl, stopMediaStream, type RecordingHandle } from "../services/media";
import { researchLogger } from "../services/researchLogger";
import type { MedicationEvent } from "../types";

export function TestPage() {
  const { state, dispatch } = useMemolens();
  const [captureStream, setCaptureStreamState] = useState<MediaStream | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<RecordingHandle | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    researchLogger.logViewOnce("test-route:/test", "test_route_viewed", {
      roleMode: state.role,
      workflowStep: state.workflow,
    });
  }, [state.role, state.workflow]);

  useEffect(
    () =>
      researchLogger.onFailure(() => {
        dispatch({ type: "SET_LOGGING_UNAVAILABLE", value: true });
      }),
    [dispatch],
  );

  const setCaptureStream = useCallback((stream: MediaStream | null) => {
    captureStreamRef.current = stream;
    setCaptureStreamState(stream);
  }, []);

  useEffect(
    () => () => {
      recorderRef.current?.stop();
      stopMediaStream(captureStreamRef.current);
      stateRef.current.events.forEach((event) => revokePlaybackUrl(event.objectUrl));
      stateRef.current.routines.forEach((routine) => revokePlaybackUrl(routine.voicePromptUrl));
      dispatch({ type: "CLEAR_SESSION" });
    },
    [dispatch],
  );

  const prepareIntent = () => {
    dispatch({ type: "RESET_PREFLIGHT" });
  };

  const armTest = () => {
    const now = new Date().toISOString();
    const nowMs = new Date(now).getTime();
    dispatch({ type: "SET_TIMING", changes: { armedAt: now } });
    dispatch({ type: "SET_WORKFLOW", step: "armed" });
    dispatch({ type: "SET_ROLE", role: "wearer" });
    researchLogger.log("test_armed", {
      roleMode: "caregiver",
      workflowStep: "armed",
      source: state.testIntent,
      properties: {
        scheduled_offset_seconds:
          state.testIntent === "run_now"
            ? 5
            : Math.max(0, Math.round((scheduledTimeMs() - nowMs) / 1000)),
      },
    });
    if (state.testIntent === "run_now") {
      researchLogger.log("run_test_now_started", {
        roleMode: "caregiver",
        workflowStep: "armed",
        properties: { countdown_seconds: 5 },
      });
    }
    researchLogger.log("wearer_mode_entered", {
      roleMode: "wearer",
      workflowStep: "armed",
      source: "automatic_after_arm",
    });
    researchLogger.logViewOnce(
      `wearer-ready:${state.activeRoutineId}`,
      "wearer_ready_viewed",
      { roleMode: "wearer", workflowStep: "armed" },
    );
  };

  const scheduledTimeMs = () => {
    const routine = state.routines.find((item) => item.id === state.activeRoutineId);
    if (!routine) return Date.now();
    const [hours, minutes] = routine.scheduledTime.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
  };

  const cancelPreflight = () => {
    recorderRef.current?.stop();
    stopMediaStream(captureStream);
    setCaptureStream(null);
    dispatch({ type: "RESET_PREFLIGHT" });
    dispatch({ type: "SET_WORKFLOW", step: "caregiver_setup" });
  };

  const switchRole = (role: "caregiver" | "wearer") => {
    if (role === state.role) return;
    if (role === "caregiver" && !state.activeEventId) return;
    dispatch({ type: "SET_ROLE", role });
    if (role === "caregiver") {
      dispatch({ type: "SET_WORKFLOW", step: "caregiver_inbox" });
      researchLogger.log("caregiver_mode_entered", {
        roleMode: "caregiver",
        workflowStep: "caregiver_inbox",
        source: "device_handoff",
      });
    } else {
      researchLogger.log("wearer_mode_entered", {
        roleMode: "wearer",
        workflowStep: state.workflow,
        source: "caregiver_role_control",
      });
    }
  };

  const deleteEvent = (event: MedicationEvent) => {
    const confirmed = window.confirm(
      "Delete this local recording and event media? The in-memory Blob and playback link will be removed. Structured research metrics already confirmed by Supabase cannot be retracted here.",
    );
    if (!confirmed) return;
    recorderRef.current?.stop();
    stopMediaStream(captureStream);
    setCaptureStream(null);
    revokePlaybackUrl(event.objectUrl);
    dispatch({ type: "DELETE_EVENT", id: event.id });
    dispatch({ type: "SET_WORKFLOW", step: "caregiver_inbox" });
    researchLogger.log("recording_deleted", {
      roleMode: "caregiver",
      workflowStep: "caregiver_inbox",
      properties: { local_media_removed: true },
    });
  };

  const clearSession = () => {
    const confirmed = window.confirm(
      "Clear this session? All in-memory video, audio, playback links, routines, notes, and current UI state will be removed.",
    );
    if (!confirmed) return;
    recorderRef.current?.stop();
    recorderRef.current = null;
    stopMediaStream(captureStream);
    setCaptureStream(null);
    state.events.forEach((event) => revokePlaybackUrl(event.objectUrl));
    state.routines.forEach((routine) => revokePlaybackUrl(routine.voicePromptUrl));
    researchLogger.log("session_cleared", {
      roleMode: "caregiver",
      workflowStep: state.workflow,
      properties: { local_media_removed: true },
    });
    dispatch({ type: "CLEAR_SESSION" });
  };

  const wearerEligible = [
    "armed",
    "capture_starting",
    "recording",
    "processing",
    "evidence_available",
    "caregiver_inbox",
  ].includes(state.workflow);

  const statusMessage = (() => {
    if (state.workflow === "recording") return "Recording is active.";
    if (state.workflow === "processing") return "The local recording is being prepared.";
    if (state.workflow === "evidence_available") return "Video is available for caregiver review.";
    if (state.workflow === "acknowledged_closed") return "The caregiver closed the event.";
    return `Current workflow step: ${state.workflow.replaceAll("_", " ")}.`;
  })();

  return (
    <div className={state.role === "wearer" ? "test-shell wearer-mode-shell" : "test-shell"}>
      <header className="test-header">
        <div className="test-header-inner">
          <Brand />
          <div className="role-control-wrap">
            <span className="role-label">Single-device prototype</span>
            <div className="role-segment" role="group" aria-label="Prototype role mode">
              <button
                type="button"
                className={state.role === "caregiver" ? "active" : ""}
                aria-pressed={state.role === "caregiver"}
                disabled={state.role === "wearer" && !state.activeEventId}
                onClick={() => switchRole("caregiver")}
              >
                Caregiver
              </button>
              <button
                type="button"
                className={state.role === "wearer" ? "active" : ""}
                aria-pressed={state.role === "wearer"}
                disabled={!wearerEligible}
                onClick={() => switchRole("wearer")}
              >
                Wearer
              </button>
            </div>
          </div>
          <Link className="exit-test-link" to="/">
            <ArrowLeft size={17} /> Exit test
          </Link>
        </div>
      </header>

      <div className="prototype-strip" role="note">
        <FlaskConical size={17} aria-hidden="true" />
        <span>{PRODUCT_BOUNDARY}</span>
      </div>

      {state.loggingUnavailable && state.role === "caregiver" ? (
        <div className="logging-warning" role="alert">
          <CircleAlert size={18} />
          Research logging is unavailable or unconfirmed. Testing and local recording remain
          functional; retry research submission from caregiver review.
        </div>
      ) : null}

      <main className="test-main">
        {state.workflow === "consent" ? <TestConsentGate /> : null}
        {state.workflow === "caregiver_setup" && state.role === "caregiver" ? (
          <CaregiverSetup onPrepare={prepareIntent} />
        ) : null}
        {state.workflow === "preflight" && state.role === "caregiver" ? (
          <Preflight
            onStreamChange={setCaptureStream}
            onContinue={armTest}
            onCancel={cancelPreflight}
          />
        ) : null}
        {state.role === "wearer" && wearerEligible ? (
          <WearerExperience
            stream={captureStream}
            recorderRef={recorderRef}
            onStreamChange={setCaptureStream}
          />
        ) : null}
        {state.role === "caregiver" &&
        !["consent", "caregiver_setup", "preflight"].includes(state.workflow) ? (
          <CaregiverReview onDeleteEvent={deleteEvent} onClearSession={clearSession} />
        ) : null}
      </main>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>
      <footer className="test-footer">
        <LockKeyhole size={15} /> Media exists only in this tab’s memory and is erased on
        refresh or close.
      </footer>
    </div>
  );
}
