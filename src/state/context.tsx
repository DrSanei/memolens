import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
import {
  createAnonymousTestCode,
  createDefaultRoutine,
  EMPTY_OBSERVATIONS,
  WORKFLOW_RANK,
} from "../constants";
import type {
  AnalyticsConsent,
  MedicationEvent,
  ParticipantType,
  PreflightState,
  ResearchObservations,
  ResearchSaveStatus,
  ResearchTestCondition,
  RoleMode,
  Routine,
  TestIntent,
  TestTiming,
  WorkflowStep,
} from "../types";

export interface MemolensState {
  analyticsConsent: AnalyticsConsent;
  analyticsConsentAt?: string;
  workflow: WorkflowStep;
  furthestStep: WorkflowStep;
  role: RoleMode;
  testConsentComplete: boolean;
  routines: Routine[];
  activeRoutineId: string;
  testIntent?: TestIntent;
  participantCode: string;
  participantType: ParticipantType;
  testCondition: ResearchTestCondition;
  preflight: PreflightState;
  events: MedicationEvent[];
  activeEventId?: string;
  observations: ResearchObservations;
  researchSaveStatus: ResearchSaveStatus;
  researchSaveMessage?: string;
  loggingUnavailable: boolean;
  timing: TestTiming;
}

function initialPreflight(): PreflightState {
  return {
    secureContext: typeof window === "undefined" ? true : window.isSecureContext,
    mediaDevices:
      typeof navigator === "undefined" ? false : Boolean(navigator.mediaDevices?.getUserMedia),
    mediaRecorder: typeof MediaRecorder !== "undefined",
    speechSynthesis: typeof window === "undefined" ? false : "speechSynthesis" in window,
    visibility:
      typeof document === "undefined" || document.visibilityState === "visible"
        ? "visible"
        : "hidden",
    cameraPermission: "unknown",
    microphonePermission: "unknown",
    previewReady: false,
    promptPlayback: "untested",
    selectedCameraLabel: "Environment-facing camera",
  };
}

export function createInitialState(): MemolensState {
  const routine = createDefaultRoutine();
  return {
    analyticsConsent: "unknown",
    workflow: "consent",
    furthestStep: "consent",
    role: "caregiver",
    testConsentComplete: false,
    routines: [routine],
    activeRoutineId: routine.id,
    participantCode: createAnonymousTestCode(),
    participantType: "family_caregiver",
    testCondition: "clear_role_played_routine",
    preflight: initialPreflight(),
    events: [],
    observations: { ...EMPTY_OBSERVATIONS },
    researchSaveStatus: "idle",
    loggingUnavailable: false,
    timing: {},
  };
}

export type MemolensAction =
  | { type: "SET_ANALYTICS_CONSENT"; value: AnalyticsConsent; at?: string }
  | { type: "SET_ROLE"; role: RoleMode }
  | { type: "SET_WORKFLOW"; step: WorkflowStep }
  | { type: "SET_TEST_CONSENT"; value: boolean }
  | { type: "SET_TEST_INTENT"; intent: TestIntent }
  | {
      type: "SET_TEST_METADATA";
      participantCode?: string;
      participantType?: ParticipantType;
      testCondition?: ResearchTestCondition;
    }
  | { type: "ADD_ROUTINE"; routine: Routine }
  | { type: "UPDATE_ROUTINE"; id: string; changes: Partial<Routine> }
  | { type: "REMOVE_ROUTINE"; id: string }
  | { type: "SET_ACTIVE_ROUTINE"; id: string }
  | { type: "SET_PREFLIGHT"; changes: Partial<PreflightState> }
  | { type: "RESET_PREFLIGHT" }
  | { type: "ADD_EVENT"; event: MedicationEvent }
  | { type: "UPDATE_EVENT"; id: string; changes: Partial<MedicationEvent> }
  | { type: "DELETE_EVENT"; id: string }
  | { type: "SET_ACTIVE_EVENT"; id?: string }
  | { type: "SET_OBSERVATIONS"; changes: Partial<ResearchObservations> }
  | {
      type: "SET_RESEARCH_SAVE";
      status: ResearchSaveStatus;
      message?: string;
    }
  | { type: "SET_LOGGING_UNAVAILABLE"; value: boolean }
  | { type: "SET_TIMING"; changes: Partial<TestTiming> }
  | { type: "CLEAR_SESSION" };

