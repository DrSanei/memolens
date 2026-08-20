import { useEffect } from "react";
import {
  BrowserRouter,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { LandingPage } from "./routes/Landing";
import { PrivacyPage } from "./routes/Privacy";
import { TestPage } from "./routes/Test";
import { KpiPage } from "./routes/Kpi";
import { MemolensProvider, useMemolens } from "./state/context";
import { researchLogger } from "./services/researchLogger";

function LifecycleEffects() {
  const { state } = useMemolens();

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") researchLogger.flushWhenHidden();
    };
    const onBeforeUnload = () => {
      if (
        window.location.pathname === "/test" &&
        state.workflow !== "consent" &&
        state.workflow !== "acknowledged_closed"
      ) {
        researchLogger.log("session_abandoned", {
          roleMode: state.role,
          workflowStep: state.workflow,
          properties: {
            furthest_step: state.furthestStep,
            closed: false,
          },
        });
      }
      researchLogger.flushWhenHidden();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [state.furthestStep, state.role, state.workflow]);

  return null;
}

function AppRoutes() {
  return (
    <>
      <LifecycleEffects />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/kpi" element={<KpiPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export function MemolensApp({ initialPath = "/" }: { initialPath?: string }) {
  return (
    <MemolensProvider>
      {typeof window === "undefined" ? (
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes />
        </MemoryRouter>
      ) : (
        <BrowserRouter
          basename={
            import.meta.env.BASE_URL === "/"
              ? undefined
              : import.meta.env.BASE_URL.replace(/\/$/, "")
          }
        >
          <AppRoutes />
        </BrowserRouter>
      )}
    </MemolensProvider>
  );
}