import {
  Archive,
  Check,
  ChevronLeft,
  CircleAlert,
  Eye,
  FileText,
  Inbox,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  ANALYTICS_CONSENT_VERSION,
  SCHEMA_VERSION,
} from "../../constants";
import {
  type MemolensState,
  useMemolens,
} from "../../state/context";
import {
  researchLogger,
  type TestSessionRecord,
} from "../../services/researchLogger";
import type {
  CaregiverDisposition,
  MedicationEvent,
  Routine,
  VideoReviewStatus,
} from "../../types";

interface CaregiverReviewProps {
  onDeleteEvent: (event: MedicationEvent) => void;
  onClearSession: () => void;
}

const DISPOSITIONS: Array<{ value: CaregiverDisposition; label: string }> = [
  { value: "appears_completed", label: "Appears completed" },
  { value: "uncertain_follow_up", label: "Uncertain—follow up" },
  { value: "wearer_requested_help", label: "Wearer requested help" },
  { value: "no_usable_evidence", label: "No usable evidence" },
  { value: "false_alert", label: "False alert" },
  { value: "technical_failure", label: "Technical failure" },
];

const CAPTURE_LABELS: Record<MedicationEvent["captureStatus"], string> = {
  evidence_available: "Evidence available",
  capture_incomplete: "Capture incomplete",
  capture_unavailable: "Capture unavailable",
  stopped_by_wearer: "Stopped by wearer",
};

function secondsBetween(start?: string, end?: string): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
}

