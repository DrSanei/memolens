import { describe, expect, it } from "vitest";
import { buildTestSessionRecord } from "../src/components/test/CaregiverReview";
import {
  createInitialState,
  memolensReducer,
} from "../src/state/context";
import { researchLogger } from "../src/services/researchLogger";
import type { MedicationEvent } from "../src/types";

describe("Memolens workflow reducer", () => {
  it("tracks genuine state transitions and the furthest step", () => {
    const initial = createInitialState();
    const setup = memolensReducer(initial, {
      type: "SET_WORKFLOW",
      step: "caregiver_setup",
    });
    const armed = memolensReducer(setup, { type: "SET_WORKFLOW", step: "armed" });
    const careRecipient = memolensReducer(armed, { type: "SET_ROLE", role: "care_recipient" });
    const backToSetup = memolensReducer(careRecipient, {
      type: "SET_WORKFLOW",
      step: "caregiver_setup",
    });

    expect(careRecipient.role).toBe("care_recipient");
    expect(backToSetup.workflow).toBe("caregiver_setup");
    expect(backToSetup.furthestStep).toBe("armed");
  });

  it("switches roles without removing in-memory event media", () => {
    const initial = createInitialState();
    const blob = new Blob(["video"], { type: "video/webm" });
    const event: MedicationEvent = {
      id: crypto.randomUUID(),
      routineId: initial.activeRoutineId,
      routineLabel: "Morning medication routine",
      scheduledAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: 5,
      blobBytes: blob.size,
      blob,
      objectUrl: "blob:test",
      promptDelivered: true,
      promptRepeatCount: 1,
      captureStatus: "evidence_available",
      technicalErrors: [],
      caregiverNote: "",
      videoReviewStatus: "not_reviewed",
      privacyStop: false,
      closed: false,
    };
    const withEvent = memolensReducer(initial, { type: "ADD_EVENT", event });
    const careRecipient = memolensReducer(withEvent, { type: "SET_ROLE", role: "care_recipient" });
    const caregiver = memolensReducer(careRecipient, { type: "SET_ROLE", role: "caregiver" });

    expect(caregiver.events[0].blob).toBe(blob);
    expect(caregiver.events[0].objectUrl).toBe("blob:test");
  });

  it("builds a minimized final test-session summary without media", () => {
    researchLogger.resetForTests();
    const state = createInitialState();
    state.analyticsConsent = "allowed";
    state.participantCode = "DEMO-009";
    state.timing.testStartedAt = "2026-08-16T12:00:00.000Z";
    state.timing.reviewStartedAt = "2026-08-16T12:01:00.000Z";
    state.timing.reviewEndedAt = "2026-08-16T12:01:20.000Z";
    state.observations.clipUsefulness = "yes";
    const routine = state.routines[0];
    const event: MedicationEvent = {
      id: crypto.randomUUID(),
      routineId: routine.id,
      routineLabel: routine.label,
      scheduledAt: "2026-08-16T12:00:05.000Z",
      startedAt: "2026-08-16T12:00:05.000Z",
      endedAt: "2026-08-16T12:00:20.000Z",
      durationSeconds: 15,
      blobBytes: 1024,
      blob: new Blob(["private media"]),
      objectUrl: "blob:private-media",
      promptDelivered: true,
      promptRepeatCount: 1,
      captureStatus: "evidence_available",
      technicalErrors: [],
      caregiverNote: "Local-only caregiver note",
      caregiverDisposition: "appears_completed",
      videoReviewStatus: "completed",
      privacyStop: false,
      closed: true,
    };

    const summary = buildTestSessionRecord(
      state,
      routine,
      event,
      "acknowledged_closed",
    );
    const serialized = JSON.stringify(summary);

    expect(summary.review_duration_seconds).toBe(20);
    expect(summary.recording_blob_bytes).toBe(1024);
    expect(summary.caregiver_disposition).toBe("appears_completed");
    expect(serialized).not.toContain("private media");
    expect(serialized).not.toContain("blob:private-media");
    expect(serialized).not.toContain("Local-only caregiver note");
    expect(serialized).not.toContain(routine.typedPrompt);
  });
});
