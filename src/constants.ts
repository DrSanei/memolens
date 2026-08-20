import type {
  ParticipantType,
  ResearchObservations,
  ResearchTestCondition,
  Routine,
  WorkflowStep,
} from "./types";

export const SCHEMA_VERSION = "1.0";
export const ANALYTICS_CONSENT_VERSION = "2026-08-16.v1";
export const TEST_CONSENT_VERSION = "2026-08-16.v1";
export const CONTACT_CONSENT_VERSION = "2026-08-16.v1";

export const PRODUCT_BOUNDARY =
  "Memolens is a supervised research prototype. It supports reminders and caregiver review, but it does not determine whether medication was taken or make medication decisions.";

export const DEFAULT_PROMPT =
  "Hi Mom, it’s time for your medication. Please go ahead and take your pills.";

export const WORKFLOW_RANK: Record<WorkflowStep, number> = {
  consent: 0,
  caregiver_setup: 1,
  preflight: 2,
  armed: 3,
  capture_starting: 4,
  recording: 5,
  processing: 6,
  evidence_available: 7,
  caregiver_inbox: 8,
  caregiver_review: 9,
  acknowledged_closed: 10,
};

export function defaultScheduledTime(): string {
  const date = new Date(Date.now() + 2 * 60 * 1000);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function createAnonymousTestCode(): string {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const randomPart = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase();

  return `MEM-${datePart}-${randomPart}`;
}

export function createDefaultRoutine(index = 1): Routine {
  return {
    id: crypto.randomUUID(),
    label: index === 1 ? "Morning medication routine" : `Medication routine ${index}`,
    scheduledTime: defaultScheduledTime(),
    scheduleMode: "every_day",
    daysOfWeek: [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    typedPrompt: DEFAULT_PROMPT,
    promptType: "typed",
    promptPreviewed: false,
    maxDurationSeconds: 45,
    repeatDelaySeconds: 15,
    maxRepeats: 1,
    cameraPreference: "environment",
    saved: false,
  };
}

export const EMPTY_OBSERVATIONS: ResearchObservations = {
  zeroTouchSuccess: "",
  careRecipientInteractionCount: 0,
  promptComprehension: "",
  clipUsefulness: "",
  falseReassurance: "",
  reviewBurden: "",
  privacyRating: "",
  researchNotes: "",
};

export const PARTICIPANT_OPTIONS: Array<{ value: ParticipantType; label: string }> = [
  { value: "family_caregiver", label: "Family caregiver" },
  { value: "professional_caregiver", label: "Professional caregiver" },
  { value: "healthcare_professional", label: "Healthcare professional" },
  { value: "researcher", label: "Researcher" },
  { value: "potential_partner", label: "Potential partner" },
  { value: "other", label: "Other" },
];

export const TEST_CONDITION_OPTIONS: Array<{
  value: ResearchTestCondition;
  label: string;
}> = [
  { value: "live_unscripted", label: "Live unscripted" },
  { value: "clear_role_played_routine", label: "Clear role-played routine" },
  { value: "silent_role_played_routine", label: "Silent role-played routine" },
  { value: "no_activity", label: "No activity" },
  { value: "role_played_uncertainty", label: "Role-played uncertainty" },
  { value: "obstructed_camera", label: "Obstructed camera" },
  { value: "privacy_stop", label: "Privacy stop" },
  { value: "technical_failure_test", label: "Technical-failure test" },
];

