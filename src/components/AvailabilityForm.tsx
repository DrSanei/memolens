import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { CONTACT_CONSENT_VERSION, SCHEMA_VERSION } from "../constants";
import { researchLogger, type LeadRecord } from "../services/researchLogger";
import { createUuid } from "../utils/uuid";

const SOURCE_CTA = "intro_video_notify";

export function AvailabilityForm() {
  const [openedAt] = useState(() => Date.now());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "pending" || status === "success") return;
    setError("");
    const fullName = name.trim();
    const contactEmail = email.trim();
    const digits = phone.replace(/\D/g, "");
    const code = countryCode.trim();
    const elapsedMs = Date.now() - openedAt;

    if (fullName.length < 2) return setError("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return setError("Enter a valid email address.");
    }
    if (digits && (!/^\+[1-9]\d{0,3}$/.test(code) || !/^\d{6,18}$/.test(digits))) {
      return setError("Enter a valid phone number and country code, or leave phone blank.");
    }
    if (!consent) return setError("Please agree to be contacted about Memolenz updates.");
    if (elapsedMs < 1200) return setError("Please review the form and try again in a moment.");

    const lead: LeadRecord = {
      schema_version: SCHEMA_VERSION,
      lead_id: createUuid(),
      submitted_at_utc: new Date().toISOString(),
      name: fullName.slice(0, 100),
      email: contactEmail.slice(0, 254),
      phone_country_code: digits ? code : null,
      phone_number: digits || null,
      role_interest: "Other",
      source_cta: SOURCE_CTA,
      contact_consent: true,
      consent_text_version: CONTACT_CONSENT_VERSION,
    };

    setStatus("pending");
    try {
      await researchLogger.submitLead(lead, { honeypot, elapsedMs });
      setStatus("success");
    } catch {
      setStatus("error");
      setError("We could not save your request. Please try again.");
      researchLogger.log("preorder_submission_failed", {
        ctaId: SOURCE_CTA,
        source: "preorder_form",
      });
    }
  }

  if (status === "success") {
    return (
      <div className="intro-availability-success" role="status">
        <h3>Thank you for your interest.</h3>
        <p>We have your request and may email you about future Memolenz availability.</p>
      </div>
    );
  }

  return (
    <form className="intro-availability-form" onSubmit={submit} noValidate>
      <h3>Get Memolenz updates</h3>
      <p>Leave your details if you would like to hear about future availability.</p>
      <div className="intro-availability-fields">
        <div className="field">
          <label htmlFor="availability-name">Full name</label>
          <input id="availability-name" autoComplete="name" maxLength={100}
            value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="availability-email">Email</label>
          <input id="availability-email" type="email" autoComplete="email" maxLength={254}
            value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="field intro-availability-phone">
          <label htmlFor="availability-phone">Phone number (optional)</label>
          <div className="intro-availability-phone-inputs">
            <input aria-label="Country calling code" type="tel" inputMode="tel"
              autoComplete="tel-country-code" maxLength={5} value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)} />
            <input id="availability-phone" type="tel" inputMode="tel" autoComplete="tel-national"
              value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
        </div>
      </div>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="availability-website">Website</label>
        <input id="availability-website" tabIndex={-1} autoComplete="off"
          value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
      </div>
      <label className="check-row" htmlFor="availability-consent">
        <input id="availability-consent" type="checkbox" checked={consent}
          onChange={(event) => setConsent(event.target.checked)} required />
        <span>I agree that the Memolenz team may store my contact details and contact me about future availability and product updates.</span>
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" type="submit" disabled={status === "pending"}>
        {status === "pending" ? <><LoaderCircle className="spin" size={18} /> Saving...</> : "Notify Me"}
      </button>
      <p className="microcopy">Your contact details are kept separate from optional anonymous research analytics.</p>
    </form>
  );
}
