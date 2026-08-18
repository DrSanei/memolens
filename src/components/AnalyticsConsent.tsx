"use client";

import { ShieldCheck } from "lucide-react";
import { ANALYTICS_CONSENT_VERSION } from "../constants";
import { useMemolens } from "../state/context";
import { researchLogger } from "../services/researchLogger";

export function AnalyticsConsentChoice() {
  const { state, dispatch } = useMemolens();
  if (state.analyticsConsent !== "unknown") return null;

  const allow = () => {
    const at = new Date().toISOString();
    dispatch({ type: "SET_ANALYTICS_CONSENT", value: "allowed", at });
    researchLogger.allowAnalytics();
  };

  const decline = () => {
    dispatch({ type: "SET_ANALYTICS_CONSENT", value: "declined" });
    researchLogger.declineAnalytics();
  };

  return (
    <aside
      className="analytics-choice"
      aria-labelledby="analytics-consent-title"
      data-consent-version={ANALYTICS_CONSENT_VERSION}
    >
      <div className="analytics-icon" aria-hidden="true">
        <ShieldCheck size={22} />
      </div>
      <div className="analytics-copy">
        <h2 id="analytics-consent-title">A small research choice</h2>
        <p>
          Help us evaluate Memolens by sharing anonymous interaction data such as page
          views, button presses, workflow progress, technical results, and test ratings.
          Recordings, audio, phone numbers, medication details, and typed form content are
          not included.
        </p>
      </div>
      <div className="analytics-actions">
        <button className="button button-primary button-small" type="button" onClick={allow}>
          Allow anonymous research data
        </button>
        <button className="button button-ghost button-small" type="button" onClick={decline}>
          Continue without analytics
        </button>
      </div>
    </aside>
  );
}
