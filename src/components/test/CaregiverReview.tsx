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
import { useEffect, useRef, useState } from "react";
import {
  ANALYTICS_CONSENT_VERSION,
  CONTACT_CONSENT_VERSION,
  SCHEMA_VERSION,
} from "../../constants";
import {
  type MemolensState,
  useMemolens,
} from "../../state/context";
import {
  researchLogger,
  type LeadRecord,
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
  { value: "appears_completed", label: "Routine appears completed" },
  { value: "uncertain_follow_up", label: "Needs follow-up" },
  { value: "care_recipient_requested_help", label: "Care recipient asked for help" },
  { value: "no_usable_evidence", label: "Memo was not clear enough" },
  { value: "false_alert", label: "False alert" },
  { value: "technical_failure", label: "Technical issue" },
];

const CAPTURE_LABELS: Record<MedicationEvent["captureStatus"], string> = {
  evidence_available: "Memo ready",
  capture_incomplete: "Memo incomplete",
  capture_unavailable: "Memo unavailable",
  stopped_by_care_recipient: "Stopped by care recipient",
};

type FeedbackChoice = "" | "yes" | "maybe" | "no";
type FeedbackSaveStatus = "idle" | "saving" | "saved" | "failed";

interface PostTestFeedbackPayload {
  overallValueRating: number;
  wouldConsiderUse: Exclude<FeedbackChoice, "">;
  pilotInterest: Exclude<FeedbackChoice, "">;
  feedbackText: string;
  submittedAtUtc: string;
}

const ROLE_INTEREST_LABELS: Record<MemolensState["participantType"], string> = {
  family_caregiver: "Family caregiver",
  professional_caregiver: "Professional caregiver",
  healthcare_professional: "Healthcare professional",
  researcher: "Researcher",
  potential_partner: "Potential partner",
  other: "Other",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function secondsBetween(start?: string, end?: string): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
}

