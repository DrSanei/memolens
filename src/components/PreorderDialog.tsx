"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CONTACT_CONSENT_VERSION, SCHEMA_VERSION } from "../constants";
import { useMemolens } from "../state/context";
import { researchLogger, type LeadRecord } from "../services/researchLogger";

interface PreorderDialogProps {
  sourceCta: string;
  onClose: () => void;
}

const ROLE_OPTIONS = [
  "Family caregiver",
  "Professional caregiver",
  "Healthcare professional",
  "Researcher",
  "Potential partner",
  "Other",
];

function normalizeCountryCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits ? `+${digits}` : "+";
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 20);
}

export function PreorderDialog({ sourceCta, onClose }: PreorderDialogProps) {
  const { state } = useMemolens();
  const [openedAt] = useState(() => Date.now());
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [roleInterest, setRoleInterest] = useState(ROLE_OPTIONS[0]);
  const [contactConsent, setContactConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && status !== "pending") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, status]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const elapsedMs = Date.now() - openedAt;
    const normalizedCode = normalizeCountryCode(countryCode);
    const normalizedNumber = normalizePhoneNumber(phoneNumber);

    if (name.trim().length < 2) {
      setError("Enter your name.");
      return;
    }
    if (!/^\+\d{1,4}$/.test(normalizedCode)) {
      setError("Enter a valid country calling code, including +.");
      return;
    }
    if (normalizedNumber.length < 6) {
      setError("Enter a valid phone number.");
      return;
    }
    if (!contactConsent) {
      setError("Contact consent is required before submission.");
      return;
    }
    if (elapsedMs < 1200) {
      setError("Please review the form, then try again in a moment.");
      return;
    }

    const lead: LeadRecord = {
      schema_version: SCHEMA_VERSION,
      lead_id: crypto.randomUUID(),
      submitted_at_utc: new Date().toISOString(),
      name: name.trim().slice(0, 100),
      phone_country_code: normalizedCode,
      phone_number: normalizedNumber,
      role_interest: roleInterest,
      source_cta: sourceCta,
      contact_consent: true,
      consent_text_version: CONTACT_CONSENT_VERSION,
    };

    setStatus("pending");
    try {
      await researchLogger.submitLead(lead, { honeypot, elapsedMs });
      setStatus("success");
    } catch {
      setStatus("error");
      setError(
        "We could not confirm that your contact details were saved. Nothing is submitted. Please retry.",
      );
      if (state.analyticsConsent === "allowed") {
        researchLogger.log("preorder_submission_failed", {
          ctaId: sourceCta,
          source: "preorder_form",
          properties: { role_interest: roleInterest },
        });
      }
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preorder-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          className="icon-button dialog-close"
          type="button"
          aria-label="Close pre-order form"
          onClick={onClose}
          disabled={status === "pending"}
        >
          <X size={21} />
        </button>

        {status === "success" ? (
          <div className="success-panel" aria-live="polite">
            <span className="success-icon" aria-hidden="true">
              <Check size={24} />
            </span>
            <p className="eyebrow">Confirmed</p>
            <h2 id="preorder-title">Thank you for your interest.</h2>
            <p>
              Supabase acknowledged your submission. We may
              contact you about prototype testing, pilots, or product updates.
            </p>
            <button className="button button-primary" type="button" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="eyebrow">Stay close to the project</p>
            <h2 id="preorder-title">Pre-order interest</h2>
            <p className="dialog-intro">
              Share your details if you would like to hear about supervised prototype tests,
              pilots, or Memolens product updates.
            </p>
            <form className="form-stack" onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="lead-name">Name</label>
                <input
                  id="lead-name"
                  autoComplete="name"
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="phone-grid">
                <div className="field">
                  <label htmlFor="country-code">Country code</label>
                  <input
                    id="country-code"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-country-code"
                    value={countryCode}
                    onChange={(event) => setCountryCode(normalizeCountryCode(event.target.value))}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="phone-number">Phone number</label>
                  <input
                    id="phone-number"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="role-interest">Role or interest</label>
                <select
                  id="role-interest"
                  value={roleInterest}
                  onChange={(event) => setRoleInterest(event.target.value)}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="honeypot" aria-hidden="true">
                <label htmlFor="company-website">Company website</label>
                <input
                  id="company-website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                />
              </div>
              <label className="check-row" htmlFor="contact-consent">
                <input
                  id="contact-consent"
                  type="checkbox"
                  checked={contactConsent}
                  onChange={(event) => setContactConsent(event.target.checked)}
                  required
                />
                <span>
                  I agree that the Memolens team may store this information and contact me
                  about prototype testing, pilots, or product updates.
                </span>
              </label>
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                className="button button-primary button-full"
                type="submit"
                disabled={status === "pending"}
              >
                {status === "pending" ? (
                  <>
                    <LoaderCircle className="spin" size={18} /> Awaiting confirmation…
                  </>
                ) : status === "error" ? (
                  "Retry submission"
                ) : (
                  "Submit interest"
                )}
              </button>
              <p className="microcopy">
                Contact information is stored only in the private <code>leads</code> table and is not
                added to test analytics.
              </p>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