export function buildTestSessionRecord(
  state: MemolensState,
  routine: Routine,
  event: MedicationEvent,
  completionState: "caregiver_review" | "left_open" | "acknowledged_closed",
): TestSessionRecord {
  const submittedAt = new Date().toISOString();
  const reviewEnd = state.timing.reviewEndedAt ?? submittedAt;
  return {
    schema_version: SCHEMA_VERSION,
    session_id: researchLogger.getSessionId(),
    participant_code: state.participantCode.trim().slice(0, 40),
    participant_type: state.participantType,
    test_condition: state.testCondition,
    started_at_utc: state.timing.testStartedAt ?? event.startedAt,
    ended_at_utc: event.acknowledgementAt ?? event.endedAt,
    completion_state: completionState,
    furthest_step: state.furthestStep,
    zero_touch_success:
      state.observations.zeroTouchSuccess === "yes"
        ? true
        : state.observations.zeroTouchSuccess === "no"
          ? false
          : null,
    wearer_interaction_count: state.observations.wearerInteractionCount,
    prompt_type: routine.promptType,
    prompt_delivered: event.promptDelivered,
    prompt_repeat_count: event.promptRepeatCount,
    camera_permission: state.preflight.cameraPermission,
    microphone_permission: state.preflight.microphonePermission,
    recording_status: event.captureStatus,
    recording_duration_seconds: Math.round(event.durationSeconds),
    recording_blob_bytes: event.blobBytes,
    privacy_stop: event.privacyStop,
    video_review_status: event.videoReviewStatus,
    caregiver_review_started_at_utc: state.timing.reviewStartedAt ?? null,
    review_duration_seconds: secondsBetween(state.timing.reviewStartedAt, reviewEnd),
    caregiver_disposition: event.caregiverDisposition ?? null,
    clip_usefulness: state.observations.clipUsefulness || null,
    prompt_comprehension: state.observations.promptComprehension || null,
    false_reassurance: state.observations.falseReassurance || null,
    review_burden: state.observations.reviewBurden || null,
    privacy_rating: state.observations.privacyRating
      ? Number(state.observations.privacyRating)
      : null,
    technical_error_code:
      event.technicalErrors.join("|").slice(0, 300) || null,
    research_notes: state.observations.researchNotes.slice(0, 1000) || null,
    research_consent_version:
      state.analyticsConsent === "allowed" ? ANALYTICS_CONSENT_VERSION : "",
    submitted_at_utc: submittedAt,
  };
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function VideoEvidence({
  event,
  compact = false,
  onStatus,
}: {
  event: MedicationEvent;
  compact?: boolean;
  onStatus: (status: VideoReviewStatus) => void;
}) {
  if (!event.objectUrl) {
    return (
      <div className="no-video-panel">
        <CircleAlert size={24} />
        <div>
          <strong>Capture unavailable</strong>
          <span>No video was created for this event.</span>
        </div>
      </div>
    );
  }
  return (
    <div className={compact ? "video-evidence compact" : "video-evidence"}>
      <video
        controls
        playsInline
        preload="metadata"
        src={event.objectUrl}
        aria-label={`Recorded medication-event evidence for ${event.routineLabel}`}
        onPlay={() => onStatus("started")}
        onEnded={() => onStatus("completed")}
      />
      <p>
        <ShieldCheck size={15} /> Video available for caregiver review · remains on this device
      </p>
    </div>
  );
}

export function CaregiverReview({ onDeleteEvent, onClearSession }: CaregiverReviewProps) {
  const { state, dispatch, activeRoutine, activeEvent } = useMemolens();
  const [validationError, setValidationError] = useState("");

  const updateVideoStatus = (event: MedicationEvent, status: VideoReviewStatus) => {
    const currentRank = { not_reviewed: 0, started: 1, skipped: 2, completed: 3 }[
      event.videoReviewStatus
    ];
    const nextRank = { not_reviewed: 0, started: 1, skipped: 2, completed: 3 }[status];
    if (nextRank <= currentRank) return;
    dispatch({ type: "UPDATE_EVENT", id: event.id, changes: { videoReviewStatus: status } });
    if (status === "started") {
      researchLogger.log("video_playback_started", {
        roleMode: "caregiver",
        workflowStep: "caregiver_review",
      });
    }
    if (status === "completed") {
      researchLogger.log("video_playback_completed", {
        roleMode: "caregiver",
        workflowStep: "caregiver_review",
        elapsedMs: Math.round(event.durationSeconds * 1000),
      });
    }
  };

  useEffect(() => {
    if (state.workflow === "acknowledged_closed") {
      researchLogger.logViewOnce(
        `test-completion:${activeEvent?.id ?? "none"}`,
        "test_completion_viewed",
        { roleMode: "caregiver", workflowStep: "acknowledged_closed" },
      );
      return;
    }
    if (state.workflow === "caregiver_review" && activeEvent) {
      researchLogger.logViewOnce(
        `caregiver-review:${activeEvent.id}`,
        "caregiver_review_viewed",
        { roleMode: "caregiver", workflowStep: "caregiver_review" },
      );
      if (!state.timing.reviewStartedAt) {
        dispatch({
          type: "SET_TIMING",
          changes: { reviewStartedAt: new Date().toISOString() },
        });
      }
      return;
    }
    researchLogger.logViewOnce(
      `caregiver-inbox:${state.events.map((event) => event.id).join(",")}`,
      "caregiver_inbox_viewed",
      { roleMode: "caregiver", workflowStep: "caregiver_inbox" },
    );
  }, [activeEvent, dispatch, state.events, state.timing.reviewStartedAt, state.workflow]);

  const openReview = (event: MedicationEvent) => {
    dispatch({ type: "SET_ACTIVE_EVENT", id: event.id });
    dispatch({ type: "SET_WORKFLOW", step: "caregiver_review" });
    if (!state.timing.reviewStartedAt) {
      dispatch({ type: "SET_TIMING", changes: { reviewStartedAt: new Date().toISOString() } });
    }
  };

  const submitSession = async (
    completionState: "caregiver_review" | "left_open" | "acknowledged_closed",
    event: MedicationEvent,
  ): Promise<boolean> => {
    if (state.analyticsConsent !== "allowed") {
      dispatch({
        type: "SET_RESEARCH_SAVE",
        status: "idle",
        message: "Anonymous research was declined; this information remains on this device only.",
      });
      return true;
    }
    dispatch({
      type: "SET_RESEARCH_SAVE",
      status: "saving",
      message: "Awaiting Supabase confirmation…",
    });
    try {
      const summary = buildTestSessionRecord(state, activeRoutine, event, completionState);
      await researchLogger.submitTestSession(summary);
      dispatch({
        type: "SET_RESEARCH_SAVE",
        status: "saved",
        message: "Supabase confirmed this test summary.",
      });
      return true;
    } catch {
      dispatch({
        type: "SET_RESEARCH_SAVE",
        status: "failed",
        message:
          "Research logging was not confirmed. The recording remains local; retry the summary submission when ready.",
      });
      dispatch({ type: "SET_LOGGING_UNAVAILABLE", value: true });
      return false;
    }
  };

  const submitObservations = async () => {
    if (!activeEvent) return;
    researchLogger.log("research_observations_submitted", {
      roleMode: "caregiver",
      workflowStep: "caregiver_review",
      properties: {
        zero_touch_success: state.observations.zeroTouchSuccess,
        wearer_interaction_count: state.observations.wearerInteractionCount,
        prompt_comprehension: state.observations.promptComprehension,
        clip_usefulness: state.observations.clipUsefulness,
        false_reassurance: state.observations.falseReassurance,
        review_burden: state.observations.reviewBurden,
        privacy_rating: state.observations.privacyRating,
      },
    });
    await researchLogger.flush();
    await submitSession("caregiver_review", activeEvent);
  };

  const closeEvent = async () => {
    if (!activeEvent) return;
    if (
      activeEvent.videoReviewStatus !== "completed" &&
      activeEvent.videoReviewStatus !== "skipped"
    ) {
      setValidationError("Play the clip to completion or choose “Skip video review” before closing.");
      return;
    }
    if (!activeEvent.caregiverDisposition) {
      setValidationError("Select a caregiver disposition before closing.");
      return;
    }
    const acknowledgementAt = new Date().toISOString();
    const closedEvent = { ...activeEvent, acknowledgementAt, closed: true };
    dispatch({
      type: "UPDATE_EVENT",
      id: activeEvent.id,
      changes: { acknowledgementAt, closed: true },
    });
    dispatch({ type: "SET_TIMING", changes: { reviewEndedAt: acknowledgementAt } });
    dispatch({ type: "SET_WORKFLOW", step: "acknowledged_closed" });
    researchLogger.log("test_closed", {
      roleMode: "caregiver",
      workflowStep: "acknowledged_closed",
      elapsedMs: secondsBetween(state.timing.reviewStartedAt, acknowledgementAt) * 1000,
      properties: {
        caregiver_disposition: activeEvent.caregiverDisposition,
        video_review_status: activeEvent.videoReviewStatus,
        closed: true,
      },
    });
    await researchLogger.flush();
    await submitSession("acknowledged_closed", closedEvent);
  };

  const keepOpen = async () => {
    if (!activeEvent) return;
    dispatch({ type: "UPDATE_EVENT", id: activeEvent.id, changes: { closed: false } });
    dispatch({ type: "SET_WORKFLOW", step: "caregiver_inbox" });
    await submitSession("left_open", { ...activeEvent, closed: false });
  };

  const skipVideo = () => {
    if (!activeEvent) return;
    dispatch({
      type: "UPDATE_EVENT",
      id: activeEvent.id,
      changes: { videoReviewStatus: "skipped" },
    });
    researchLogger.log("video_review_skipped", {
      roleMode: "caregiver",
      workflowStep: "caregiver_review",
    });
    setValidationError("");
  };

  if (state.workflow === "acknowledged_closed" && activeEvent) {
    return (
      <section className="workflow-card completion-card" aria-labelledby="completion-title">
        <span className="finish-icon" aria-hidden="true">
          <Check size={30} />
        </span>
        <p className="eyebrow">Acknowledged and closed</p>
        <h1 id="completion-title">Caregiver review is complete.</h1>
        <p>
          Your disposition is recorded locally. The video remains in memory until it is
          deleted, the session is cleared, or this tab is refreshed or closed.
        </p>
        <div
          className={`save-status ${state.researchSaveStatus}`}
          role={state.researchSaveStatus === "failed" ? "alert" : "status"}
        >
          {state.researchSaveStatus === "saving" ? <LoaderCircle className="spin" size={18} /> : null}
          {state.researchSaveStatus === "saved" ? <ShieldCheck size={18} /> : null}
          {state.researchSaveStatus === "failed" ? <CircleAlert size={18} /> : null}
          <span>{state.researchSaveMessage ?? "No research transmission was requested."}</span>
        </div>
        {state.researchSaveStatus === "failed" ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={() => submitSession("acknowledged_closed", activeEvent)}
          >
            <RotateCcw size={18} /> Retry research summary
          </button>
        ) : null}
        <div className="completion-actions">
          <button className="button button-primary" type="button" onClick={onClearSession}>
            Start a new safe-prop test
          </button>
          <button
            className="button button-ghost danger-text"
            type="button"
            onClick={() => onDeleteEvent(activeEvent)}
          >
            <Trash2 size={18} /> Delete recording
          </button>
        </div>
      </section>
    );
  }

  if (state.workflow !== "caregiver_review" || !activeEvent) {
    return (
      <section className="workflow-card inbox-card" aria-labelledby="inbox-title">
        <div className="workflow-heading-row">
          <div>
            <p className="eyebrow">Caregiver mode</p>
            <h1 id="inbox-title">Recorded event inbox</h1>
            <p className="lead-copy">
              Review recorded medication-event evidence and use your own judgment to decide
              whether follow-up is needed.
            </p>
          </div>
          <span className="inbox-count">
            <Inbox size={17} /> {state.events.length} {state.events.length === 1 ? "event" : "events"}
          </span>
        </div>

        {state.events.length === 0 ? (
          <div className="empty-inbox">
            <Archive size={30} />
            <h2>No recorded events</h2>
            <p>Complete a safe-prop wearer test to create an event package.</p>
          </div>
        ) : (
          <div className="event-list">
            {state.events.map((event) => (
              <article className="event-card" key={event.id}>
                <div className="event-card-header">
                  <div>
                    <span className={`capture-chip ${event.captureStatus}`}>
                      {CAPTURE_LABELS[event.captureStatus]}
                    </span>
                    <h2>{event.routineLabel}</h2>
                    <p>Caregiver review required</p>
                  </div>
                  <span className="event-time">{formatDateTime(event.startedAt)}</span>
                </div>
                <div className="event-facts">
                  <span>
                    <strong>Scheduled</strong> {formatDateTime(event.scheduledAt)}
                  </span>
                  <span>
                    <strong>Started</strong> {formatDateTime(event.startedAt)}
                  </span>
                  <span>
                    <strong>Ended</strong> {formatDateTime(event.endedAt)}
                  </span>
                  <span>
                    <strong>Duration</strong> {Math.round(event.durationSeconds)} seconds
                  </span>
                  <span>
                    <strong>Prompt</strong> {event.promptDelivered ? "Delivered" : "Delivery failed"}
                  </span>
                  <span>
                    <strong>Repeats</strong> {event.promptRepeatCount}
                  </span>
                </div>
                <VideoEvidence
                  event={event}
                  compact
                  onStatus={(status) => updateVideoStatus(event, status)}
                />
                {event.technicalErrors.length ? (
                  <p className="technical-inline">
                    <CircleAlert size={16} /> Technical notes: {event.technicalErrors.join(", ")}
                  </p>
                ) : null}
                <div className="event-card-actions">
                  <button className="button button-primary" type="button" onClick={() => openReview(event)}>
                    <Eye size={18} /> Review event
                  </button>
                  <button className="button button-ghost danger-text" type="button" onClick={() => onDeleteEvent(event)}>
                    <Trash2 size={18} /> Delete recording
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="clear-session-panel">
          <div>
            <strong>Current session is temporary</strong>
            <span>Refresh or close erases media and UI state.</span>
          </div>
          <button className="button button-ghost danger-text" type="button" onClick={onClearSession}>
            Clear session
          </button>
        </div>
      </section>
    );
  }

  const observation = state.observations;

  return (
    <section className="workflow-card review-card" aria-labelledby="review-title">
      <button
        className="back-link-button"
        type="button"
        onClick={() => dispatch({ type: "SET_WORKFLOW", step: "caregiver_inbox" })}
      >
        <ChevronLeft size={18} /> Back to inbox
      </button>
      <div className="review-heading">
        <div>
          <p className="eyebrow">Caregiver review required</p>
          <h1 id="review-title">{activeEvent.routineLabel}</h1>
          <p>
            Recorded {formatDateTime(activeEvent.startedAt)} · {Math.round(activeEvent.durationSeconds)} seconds
          </p>
        </div>
        <span className={`capture-chip ${activeEvent.captureStatus}`}>
          {CAPTURE_LABELS[activeEvent.captureStatus]}
        </span>
      </div>

      <VideoEvidence
        event={activeEvent}
        onStatus={(status) => updateVideoStatus(activeEvent, status)}
      />
      <button className="text-button skip-video" type="button" onClick={skipVideo}>
        Skip video review
      </button>
      <p className="review-gate-status">
        Video review: <strong>{activeEvent.videoReviewStatus.replaceAll("_", " ")}</strong>
      </p>

      <div className="review-details-grid">
        <div>
          <span>Scheduled time</span>
          <strong>{formatDateTime(activeEvent.scheduledAt)}</strong>
        </div>
        <div>
          <span>Recording window</span>
          <strong>
            {formatDateTime(activeEvent.startedAt)} – {formatDateTime(activeEvent.endedAt)}
          </strong>
        </div>
        <div>
          <span>Prompt status</span>
          <strong>{activeEvent.promptDelivered ? "Delivered" : "Delivery failed"}</strong>
        </div>
        <div>
          <span>Prompt repeats</span>
          <strong>{activeEvent.promptRepeatCount}</strong>
        </div>
        <div>
          <span>Capture status</span>
          <strong>{CAPTURE_LABELS[activeEvent.captureStatus]}</strong>
        </div>
        <div>
          <span>Acknowledgement</span>
          <strong>{activeEvent.acknowledgementAt ? formatDateTime(activeEvent.acknowledgementAt) : "Open"}</strong>
        </div>
      </div>

      {activeEvent.technicalErrors.length ? (
        <div className="technical-error">
          <CircleAlert size={20} />
          <div>
            <strong>Technical errors</strong>
            <p>{activeEvent.technicalErrors.join(", ")}</p>
          </div>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="caregiver-note">Caregiver note</label>
        <textarea
          id="caregiver-note"
          rows={3}
          maxLength={1000}
          value={activeEvent.caregiverNote}
          onChange={(event) =>
            dispatch({
              type: "UPDATE_EVENT",
              id: activeEvent.id,
              changes: { caregiverNote: event.target.value },
            })
          }
        />
        <span className="field-hint">Stored in this browser session only; not sent to research logs.</span>
      </div>

      <fieldset className="disposition-fieldset">
        <legend>Caregiver disposition</legend>
        <p>Only caregiver judgment interprets the event.</p>
        <div className="disposition-grid">
          {DISPOSITIONS.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="disposition"
                value={option.value}
                checked={activeEvent.caregiverDisposition === option.value}
                onChange={() => {
                  dispatch({
                    type: "UPDATE_EVENT",
                    id: activeEvent.id,
                    changes: { caregiverDisposition: option.value },
                  });
                  researchLogger.log("caregiver_disposition_selected", {
                    roleMode: "caregiver",
                    workflowStep: "caregiver_review",
                    properties: { caregiver_disposition: option.value },
                  });
                  setValidationError("");
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <details className="research-observations">
        <summary>
          <FileText size={18} /> Research observations
        </summary>
        <div className="observation-form">
          <div className="field">
            <label htmlFor="zero-touch">Routine completed without required wearer screen interaction?</label>
            <select
              id="zero-touch"
              value={observation.zeroTouchSuccess}
              onChange={(event) =>
                dispatch({
                  type: "SET_OBSERVATIONS",
                  changes: { zeroTouchSuccess: event.target.value as typeof observation.zeroTouchSuccess },
                })
              }
            >
              <option value="">Choose…</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="interaction-count">Number of required wearer interactions</label>
            <input
              id="interaction-count"
              type="number"
              min={0}
              max={99}
              value={observation.wearerInteractionCount}
              onChange={(event) =>
                dispatch({
                  type: "SET_OBSERVATIONS",
                  changes: { wearerInteractionCount: Math.min(99, Math.max(0, Number(event.target.value))) },
                })
              }
            />
            <span className="field-hint">Do not count use of the optional privacy-stop control.</span>
          </div>
          <ObservationSelect
            id="prompt-understandable"
            label="Was the prompt understandable?"
            value={observation.promptComprehension}
            options={["yes", "no", "unsure"]}
            onChange={(value) =>
              dispatch({ type: "SET_OBSERVATIONS", changes: { promptComprehension: value as typeof observation.promptComprehension } })
            }
          />
          <ObservationSelect
            id="clip-useful"
            label="Was the clip useful?"
            value={observation.clipUsefulness}
            options={["yes", "no", "partly"]}
            onChange={(value) =>
              dispatch({ type: "SET_OBSERVATIONS", changes: { clipUsefulness: value as typeof observation.clipUsefulness } })
            }
          />
          <ObservationSelect
            id="false-reassurance"
            label="Was any false reassurance created?"
            value={observation.falseReassurance}
            options={["yes", "no"]}
            onChange={(value) =>
              dispatch({ type: "SET_OBSERVATIONS", changes: { falseReassurance: value as typeof observation.falseReassurance } })
            }
          />
          <ObservationSelect
            id="review-burden"
            label="Review burden"
            value={observation.reviewBurden}
            options={["easy", "acceptable", "difficult"]}
            onChange={(value) =>
              dispatch({ type: "SET_OBSERVATIONS", changes: { reviewBurden: value as typeof observation.reviewBurden } })
            }
          />
          <div className="field">
            <label htmlFor="privacy-rating">Privacy comfort (1–5)</label>
            <select
              id="privacy-rating"
              value={observation.privacyRating}
              onChange={(event) =>
                dispatch({
                  type: "SET_OBSERVATIONS",
                  changes: { privacyRating: event.target.value as typeof observation.privacyRating },
                })
              }
            >
              <option value="">Choose…</option>
              <option value="1">1 — Very uncomfortable</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5 — Very comfortable</option>
            </select>
          </div>
          <div className="field span-two">
            <label htmlFor="research-note">Free-text research note</label>
            <textarea
              id="research-note"
              rows={4}
              maxLength={1000}
              value={observation.researchNotes}
              onChange={(event) =>
                dispatch({ type: "SET_OBSERVATIONS", changes: { researchNotes: event.target.value } })
              }
            />
            <span className="field-hint">{observation.researchNotes.length}/1,000 characters</span>
          </div>
          <p className="research-warning span-two">
            Do not enter names, medication names, diagnoses, doses, or other identifying health information in research notes.
          </p>
          <button
            className="button button-secondary span-two"
            type="button"
            onClick={submitObservations}
            disabled={state.researchSaveStatus === "saving"}
          >
            {state.researchSaveStatus === "saving" ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
            Submit research observations
          </button>
          {state.researchSaveMessage ? (
            <p className={`save-status ${state.researchSaveStatus} span-two`} role={state.researchSaveStatus === "failed" ? "alert" : "status"}>
              {state.researchSaveMessage}
            </p>
          ) : null}
        </div>
      </details>

      {validationError ? (
        <p className="form-error" role="alert">
          {validationError}
        </p>
      ) : null}

      <div className="review-actions">
        <button className="button button-primary" type="button" onClick={closeEvent}>
          <Check size={18} /> Acknowledge and close
        </button>
        <button className="button button-secondary" type="button" onClick={keepOpen}>
          Keep open for follow-up
        </button>
        <button className="button button-ghost danger-text" type="button" onClick={() => onDeleteEvent(activeEvent)}>
          <Trash2 size={18} /> Delete recording
        </button>
      </div>
      <p className="deletion-distinction">
        Deleting local media cannot retract structured research metrics already confirmed by Supabase.
      </p>
    </section>
  );
}

function ObservationSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose…</option>
        {options.map((option) => (
          <option value={option} key={option}>
            {option.charAt(0).toUpperCase() + option.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}