export function memolensReducer(
  state: MemolensState,
  action: MemolensAction,
): MemolensState {
  switch (action.type) {
    case "SET_ANALYTICS_CONSENT":
      return {
        ...state,
        analyticsConsent: action.value,
        analyticsConsentAt: action.at,
      };
    case "SET_ROLE":
      return { ...state, role: action.role };
    case "SET_WORKFLOW":
      return {
        ...state,
        workflow: action.step,
        furthestStep:
          WORKFLOW_RANK[action.step] > WORKFLOW_RANK[state.furthestStep]
            ? action.step
            : state.furthestStep,
      };
    case "SET_TEST_CONSENT":
      return { ...state, testConsentComplete: action.value };
    case "SET_TEST_INTENT":
      return { ...state, testIntent: action.intent };
    case "SET_TEST_METADATA":
      return {
        ...state,
        participantCode: action.participantCode ?? state.participantCode,
        participantType: action.participantType ?? state.participantType,
        testCondition: action.testCondition ?? state.testCondition,
      };
    case "ADD_ROUTINE":
      return {
        ...state,
        routines: [...state.routines, action.routine],
        activeRoutineId: action.routine.id,
      };
    case "UPDATE_ROUTINE":
      return {
        ...state,
        routines: state.routines.map((routine) =>
          routine.id === action.id ? { ...routine, ...action.changes } : routine,
        ),
      };
    case "REMOVE_ROUTINE": {
      const remaining = state.routines.filter((routine) => routine.id !== action.id);
      if (remaining.length === 0) {
        const replacement = createDefaultRoutine();
        return { ...state, routines: [replacement], activeRoutineId: replacement.id };
      }
      return {
        ...state,
        routines: remaining,
        activeRoutineId:
          state.activeRoutineId === action.id ? remaining[0].id : state.activeRoutineId,
      };
    }
    case "SET_ACTIVE_ROUTINE":
      return { ...state, activeRoutineId: action.id };
    case "SET_PREFLIGHT":
      return { ...state, preflight: { ...state.preflight, ...action.changes } };
    case "RESET_PREFLIGHT":
      return { ...state, preflight: initialPreflight() };
    case "ADD_EVENT":
      return {
        ...state,
        events: [action.event, ...state.events],
        activeEventId: action.event.id,
      };
    case "UPDATE_EVENT":
      return {
        ...state,
        events: state.events.map((event) =>
          event.id === action.id ? { ...event, ...action.changes } : event,
        ),
      };
    case "DELETE_EVENT": {
      const events = state.events.filter((event) => event.id !== action.id);
      return {
        ...state,
        events,
        activeEventId:
          state.activeEventId === action.id ? events[0]?.id : state.activeEventId,
      };
    }
    case "SET_ACTIVE_EVENT":
      return { ...state, activeEventId: action.id };
    case "SET_OBSERVATIONS":
      return { ...state, observations: { ...state.observations, ...action.changes } };
    case "SET_RESEARCH_SAVE":
      return {
        ...state,
        researchSaveStatus: action.status,
        researchSaveMessage: action.message,
      };
    case "SET_LOGGING_UNAVAILABLE":
      return { ...state, loggingUnavailable: action.value };
    case "SET_TIMING":
      return { ...state, timing: { ...state.timing, ...action.changes } };
    case "CLEAR_SESSION": {
      const fresh = createInitialState();
      return {
        ...fresh,
        analyticsConsent: state.analyticsConsent,
        analyticsConsentAt: state.analyticsConsentAt,
      };
    }
    default:
      return state;
  }
}

interface MemolensContextValue {
  state: MemolensState;
  dispatch: Dispatch<MemolensAction>;
  activeRoutine: Routine;
  activeEvent?: MedicationEvent;
}

const MemolensContext = createContext<MemolensContextValue | null>(null);

export function MemolensProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(memolensReducer, undefined, createInitialState);
  const activeRoutine =
    state.routines.find((routine) => routine.id === state.activeRoutineId) ?? state.routines[0];
  const activeEvent = state.events.find((event) => event.id === state.activeEventId);
  const value = useMemo(
    () => ({ state, dispatch, activeRoutine, activeEvent }),
    [state, activeRoutine, activeEvent],
  );

  return <MemolensContext.Provider value={value}>{children}</MemolensContext.Provider>;
}

export function useMemolens(): MemolensContextValue {
  const context = useContext(MemolensContext);
  if (!context) {
    throw new Error("useMemolens must be used within MemolensProvider");
  }
  return context;
}
