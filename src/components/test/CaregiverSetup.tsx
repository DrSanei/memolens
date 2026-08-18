"use client";

import {
  CalendarClock,
  Camera,
  CircleStop,
  Clock3,
  Mic,
  Play,
  Plus,
  Save,
  Trash2,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  PARTICIPANT_OPTIONS,
  TEST_CONDITION_OPTIONS,
  createDefaultRoutine,
} from "../../constants";
import { useMemolens } from "../../state/context";
import { playPrompt, stopMediaStream } from "../../services/media";
import { researchLogger } from "../../services/researchLogger";
import type { Routine, TestIntent } from "../../types";

interface CaregiverSetupProps {
  onPrepare: (intent: TestIntent) => void;
}

function todayAt(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function CaregiverSetup({ onPrepare }: CaregiverSetupProps) {
  const { state, dispatch, activeRoutine } = useMemolens();
  const [error, setError] = useState("");
  const [previewStatus, setPreviewStatus] = useState<"idle" | "playing" | "failed">(
    "idle",
  );
  const [recordingVoice, setRecordingVoice] = useState(false);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  useEffect(
    () => () => {
      if (voiceRecorderRef.current?.state !== "inactive") voiceRecorderRef.current?.stop();
      stopMediaStream(voiceStreamRef.current);
    },
    [],
  );

  const updateRoutine = (changes: Partial<Routine>) => {
    dispatch({ type: "UPDATE_ROUTINE", id: activeRoutine.id, changes: { ...changes, saved: false } });
    setError("");
  };

  const validate = (intent?: TestIntent): boolean => {
    if (!activeRoutine.label.trim()) {
      setError("Add a short routine label.");
      return false;
    }
    if (!activeRoutine.typedPrompt.trim() && !activeRoutine.voicePromptUrl) {
      setError("Add a caregiver-approved prompt.");
      return false;
    }
    if (intent === "scheduled" && todayAt(activeRoutine.scheduledTime).getTime() <= Date.now() + 3000) {
      setError("Choose a scheduled time at least a few seconds in the future.");
      return false;
    }
    return true;
  };

  const saveRoutine = (): boolean => {
    if (!validate()) return false;
    dispatch({ type: "UPDATE_ROUTINE", id: activeRoutine.id, changes: { saved: true } });
    const setupStarted = state.timing.setupStartedAt
      ? new Date(state.timing.setupStartedAt).getTime()
      : Date.now();
    researchLogger.log("routine_saved", {
      roleMode: "caregiver",
      workflowStep: "caregiver_setup",
      elapsedMs: Date.now() - setupStarted,
      properties: {
        prompt_type: activeRoutine.promptType,
        prompt_character_count: activeRoutine.typedPrompt.length,
        preview_played: activeRoutine.promptPreviewed,
        maximum_duration_seconds: activeRoutine.maxDurationSeconds,
        repeat_delay_seconds: activeRoutine.repeatDelaySeconds,
        maximum_repeats: activeRoutine.maxRepeats,
      },
    });
    return true;
  };

  const previewPrompt = async () => {
    setPreviewStatus("playing");
    try {
      await playPrompt(activeRoutine);
      dispatch({
        type: "UPDATE_ROUTINE",
        id: activeRoutine.id,
        changes: { promptPreviewed: true },
      });
      researchLogger.log("prompt_previewed", {
        roleMode: "caregiver",
        workflowStep: "caregiver_setup",
        properties: {
          prompt_type: activeRoutine.promptType,
          prompt_character_count: activeRoutine.typedPrompt.length,
          preview_played: true,
        },
      });
      setPreviewStatus("idle");
    } catch {
      setPreviewStatus("failed");
      setError("Prompt playback failed. Check device audio and browser support, then retry.");
    }
  };

  const stopVoiceRecording = () => {
    if (voiceRecorderRef.current?.state !== "inactive") voiceRecorderRef.current?.stop();
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice-prompt recording is unavailable in this browser. The typed prompt still works.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      voiceRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stopMediaStream(stream);
        voiceStreamRef.current = null;
        setRecordingVoice(false);
        if (blob.size === 0) {
          setError("The voice prompt was empty. Retry or keep the typed prompt.");
          return;
        }
        if (activeRoutine.voicePromptUrl) URL.revokeObjectURL(activeRoutine.voicePromptUrl);
        const url = URL.createObjectURL(blob);
        dispatch({
          type: "UPDATE_ROUTINE",
          id: activeRoutine.id,
          changes: {
            voicePromptBlob: blob,
            voicePromptUrl: url,
            promptType: "caregiver_voice",
            promptPreviewed: false,
          },
        });
        researchLogger.log("voice_prompt_recorded", {
          roleMode: "caregiver",
          workflowStep: "caregiver_setup",
          properties: { prompt_type: "caregiver_voice", recording_created: true },
        });
      };
      recorder.start(200);
      setRecordingVoice(true);
      window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 8000);
    } catch {
      setError("Microphone access was not available for the optional voice prompt.");
    }
  };

  const removeVoicePrompt = () => {
    if (activeRoutine.voicePromptUrl) URL.revokeObjectURL(activeRoutine.voicePromptUrl);
    updateRoutine({
      voicePromptBlob: undefined,
      voicePromptUrl: undefined,
      promptType: "typed",
      promptPreviewed: false,
    });
  };

  const prepare = (intent: TestIntent) => {
    if (!validate(intent)) return;
    if (!activeRoutine.saved && !saveRoutine()) return;
    const now = new Date().toISOString();
    dispatch({ type: "SET_TEST_INTENT", intent });
    dispatch({ type: "SET_TIMING", changes: { setupCompletedAt: now } });
    dispatch({ type: "SET_WORKFLOW", step: "preflight" });
    researchLogger.log("preflight_started", {
      roleMode: "caregiver",
      workflowStep: "preflight",
      source: intent,
    });
    researchLogger.logViewOnce(`preflight:${activeRoutine.id}`, "preflight_viewed", {
      roleMode: "caregiver",
      workflowStep: "preflight",
      source: intent,
    });
    onPrepare(intent);
  };

  return (
    <section className="workflow-card setup-card" aria-labelledby="caregiver-setup-title">
      <div className="workflow-heading-row">
        <div>
          <p className="eyebrow">Caregiver mode · Step 1 of 2</p>
          <h1 id="caregiver-setup-title">Prepare a safe test routine</h1>
          <p className="lead-copy">
            Configure the deterministic prompt and recording window. Exact prompt text stays
            on this device.
          </p>
        </div>
        <span className="timezone-chip">
          <Clock3 size={16} /> {activeRoutine.timezone}
        </span>
      </div>

      <div className="routine-tabs" aria-label="Saved routines">
        {state.routines.map((routine) => (
          <button
            className={routine.id === activeRoutine.id ? "routine-tab active" : "routine-tab"}
            type="button"
            key={routine.id}
            onClick={() => dispatch({ type: "SET_ACTIVE_ROUTINE", id: routine.id })}
          >
            {routine.label || "Untitled routine"}
          </button>
        ))}
        <button
          className="routine-tab add"
          type="button"
          onClick={() =>
            dispatch({ type: "ADD_ROUTINE", routine: createDefaultRoutine(state.routines.length + 1) })
          }
        >
          <Plus size={16} /> Add routine
        </button>
      </div>

      <div className="setup-grid">
        <div className="field span-two">
          <label htmlFor="routine-label">Routine label</label>
          <input
            id="routine-label"
            value={activeRoutine.label}
            maxLength={80}
            onChange={(event) => updateRoutine({ label: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="routine-day">Day</label>
          <select id="routine-day" value="today" disabled>
            <option value="today">Today</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="routine-time">Scheduled time</label>
          <input
            id="routine-time"
            type="time"
            value={activeRoutine.scheduledTime}
            onChange={(event) => updateRoutine({ scheduledTime: event.target.value })}
          />
        </div>
        <div className="field span-two">
          <label htmlFor="routine-prompt">Typed caregiver-approved prompt</label>
          <textarea
            id="routine-prompt"
            rows={3}
            maxLength={300}
            value={activeRoutine.typedPrompt}
            onChange={(event) =>
              updateRoutine({ typedPrompt: event.target.value, promptType: "typed" })
            }
          />
          <span className="field-hint">
            {activeRoutine.typedPrompt.length}/300 characters · never sent to research logs
          </span>
        </div>

        <div className="prompt-controls span-two">
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={previewPrompt}
            disabled={previewStatus === "playing"}
          >
            <Volume2 size={18} />
            {previewStatus === "playing" ? "Playing…" : "Preview prompt"}
          </button>
          <button
            className={recordingVoice ? "button button-danger-soft button-small" : "button button-secondary button-small"}
            type="button"
            onClick={recordingVoice ? stopVoiceRecording : startVoiceRecording}
          >
            {recordingVoice ? <CircleStop size={18} /> : <Mic size={18} />}
            {recordingVoice ? "Stop recording" : "Record my voice"}
          </button>
          {activeRoutine.voicePromptUrl ? (
            <button className="text-button danger-text" type="button" onClick={removeVoicePrompt}>
              Remove voice prompt
            </button>
          ) : null}
          <span className="prompt-type-chip">
            {activeRoutine.promptType === "caregiver_voice" ? "Voice prompt selected" : "Typed prompt selected"}
          </span>
        </div>

        <div className="field">
          <label htmlFor="max-duration">Maximum recording duration</label>
          <select
            id="max-duration"
            value={activeRoutine.maxDurationSeconds}
            onChange={(event) => updateRoutine({ maxDurationSeconds: Number(event.target.value) })}
          >
            <option value={15}>15 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={45}>45 seconds</option>
            <option value={60}>60 seconds</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="repeat-delay">Fixed prompt-repeat delay</label>
          <input id="repeat-delay" value="15 seconds" readOnly />
        </div>
        <div className="field">
          <label htmlFor="maximum-repeats">Maximum repeat count</label>
          <select
            id="maximum-repeats"
            value={activeRoutine.maxRepeats}
            onChange={(event) => updateRoutine({ maxRepeats: Number(event.target.value) })}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="preferred-camera">Preferred camera</label>
          <select
            id="preferred-camera"
            value={activeRoutine.cameraPreference}
            onChange={(event) =>
              updateRoutine({ cameraPreference: event.target.value as Routine["cameraPreference"] })
            }
          >
            <option value="environment">Environment-facing</option>
            <option value="user">Front-facing</option>
          </select>
        </div>
      </div>

      <details className="research-details">
        <summary>Research test details</summary>
        <div className="research-meta-grid">
          <div className="field">
            <label htmlFor="participant-code">Anonymous participant code</label>
            <input
              id="participant-code"
              value={state.participantCode}
              maxLength={40}
              onChange={(event) =>
                dispatch({ type: "SET_TEST_METADATA", participantCode: event.target.value })
              }
            />
            <span className="field-hint">Use a study code, not a person’s name.</span>
          </div>
          <div className="field">
            <label htmlFor="participant-type">Participant type</label>
            <select
              id="participant-type"
              value={state.participantType}
              onChange={(event) =>
                dispatch({
                  type: "SET_TEST_METADATA",
                  participantType: event.target.value as typeof state.participantType,
                })
              }
            >
              {PARTICIPANT_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field span-two">
            <label htmlFor="test-condition">Research test condition</label>
            <select
              id="test-condition"
              value={state.testCondition}
              onChange={(event) =>
                dispatch({
                  type: "SET_TEST_METADATA",
                  testCondition: event.target.value as typeof state.testCondition,
                })
              }
            >
              {TEST_CONDITION_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="field-hint">
              Metadata only. This selection never changes or simulates a system result.
            </span>
          </div>
        </div>
      </details>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="routine-management-row">
        <button className="button button-secondary" type="button" onClick={saveRoutine}>
          <Save size={18} /> Save routine
        </button>
        <button
          className="button button-ghost danger-text"
          type="button"
          onClick={() => dispatch({ type: "REMOVE_ROUTINE", id: activeRoutine.id })}
        >
          <Trash2 size={18} /> Remove routine
        </button>
      </div>

      <div className="setup-actions">
        <button className="button button-secondary action-tile" type="button" onClick={() => prepare("scheduled")}>
          <CalendarClock size={22} />
          <span>
            <strong>Arm Scheduled Test</strong>
            <small>Works while this page stays open, visible, and active.</small>
          </span>
        </button>
        <button className="button button-primary action-tile" type="button" onClick={() => prepare("run_now")}>
          <Play size={22} />
          <span>
            <strong>Run Test Now</strong>
            <small>Starts a five-second caregiver-controlled countdown after preflight.</small>
          </span>
        </button>
      </div>
      <p className="safe-prop-reminder">
        <Camera size={17} /> Use an empty pillbox, candy, or another safe non-medication prop.
      </p>
    </section>
  );
}
