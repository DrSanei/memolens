import { ArrowLeft, Database, HardDrive, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import { PRODUCT_BOUNDARY } from "../constants";
import { researchLogger } from "../services/researchLogger";

export function PrivacyPage() {
  useEffect(() => {
    researchLogger.logViewOnce("privacy:/privacy", "privacy_viewed", {
      source: "navigation",
    });
  }, []);

  return (
    <div className="site-shell privacy-page">
      <header className="simple-header">
        <div className="container header-inner">
          <Brand />
          <Link className="button button-ghost button-small" to="/">
            <ArrowLeft size={17} /> Back home
          </Link>
        </div>
      </header>
      <main className="container privacy-main">
        <div className="privacy-intro">
          <p className="eyebrow">Prototype privacy</p>
          <h1>What stays here, and what may be sent.</h1>
          <p>
            Memolens deliberately separates short-lived recording evidence from optional,
            structured research data.
          </p>
        </div>

        <div className="privacy-card-grid">
          <article className="privacy-card local-card">
            <span className="privacy-card-icon" aria-hidden="true">
              <HardDrive size={25} />
            </span>
            <p className="eyebrow">On this device only</p>
            <h2>Video and audio remain in memory.</h2>
            <ul className="check-list">
              <li>Recorded video and natural spoken responses</li>
              <li>Caregiver-recorded voice prompts</li>
              <li>Temporary playback links created by the browser</li>
              <li>Caregiver notes attached to local recorded evidence</li>
            </ul>
            <p className="notice-soft">
              Refreshing or closing the tab erases the recording and current interface state.
              Deleting an event revokes its playback link and removes its in-memory media.
            </p>
          </article>

          <article className="privacy-card research-card">
            <span className="privacy-card-icon" aria-hidden="true">
              <Database size={25} />
            </span>
            <p className="eyebrow">Only with consent</p>
            <h2>Anonymous test data may be sent to help us evaluate and improve Memolens.</h2>
            <ul className="check-list">
              <li>Page, CTA, and workflow events from an anonymous session</li>
              <li>Coarse device, browser, operating-system, and permission results</li>
              <li>Timing, Memo outcome, review outcome, and test ratings</li>
              <li>Voluntary contact details under separate contact consent</li>
            </ul>
            <p className="notice-soft">
              Anonymous analytics can be declined without reducing product functionality.
              Contact details are stored only in the separate <code>leads</code> table.
            </p>
          </article>
        </div>

        <section className="never-sent-card" aria-labelledby="never-sent-title">
          <div>
            <ShieldCheck size={24} aria-hidden="true" />
            <h2 id="never-sent-title">Never included in anonymous research data</h2>
          </div>
          <p>
            Memo audio or video, media links, transcripts, exact reminder text, care recipient or caregiver names in test data, diagnoses, medication names, doses, addresses, precise locations, or a full browser fingerprint.
          </p>
        </section>

        <section className="prototype-boundary-inline">
          <p>{PRODUCT_BOUNDARY}</p>
          <p>
            The private Supabase project should be accessible only to authorized Memolens
            team members. Public browser credentials cannot read research records. This
            demonstration does not claim clinical validation, regulatory clearance, or
            production-grade medical compliance.
          </p>
        </section>
      </main>
    </div>
  );
}
