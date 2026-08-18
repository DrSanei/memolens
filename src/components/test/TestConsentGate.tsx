"use client";

import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PRODUCT_BOUNDARY } from "../../constants";
import { useMemolens } from "../../state/context";
import { researchLogger } from "../../services/researchLogger";

const CONFIRMATIONS = [
  "I have permission from everyone who may be recorded.",
  "I will use an empty pillbox or another safe non-medication prop.",
  "I understand the recording stays on this device and may be lost on refresh or close.",
  "I understand Memolens does not verify medication ingestion or provide medication decisions.",
];

export function TestConsentGate() {
  const navigate = useNavigate();
  const { state, dispatch } = useMemolens();
  const [checked, setChecked] = useState<boolean[]>(() => CONFIRMATIONS.map(() => false));
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    researchLogger.logViewOnce("test-consent", "consent_viewed", {
      roleMode: "caregiver",
      workflowStep: "consent",
    });
  }, []);

  const continueToSetup = () => {
    if (!checked.every(Boolean)) {
      setShowError(true);
      return;
    }
    researchLogger.startNewTestSession();
    const now = new Date().toISOString();
    dispatch({ type: "SET_TEST_CONSENT", value: true });
    dispatch({ type: "SET_WORKFLOW", step: "caregiver_setup" });
    dispatch({ type: "SET_TIMING", changes: { testStartedAt: now, setupStartedAt: now } });
    researchLogger.log("test_consent_completed", {
      roleMode: "caregiver",
      workflowStep: "consent",
    });
    researchLogger.logViewOnce("caregiver-setup", "caregiver_setup_viewed", {
      roleMode: "caregiver",
      workflowStep: "caregiver_setup",
    });
    researchLogger.log("caregiver_setup_started", {
      roleMode: "caregiver",
      workflowStep: "caregiver_setup",
    });
  };

  const returnHome = () => {
    researchLogger.log("test_consent_cancelled", {
      roleMode: "caregiver",
      workflowStep: "consent",
    });
    navigate("/");
  };

  return (
    <section className="workflow-card consent-gate" aria-labelledby="test-consent-title">
      <span className="large-icon" aria-hidden="true">
        <ShieldCheck size={28} />
      </span>
      <p className="eyebrow">Safe, supervised demonstration</p>
      <h1 id="test-consent-title">Before you test Memolens</h1>
      <p className="lead-copy">
        This test briefly records camera and microphone input. Please complete each
        confirmation before caregiver setup.
      </p>

      <div className="consent-list">
        {CONFIRMATIONS.map((label, index) => (
          <label className="check-row consent-check" key={label}>
            <input
              type="checkbox"
              checked={checked[index]}
              onChange={(event) => {
                setChecked((current) =>
                  current.map((value, itemIndex) =>
                    itemIndex === index ? event.target.checked : value,
                  ),
                );
                setShowError(false);
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {state.analyticsConsent === "allowed" ? (
        <p className="notice-soft">
          Structured workflow events, technical results, and your test ratings will be sent
          to the private Memolens Supabase database. No recording or audio will be transmitted.
        </p>
      ) : (
        <p className="notice-soft">
          Anonymous research logging is not enabled. The full test remains available and no
          behavioral telemetry will be transmitted.
        </p>
      )}

      <p className="product-boundary-inline">{PRODUCT_BOUNDARY}</p>

      {showError ? (
        <p className="form-error" role="alert">
          Confirm all four statements to continue.
        </p>
      ) : null}

      <div className="split-actions">
        <button className="button button-ghost" type="button" onClick={returnHome}>
          <ArrowLeft size={18} /> Return home
        </button>
        <button className="button button-primary" type="button" onClick={continueToSetup}>
          Continue to caregiver setup <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}
