"use client";

import { Check, CircleAlert, CircleStop, LockKeyhole, Radio, ShieldCheck } from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useMemolens } from "../../state/context";
import { MemolensMark } from "../MemolensMark";
import {
  beginRecording,
  createPlaybackUrl,
  MediaCaptureError,
  playGentleTone,
  playPrompt,
  requestScreenWakeLock,
  speakText,
  stopMediaStream,
  type RecordingHandle,
} from "../../services/media";
import { researchLogger } from "../../services/researchLogger";
import type { CaptureStatus, MedicationEvent } from "../../types";

interface WearerExperienceProps {
  stream: MediaStream | null;
  recorderRef: RefObject<RecordingHandle | null>;
  onStreamChange: (stream: MediaStream | null) => void;
}

function scheduledDate(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function WearerExperience({
  stream,
  recorderRef,
  onStreamChange,
}: WearerExperienceProps) {
  const { state, dispatch, activeRoutine, activeEvent } = useMemolens();
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [liveAnnouncement, setLiveAnnouncement] = useState("Memolens is ready");
  const startedRef = useRef(false);
  const recordingStartedAtRef = useRef<string | undefined>(undefined);
  const privacyStopRef = useRef(false);
  const interruptionCodeRef = useRef<string | undefined>(undefined);
  const promptDeliveredRef = useRef(false);
  const promptErrorRef = useRef<string | undefined>(undefined);
  const repeatCountRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const repeatTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const wakeLockRef = useRef<{ release(): Promise<void> } | null>(null);
  const finishingRef = useRef(false);
  const [targetTime] = useState(() =>
    state.testIntent === "run_now"
      ? new Date(Date.now() + 5000)
      : scheduledDate(activeRoutine.scheduledTime),
  );

  const clearTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    repeatTimersRef.current.forEach((timer) => clearTimeout(timer));
    repeatTimersRef.current = [];
  }, []);

  const createFailureEvent = useCallback(
    (code: string, status: CaptureStatus = "capture_unavailable") => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      clearTimers();
      const now = new Date().toISOString();
      const event: MedicationEvent = {
        id: crypto.randomUUID(),
        routineId: activeRoutine.id,
        routineLabel: activeRoutine.label,
        scheduledAt: targetTime.toISOString(),
        startedAt: recordingStartedAtRef.current ?? now,
        endedAt: now,
        durationSeconds: recordingStartedAtRef.current
          ? Math.max(0, (Date.now() - new Date(recordingStartedAtRef.current).getTime()) / 1000)
          : 0,
        blobBytes: 0,
        promptDelivered: promptDeliveredRef.current,
        promptRepeatCount: repeatCountRef.current,
        captureStatus: status,
        technicalErrors: [code],
        caregiverNote: "",
        videoReviewStatus: "not_reviewed",
        privacyStop: privacyStopRef.current,
        closed: false,
      };
      stopMediaStream(stream);
      onStreamChange(null);
      dispatch({ type: "ADD_EVENT", event });
      dispatch({ type: "SET_TIMING", changes: { recordingEndedAt: now } });
      dispatch({ type: "SET_WORKFLOW", step: "caregiver_inbox" });
      setLiveAnnouncement("Capture could not be completed. Please hand the device to your caregiver.");
      researchLogger.log("recording_failed", {
        roleMode: "wearer",
        workflowStep: "processing",
        properties: {
          technical_error_code: code,
          recording_status: status,
          prompt_delivery_success: promptDeliveredRef.current,
          repeat_count: repeatCountRef.current,
        },
      });
    }, [activeRoutine.id, activeRoutine.label, clearTimers, dispatch, onStreamChange, stream, targetTime],
  );

  const finalizeRecording = useCallback(
    async (handle: RecordingHandle) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      clearTimers();
      dispatch({ type: "SET_WORKFLOW", step: "processing" });
      setLiveAnnouncement("Preparing the recorded medication-event evidence…");
      const endedAt = new Date().toISOString();
      try {
        const result = await handle.result;
        const startedAt = recordingStartedAtRef.current ?? endedAt;
        const durationSeconds = Math.max(
          0,
          (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
        );
        const technicalErrors = [
          ...(interruptionCodeRef.current ? [interruptionCodeRef.current] : []),
          ...(promptErrorRef.current ? [promptErrorRef.current] : []),
        ];
        const captureStatus: CaptureStatus = privacyStopRef.current
          ? "stopped_by_wearer"
          : interruptionCodeRef.current
            ? "capture_incomplete"
            : "evidence_available";
        const event: MedicationEvent = {
          id: crypto.randomUUID(),
          routineId: activeRoutine.id,
          routineLabel: activeRoutine.label,
          scheduledAt: targetTime.toISOString(),
          startedAt,
          endedAt,
          durationSeconds,
          blobBytes: result.byteLength,
          blob: result.blob,
          objectUrl: createPlaybackUrl(result.blob),
          promptDelivered: promptDeliveredRef.current,
          promptRepeatCount: repeatCountRef.current,
          captureStatus,
          technicalErrors,
          caregiverNote: "",
          videoReviewStatus: "not_reviewed",
          privacyStop: privacyStopRef.current,
          closed: false,
        };
        stopMediaStream(stream);
        onStreamChange(null);
        dispatch({ type: "ADD_EVENT", event });
        dispatch({ type: "SET_TIMING", changes: { recordingEndedAt: endedAt } });
        dispatch({
          type: "SET_WORKFLOW",
          step: captureStatus === "evidence_available" ? "evidence_available" : "caregiver_inbox",
        });
        if (captureStatus === "evidence_available" || captureStatus === "stopped_by_wearer") {
          researchLogger.log("recording_completed", {
            roleMode: "wearer",
            workflowStep: "processing",
            elapsedMs: Math.round(durationSeconds * 1000),
            properties: {
              recording_status: captureStatus,
              recording_duration_seconds: Math.round(durationSeconds),
              recording_blob_bytes: result.byteLength,
              prompt_delivery_success: promptDeliveredRef.current,
              repeat_count: repeatCountRef.current,
              privacy_stop: privacyStopRef.current,
            },
          });
        } else {
          researchLogger.log("recording_failed", {
            roleMode: "wearer",
            workflowStep: "processing",
            properties: {
              recording_status: captureStatus,
              technical_error_code: interruptionCodeRef.current ?? "RECORDING_INTERRUPTED",
              recording_blob_bytes: result.byteLength,
            },
          });
        }
        setLiveAnnouncement(
          privacyStopRef.current
            ? "Recording stopped. Your caregiver can review what was captured."
            : "You’re all set. Your caregiver can review the update.",
        );
        void speakText(
          "The recording is complete and your caregiver can review the update.",
        ).catch(() => undefined);
      } catch (error) {
        finishingRef.current = false;
        const code = error instanceof MediaCaptureError ? error.code : "RECORDING_INTERRUPTED";
        createFailureEvent(code, code === "EMPTY_RECORDING" ? "capture_incomplete" : "capture_unavailable");
      } finally {
        recorderRef.current = null;
        void wakeLockRef.current?.release().catch(() => undefined);
      }
    }, [
      activeRoutine.id,
      activeRoutine.label,
      clearTimers,
      createFailureEvent,
      dispatch,
      onStreamChange,
      recorderRef,
      stream,
      targetTime,
    ],
  );

  const stopRecording = useCallback(
    (reason: "automatic" | "privacy" | "hidden") => {
      const handle = recorderRef.current;
      if (!handle) return;
      if (reason === "privacy") {
        privacyStopRef.current = true;
        researchLogger.log("privacy_stop_used", {
          roleMode: "wearer",
          workflowStep: "recording",
          elapsedMs: elapsedSeconds * 1000,
        });
      }
      if (reason === "hidden") interruptionCodeRef.current = "TAB_HIDDEN_RECORDING";
      handle.stop();
      void finalizeRecording(handle);
    }, [elapsedSeconds, finalizeRecording, recorderRef],
  );

  const scheduleRepeats = useCallback(() => {
    repeatTimersRef.current.forEach((timer) => clearTimeout(timer));
    repeatTimersRef.current = [];
    for (let repeatNumber = 1; repeatNumber <= activeRoutine.maxRepeats; repeatNumber += 1) {
      const timer = setTimeout(async () => {
        repeatCountRef.current = repeatNumber;
        let success = true;
        try {
          await playPrompt(activeRoutine);
        } catch {
          success = false;
          promptErrorRef.current = "PROMPT_REPEAT_FAILED";
        }
        researchLogger.log("prompt_repeated", {
          roleMode: "wearer",
          workflowStep: "recording",
          properties: {
            prompt_type: activeRoutine.promptType,
            prompt_delivery_success: success,
            repeat_count: repeatNumber,
          },
        });
      }, activeRoutine.repeatDelaySeconds * 1000 * repeatNumber);
      repeatTimersRef.current.push(timer);
    }
  }, [activeRoutine]);

  const startCapture = useCallback(async () => {
    if (startedRef.current || finishingRef.current) return;
    startedRef.current = true;
    if (document.visibilityState !== "visible") {
      createFailureEvent("TAB_HIDDEN_ARMED", "capture_unavailable");
      return;
    }
    if (
      !stream ||
      stream.getAudioTracks().every((track) => track.readyState !== "live") ||
      stream.getVideoTracks().every((track) => track.readyState !== "live")
    ) {
      createFailureEvent("CAPTURE_STREAM_UNAVAILABLE", "capture_unavailable");
      return;
    }
    dispatch({ type: "SET_WORKFLOW", step: "capture_starting" });
    setLiveAnnouncement("Your scheduled routine is starting.");
    try {
      await playGentleTone();
      const handle = beginRecording(stream);
      recorderRef.current = handle;
      const startedAt = new Date().toISOString();
      recordingStartedAtRef.current = startedAt;
      dispatch({ type: "SET_TIMING", changes: { recordingStartedAt: startedAt } });
      dispatch({ type: "SET_WORKFLOW", step: "recording" });
      setLiveAnnouncement("Recording in progress");
      researchLogger.log("recording_started", {
        roleMode: "wearer",
        workflowStep: "recording",
        elapsedMs: state.timing.armedAt
          ? Date.now() - new Date(state.timing.armedAt).getTime()
          : undefined,
        properties: {
          maximum_duration_seconds: activeRoutine.maxDurationSeconds,
          prompt_type: activeRoutine.promptType,
        },
      });

      intervalRef.current = setInterval(() => {
        setElapsedSeconds(
          Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
        );
      }, 250);
      stopTimerRef.current = setTimeout(
        () => stopRecording("automatic"),
        activeRoutine.maxDurationSeconds * 1000,
      );

      let announcementSuccess = true;
      try {
        await speakText("Your scheduled medication-routine recording is starting.");
      } catch {
        announcementSuccess = false;
        promptErrorRef.current = "ANNOUNCEMENT_PLAYBACK_FAILED";
      }
      researchLogger.log("announcement_played", {
        roleMode: "wearer",
        workflowStep: "recording",
        properties: { prompt_delivery_success: announcementSuccess },
      });

      let promptSuccess = true;
      try {
        await playPrompt(activeRoutine);
        promptDeliveredRef.current = true;
      } catch {
        promptSuccess = false;
        promptErrorRef.current = "PROMPT_PLAYBACK_FAILED";
      }
      researchLogger.log("prompt_played", {
        roleMode: "wearer",
        workflowStep: "recording",
        properties: {
          prompt_type: activeRoutine.promptType,
          prompt_character_count: activeRoutine.typedPrompt.length,
          prompt_delivery_success: promptSuccess,
          repeat_count: 0,
        },
      });
      scheduleRepeats();
    } catch (error) {
      const code = error instanceof MediaCaptureError ? error.code : "RECORDING_START_FAILED";
      createFailureEvent(code, "capture_unavailable");
    }
  }, [
    activeRoutine,
    createFailureEvent,
    dispatch,
    recorderRef,
    scheduleRepeats,
    state.timing.armedAt,
    stopRecording,
    stream,
  ]);

  useEffect(() => {
    void requestScreenWakeLock().then((lock) => {
      wakeLockRef.current = lock;
    });
    const updateCountdown = () => {
      const remaining = targetTime.getTime() - Date.now();
      if (remaining <= 0) {
        setCountdownSeconds(0);
        void startCapture();
      } else {
        setCountdownSeconds(Math.ceil(remaining / 1000));
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 250);
    return () => {
      clearInterval(timer);
      clearTimers();
      void wakeLockRef.current?.release().catch(() => undefined);
    };
  }, [clearTimers, startCapture, targetTime]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") return;
      if (recorderRef.current) {
        stopRecording("hidden");
      } else if (!startedRef.current) {
        createFailureEvent("TAB_HIDDEN_ARMED", "capture_unavailable");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [createFailureEvent, recorderRef, stopRecording]);

  const recording = state.workflow === "recording";
  const finishedEvent = activeEvent;

  return (
    <section className="wearer-card" aria-labelledby="wearer-status-title">
      <MemolensMark className="wearer-mark" variant="reversed" />
      {!finishedEvent ? (
        <>
          <p className="eyebrow">{recording ? "Scheduled event" : "Prepared"}</p>
          <h1 id="wearer-status-title">{liveAnnouncement}</h1>
          <p className="wearer-routine-label">{activeRoutine.label}</p>
          {!recording ? (
            <div className="ready-status">
              <ShieldCheck size={22} />
              <div>
                <strong>Memolens is ready</strong>
                <span>
                  {state.testIntent === "run_now"
                    ? `Starting in ${countdownSeconds ?? 5} seconds`
                    : `Next scheduled time ${formatClock(targetTime)}`}
                </span>
              </div>
            </div>
          ) : (
            <div className="recording-status" role="status" aria-live="assertive">
              <span className="recording-pulse" aria-hidden="true" />
              <div>
                <strong>Recording</strong>
                <span>
                  {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:
                  {String(elapsedSeconds % 60).padStart(2, "0")} of {activeRoutine.maxDurationSeconds}s
                </span>
              </div>
              <Radio size={24} aria-hidden="true" />
            </div>
          )}
          {recording ? (
            <button
              className="privacy-stop-button"
              type="button"
              onClick={() => stopRecording("privacy")}
            >
              <CircleStop size={22} /> Stop recording
              <span>Optional privacy control</span>
            </button>
          ) : null}
          <p className="wearer-no-action">
            {recording
              ? "No interaction is required. The recording will end automatically."
              : "No wearer interaction is required."}
          </p>
        </>
      ) : (
        <div className="wearer-finished" aria-live="polite">
          <span className={finishedEvent.captureStatus === "capture_unavailable" || finishedEvent.captureStatus === "capture_incomplete" ? "finish-icon warning" : "finish-icon"}>
            {finishedEvent.captureStatus === "capture_unavailable" || finishedEvent.captureStatus === "capture_incomplete" ? (
              <CircleAlert size={30} />
            ) : (
              <Check size={30} />
            )}
          </span>
          <p className="eyebrow">Event ended</p>
          <h1 id="wearer-status-title">
            {finishedEvent.captureStatus === "capture_unavailable" || finishedEvent.captureStatus === "capture_incomplete"
              ? "Caregiver review is required."
              : "You’re all set. Your caregiver can review the update."}
          </h1>
          <p>
            {finishedEvent.objectUrl
              ? "Video is available for caregiver review on this device."
              : "Capture was unavailable, so no video was created."}
          </p>
          <div className="handoff-note">
            <LockKeyhole size={19} /> Please hand the device back to your caregiver.
          </div>
        </div>
      )}
    </section>
  );
}