export function buildTestSessionRecord(
  state: MemolensState,
  routine: Routine,
  event: MedicationEvent,
  completionState: "caregiver_review" | "left_open" | "acknowledged_closed",
  feedback?: PostTestFeedbackPayload,
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
    care_recipient_interaction_count: state.observations.careRecipientInteractionCount,
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
    ...(feedback
      ? {
          overall_value_rating: feedback.overallValueRating,
          would_consider_use: feedback.wouldConsiderUse,
          pilot_interest: feedback.pilotInterest,
          feedback_text: feedback.feedbackText || null,
          feedback_submitted_at_utc: feedback.submittedAtUtc,
        }
      : {}),
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
          <strong>Memo unavailable</strong>
          <span>No Memo was created for this support moment.</span>
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

function ChoiceQuestion({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: FeedbackChoice;
  onChange: (value: Exclude<FeedbackChoice, "">) => void;
}) {
  const options: Array<{
    value: Exclude<FeedbackChoice, "">;
    label: string;
  }> = [
    { value: "yes", label: "Yes" },
    { value: "maybe", label: "Maybe" },
    { value: "no", label: "No" },
  ];

  return (
    <fieldset className="feedback-question">
      <legend>{legend}</legend>
      <div className="choice-row">
        {options.map((option) => (
          <button
            className={value === option.value ? "choice-button selected" : "choice-button"}
            type="button"
            key={option.value}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function CaregiverReview({ onDeleteEvent, onClearSession }: CaregiverReviewProps) {
  const { state, dispatch, activeRoutine, activeEvent } = useMemolens();
  const [validationError, setValidationError] = useState("");
  const [postTestValue, setPostTestValue] = useState(0);
  const [wouldConsiderUse, setWouldConsiderUse] = useState<FeedbackChoice>("");
  const [pilotInterest, setPilotInterest] = useState<FeedbackChoice>("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackSaveStatus>("idle");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const feedbackStartedAtRef = useRef(0);
  const feedbackLeadIdRef = useRef(crypto.randomUUID());

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
      if (feedbackStartedAtRef.current === 0) {
        feedbackStartedAtRef.current = Date.now();
      }
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
    feedback?: PostTestFeedbackPayload,
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
      const summary = buildTestSessionRecord(
        state,
        activeRoutine,
        event,
        completionState,
        feedback,
      );
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
        care_recipient_interaction_count: state.observations.careRecipientInteractionCount,
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
      setValidationError("Play the Memo to completion or choose “Skip Memo review” before finishing.");
      return;
    }
    if (!activeEvent.caregiverDisposition) {
      setValidationError("Select a review outcome before finishing.");
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


  const submitPostTestFeedback = async () => {
    if (!activeEvent || feedbackStatus === "saving") return;
    if (
      postTestValue < 1 ||
      postTestValue > 5 ||
      !wouldConsiderUse ||
      !pilotInterest
    ) {
      setFeedbackStatus("failed");
      setFeedbackMessage("Please answer the three required feedback questions.");
      return;
    }

    const email = feedbackEmail.trim().toLowerCase();
    if (email && !EMAIL_PATTERN.test(email)) {
      setFeedbackStatus("failed");
      setFeedbackMessage("Enter a valid email address or leave the email field blank.");
      return;
    }

    setFeedbackStatus("saving");
    setFeedbackMessage("Saving your feedback…");

    const submittedAtUtc = new Date().toISOString();
    const feedback: PostTestFeedbackPayload = {
      overallValueRating: postTestValue,
      wouldConsiderUse,
      pilotInterest,
      feedbackText: feedbackText.trim().slice(0, 1000),
      submittedAtUtc,
    };

    const feedbackSaved = await submitSession(
      "acknowledged_closed",
      activeEvent,
      feedback,
    );
    if (!feedbackSaved) {
      setFeedbackStatus("failed");
      setFeedbackMessage(
        "Your feedback could not be confirmed by the research service. Please retry.",
      );
      return;
    }

    try {
      if (email) {
        const lead: LeadRecord = {
          schema_version: SCHEMA_VERSION,
          lead_id: feedbackLeadIdRef.current,
          submitted_at_utc: submittedAtUtc,
          name: null,
          phone_country_code: null,
          phone_number: null,
          email,
          role_interest: ROLE_INTEREST_LABELS[state.participantType],
          source_cta: "post_test_feedback",
          contact_consent: true,
          consent_text_version: CONTACT_CONSENT_VERSION,
        };
        await researchLogger.submitLead(
          lead,
          {
            honeypot: "",
            elapsedMs: Math.max(
              0,
              Date.now() -
                (feedbackStartedAtRef.current || Date.now()),
            ),
          },
          "post_test_feedback",
        );
      }

      researchLogger.log("post_test_feedback_submitted", {
        roleMode: "caregiver",
        workflowStep: "acknowledged_closed",
        source: "post_test_questionnaire",
        properties: {
          overall_value_rating: postTestValue,
          would_consider_use: wouldConsiderUse,
          pilot_interest: pilotInterest,
          email_provided: Boolean(email),
        },
      });
      await researchLogger.flush();

      setFeedbackStatus("saved");
      setFeedbackMessage(
        email
          ? "Thank you. Your feedback and contact interest were confirmed."
          : state.analyticsConsent === "allowed"
            ? "Thank you. Your anonymous feedback was confirmed."
            : "Thank you. Anonymous research storage was declined, so the feedback remained on this device.",
      );
    } catch {
      setFeedbackStatus("failed");
      setFeedbackMessage(
        "Your test feedback was saved, but contact information was not confirmed. Please retry.",
      );
    }
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

        <div className="post-test-feedback" aria-labelledby="post-test-feedback-title">
          <div className="post-test-feedback-heading">
            <p className="eyebrow">Quick feedback</p>
            <h2 id="post-test-feedback-title">Help us improve Memolens</h2>
            <p>
              Three quick questions help us understand usefulness and future interest.
              Email and written feedback are optional.
            </p>
          </div>

          {feedbackStatus === "saved" ? (
            <div className="feedback-thank-you" role="status">
              <ShieldCheck size={22} />
              <div>
                <strong>Feedback received</strong>
                <span>{feedbackMessage}</span>
              </div>
            </div>
          ) : (
            <div className="feedback-grid">
              <fieldset className="feedback-question">
                <legend>
                  Overall, how valuable would a system like Memolens be in your caregiving/work situation?
                </legend>
                <div className="rating-row" role="group" aria-label="Overall value rating">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      className={postTestValue === rating ? "rating-button selected" : "rating-button"}
                      type="button"
                      key={rating}
                      aria-pressed={postTestValue === rating}
                      onClick={() => {
                        setPostTestValue(rating);
                        setFeedbackStatus("idle");
                        setFeedbackMessage("");
                      }}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
                <div className="rating-scale">
                  <span>Low value</span>
                  <span>Very valuable</span>
                </div>
              </fieldset>

              <ChoiceQuestion
                legend="Would you consider using Memolens if it became available?"
                value={wouldConsiderUse}
                onChange={(value) => {
                  setWouldConsiderUse(value);
                  setFeedbackStatus("idle");
                  setFeedbackMessage("");
                }}
              />

              <ChoiceQuestion
                legend="Would you be interested in a future pilot?"
                value={pilotInterest}
                onChange={(value) => {
                  setPilotInterest(value);
                  setFeedbackStatus("idle");
                  setFeedbackMessage("");
                }}
              />

              <div className="field">
                <label htmlFor="post-test-feedback-text">We value your feedback <span className="optional-label">Optional</span></label>
                <textarea
                  id="post-test-feedback-text"
                  rows={3}
                  maxLength={1000}
                  value={feedbackText}
                  onChange={(event) => setFeedbackText(event.target.value)}
                  placeholder="What was most valuable, or what should we improve?"
                />
                <span className="field-hint">
                  Please do not include names, medications, diagnoses, doses, or other identifying health information.
                </span>
              </div>

              <div className="field">
                <label htmlFor="post-test-email">Your email for future contacts <span className="optional-label">Optional</span></label>
                <input
                  id="post-test-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={254}
                  value={feedbackEmail}
                  onChange={(event) => setFeedbackEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                <span className="field-hint">
                  If you provide an email, you agree that Memolens may contact you about future testing or pilot opportunities.
                </span>
              </div>

              {feedbackStatus === "failed" ? (
                <p className="form-error" role="alert">{feedbackMessage}</p>
              ) : null}

              <button
                className="button button-primary feedback-submit"
                type="button"
                onClick={submitPostTestFeedback}
                disabled={feedbackStatus === "saving"}
              >
                {feedbackStatus === "saving" ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}
                {feedbackStatus === "saving" ? "Saving feedback…" : "Submit feedback"}
              </button>
            </div>
          )}
        </div>

        <div className="completion-actions">
          <button className="button button-primary" type="button" onClick={onClearSession}>
            Start a new safe-prop test
          </button>
          <button
            className="button button-ghost danger-text"
            type="button"
            onClick={() => onDeleteEvent(activeEvent)}
          >
            <Trash2 size={18} /> Delete Memo
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
            <h1 id="inbox-title">Memo inbox</h1>
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
            <h2>No Memos yet</h2>
            <p>Complete a safe test to create a Memo.</p>
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
                    <p>Memo ready for review</p>
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
                    <Trash2 size={18} /> Delete Memo
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
          <p className="eyebrow">Memo ready for review</p>
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
        Skip Memo review
      </button>
      <p className="review-gate-status">
        Memo review: <strong>{activeEvent.videoReviewStatus.replaceAll("_", " ")}</strong>
      </p>

      <div className="review-details-grid">
        <div>
          <span>Scheduled time</span>
          <strong>{formatDateTime(activeEvent.scheduledAt)}</strong>
        </div>
        <div>
          <span>Memo time</span>
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
        <legend>Review outcome</legend>
        <p>Memolens does not decide what happened. Review the Memo and choose whether follow-up is needed.</p>
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
            <label htmlFor="zero-touch">Routine completed without required care recipient screen interaction?</label>
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
            <label htmlFor="interaction-count">Number of required care recipient interactions</label>
            <input
              id="interaction-count"
              type="number"
              min={0}
              max={99}
              value={observation.careRecipientInteractionCount}
              onChange={(event) =>
                dispatch({
                  type: "SET_OBSERVATIONS",
                  changes: { careRecipientInteractionCount: Math.min(99, Math.max(0, Number(event.target.value))) },
                })
              }
            />
            <span className="field-hint">Do not count use of the optional privacy-stop control.</span>
          </div>
          <ObservationSelect
            id="prompt-understandable"
            label="Was the reminder understandable?"
            value={observation.promptComprehension}
            options={["yes", "no", "unsure"]}
            onChange={(value) =>
              dispatch({ type: "SET_OBSERVATIONS", changes: { promptComprehension: value as typeof observation.promptComprehension } })
            }
          />
          <ObservationSelect
            id="clip-useful"
            label="Was the Memo useful?"
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
          <Check size={18} /> Finish review
        </button>
        <button className="button button-secondary" type="button" onClick={keepOpen}>
          Keep open for follow-up
        </button>
        <button className="button button-ghost danger-text" type="button" onClick={() => onDeleteEvent(activeEvent)}>
          <Trash2 size={18} /> Delete Memo
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
