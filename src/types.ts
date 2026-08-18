export type AnalyticsConsent = "unknown" | "allowed" | "declined";

export type RoleMode = "caregiver" | "wearer";

export type WorkflowStep =
  | "consent"
  | "caregiver_setup"
  | "preflight"
  | "armed"
  | "capture_starting"
  | "recording"
  | "processing"
  | "evidence_available"
  | "caregiver_inbox"
  | "caregiver_review"
  | "acknowledged_closed";

export type TestIntent = "run_now" | "scheduled";

export type ResearchTestCondition =
  | "live_unscripted"
  | "clear_role_played_routine"
  | "silent_role_played_routine"
  | "no_activity"
  | "role_played_uncertainty"
  | "obstructed_camera"
  | "privacy_stop"
  | "technical_failure_test";

export type ParticipantType =
  | "family_caregiver"
  | "professional_caregiver"
  | "healthcare_professional"
  | "researcher"
  | "potential_partner"
  | "other";

export type CameraPreference = "environment" | "user";

export interface Routine {
  id: string;
  label: string;
  scheduledTime: string;
  day: "today";
  timezone: string;
  typedPrompt: string;
  promptType: "typed" | "caregiver_voice";
  promptPreviewed: boolean;
  voicePromptUrl?: string;
  voicePromptBlob?: Blob;
  maxDurationSeconds: number;
  repeatDelaySeconds: 15;
  maxRepeats: number;
  cameraPreference: CameraPreference;
  saved: boolean;
}

export type PermissionState = "unknown" | "granted" | "denied";

export interface PreflightState {
  secureContext: boolean;
  mediaDevices: boolean;
  mediaRecorder: boolean;
  speechSynthesis: boolean;
  visibility: "visible" | "hidden";
  cameraPermission: PermissionState;
  microphonePermission: PermissionState;
  previewReady: boolean;
  promptPlayback: "untested" | "passed" | "failed";
  selectedCameraLabel: string;
  selectedDeviceId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export type CaptureStatus =
  | "evidence_available"
  | "capture_incomplete"
  | "capture_unavailable"
  | "stopped_by_wearer";

export type CaregiverDisposition =
  | "appears_completed"
  | "uncertain_follow_up"
  | "wearer_requested_help"
  | "no_usable_evidence"
  | "false_alert"
  | "technical_failure";

export type VideoReviewStatus = "not_reviewed" | "started" | "completed" | "skipped";

export interface MedicationEvent {
  id: string;
  routineId: string;
  routineLabel: string;
  scheduledAt: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  blobBytes: number;
  blob?: Blob;
  objectUrl?: string;
  promptDelivered: boolean;
  promptRepeatCount: number;
  captureStatus: CaptureStatus;
  technicalErrors: string[];
  caregiverNote: string;
  caregiverDisposition?: CaregiverDisposition;
  acknowledgementAt?: string;
  videoReviewStatus: VideoReviewStatus;
  privacyStop: boolean;
  closed: boolean;
}

export interface ResearchObservations {
  zeroTouchSuccess: "" | "yes" | "no";
  wearerInteractionCount: number;
  promptComprehension: "" | "yes" | "no" | "unsure";
  clipUsefulness: "" | "yes" | "no" | "partly";
  falseReassurance: "" | "yes" | "no";
  reviewBurden: "" | "easy" | "acceptable" | "difficult";
  privacyRating: "" | "1" | "2" | "3" | "4" | "5";
  researchNotes: string;
}

export type ResearchSaveStatus = "idle" | "saving" | "saved" | "failed";

export interface TestTiming {
  testStartedAt?: string;
  setupStartedAt?: string;
  setupCompletedAt?: string;
  armedAt?: string;
  recordingStartedAt?: string;
  recordingEndedAt?: string;
  reviewStartedAt?: string;
  reviewEndedAt?: string;
}

