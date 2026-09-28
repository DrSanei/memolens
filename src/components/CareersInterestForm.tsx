import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CONTACT_CONSENT_VERSION, SCHEMA_VERSION } from "../constants";
import { researchLogger, type LeadRecord } from "../services/researchLogger";
import { createUuid } from "../utils/uuid";

const INTERESTS = [
  "Family member",
  "Caregiver",
  "Doctor or clinician",
  "Potential teammate",
  "Investor or partner",
];

export function CareersInterestForm() {
  const [openedAt] = useState(() => Date.now());
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [mobile, setMobile] = useState("");
  const [interest, setInterest] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "pending" || status === "success") return;
    setError("");

    const fullName = name.trim();
    const code = countryCode.trim();
    const digits = mobile.replace(/\D/g, "");
    if (fullName.length < 2) return setError("Please enter your name.");
    if (!/^\+[1-9]\d{0,3}$/.test(code)) return setError("Enter a country calling code, such as +1.");
    if (!/^\d{6,18}$/.test(digits)) return setError("Enter a valid mobile number.");
    if (!INTERESTS.includes(interest)) return setError("Choose how you would like to be involved.");
    if (!consent) return setError("Please agree to be contacted about your interest.");
    const elapsedMs = Date.now() - openedAt;
    if (elapsedMs < 1200) return setError("Please review the form and try again in a moment.");

    const lead: LeadRecord = {
      schema_version: SCHEMA_VERSION,
      lead_id: createUuid(),
      submitted_at_utc: new Date().toISOString(),
      name: fullName.slice(0, 100),
      phone_country_code: code,
      phone_number: digits,
      role_interest: interest,
      source_cta: "careers_interest",
      contact_consent: true,
      consent_text_version: CONTACT_CONSENT_VERSION,
    };

    setStatus("pending");
    try {
      await researchLogger.submitLead(lead, { honeypot, elapsedMs }, "careers_form");
      setStatus("success");
    } catch {
      setStatus("error");
      setError("We could not save your details. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="careers-form-card careers-success" role="status">
        <CheckCircle2 size={34} aria-hidden="true" />
        <h3>Thank you for reaching out.</h3>
        <p>We have your details and will contact you soon.</p>
      </div>
    );
  }

  return (
    <form className="careers-form-card form-stack" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="careers-name">Your name</label>
        <input id="careers-name" autoComplete="name" maxLength={100} required
          value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="careers-mobile">Mobile number</label>
        <div className="phone-grid">
          <input aria-label="Country calling code" type="tel" inputMode="tel"
            autoComplete="tel-country-code" maxLength={5} value={countryCode}
            onChange={(event) => setCountryCode(event.target.value)} />
          <input id="careers-mobile" type="tel" inputMode="tel" autoComplete="tel-national"
            maxLength={24} required value={mobile}
            onChange={(event) => setMobile(event.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="careers-interest-kind">I&apos;m interested as a…</label>
        <select id="careers-interest-kind" required value={interest}
          onChange={(event) => setInterest(event.target.value)}>
          <option value="">Choose an option</option>
          {INTERESTS.map((label) => <option key={label} value={label}>{label}</option>)}
        </select>
      </div>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="careers-website">Website</label>
        <input id="careers-website" tabIndex={-1} autoComplete="off"
          value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
      </div>
      <label className="check-row" htmlFor="careers-consent">
        <input id="careers-consent" type="checkbox" required checked={consent}
          onChange={(event) => setConsent(event.target.checked)} />
        <span>I agree that Memolenz may store my name, mobile number, and interest and contact me about getting involved. See our <Link to="/privacy">Privacy page</Link>.</span>
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" type="submit" disabled={status === "pending"}>
        {status === "pending" ? <><LoaderCircle className="spin" size={18} /> Sending…</> : <>
          Get in touch <ArrowRight size={18} aria-hidden="true" />
        </>}
      </button>
      <p className="careers-form-note">Your contact details are separate from optional anonymous research analytics.</p>
    </form>
  );
}
