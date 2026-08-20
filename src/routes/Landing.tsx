import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Eye,
  HeartHandshake,
  LockKeyhole,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnalyticsConsentChoice } from "../components/AnalyticsConsent";
import { Brand } from "../components/Brand";
import { PreorderDialog } from "../components/PreorderDialog";
import { PRODUCT_BOUNDARY } from "../constants";
import { useMemolens } from "../state/context";
import { researchLogger } from "../services/researchLogger";

const STEPS = [
  {
    number: "01",
    icon: BellRing,
    title: "Set the routine",
    body: "A caregiver chooses the time and approves the reminder.",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Support the moment",
    body: "Memolens delivers the reminder and creates a private Memo of the support moment.",
  },
  {
    number: "03",
    icon: Eye,
    title: "Review with context",
    body: "The caregiver reviews the Memo and decides whether follow-up is needed.",
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const { dispatch } = useMemolens();
  const heroRef = useRef<HTMLElement>(null);
  const howItWorksRef = useRef<HTMLElement>(null);
  const [showSticky, setShowSticky] = useState(false);
  const [preorderSource, setPreorderSource] = useState<string | null>(null);

  useEffect(() => {
    researchLogger.logViewOnce("landing:/", "landing_viewed", { source: "direct_or_navigation" });
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowSticky(!entry.isIntersecting),
      { threshold: 0.08 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const openTest = (ctaId: string) => {
    researchLogger.log("test_memolens_clicked", {
      ctaId,
      source: "landing",
    });
    dispatch({ type: "CLEAR_SESSION" });
    navigate("/test");
  };

  const openPreorder = (ctaId: string) => {
    researchLogger.log("preorder_opened", { ctaId, source: "landing" });
    setPreorderSource(ctaId);
  };

  const scrollToHowItWorks = () => {
    researchLogger.log("see_how_it_works_clicked", {
      ctaId: "hero_see_how_it_works",
      source: "landing",
    });
    howItWorksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="site-shell">
      <header className="landing-header">
        <div className="container header-inner">
          <Brand />
          <nav aria-label="Primary navigation">
            <button className="nav-link" type="button" onClick={scrollToHowItWorks}>
              How it works
            </button>
            <Link className="nav-link" to="/privacy">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section ref={heroRef} className="hero-section">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Real-time memory and safety support</p>
              <h1>Built with care for the moments memory may miss.</h1>
              <p className="hero-body">
              Memolens delivers timely reminders, creates a private Memo of the support
              moment, and gives caregivers context for thoughtful follow-up without
              requiring the care recipient to navigate a screen.
            </p>
              <div className="hero-actions">
                <button
                  id="hero_test_memolens"
                  className="button button-primary"
                  type="button"
                  onClick={() => openTest("hero_test_memolens")}
                >
                  Test Memolens <ArrowRight size={18} />
                </button>
                <button
                  id="hero_see_how_it_works"
                  className="button button-secondary"
                  type="button"
                  onClick={scrollToHowItWorks}
                >
                  <Play size={17} /> See how it works
                </button>
                <button
                  id="hero_preorder"
                  className="text-button"
                  type="button"
                  onClick={() => openPreorder("hero_preorder")}
                >
                  Pre-order Now
                </button>
              </div>
              <p className="privacy-note">
                <LockKeyhole size={16} aria-hidden="true" />
                Supervised prototype · Use safe test items only · Memos remain on this device
                · Consented research metrics and voluntary contact details are stored in a
                private Memolens Supabase database
              </p>
            </div>

            <div className="hero-visual" aria-label="Abstract lens and care halo illustration">
              <div className="halo halo-one" />
              <div className="halo halo-two" />
              <div className="lens-card">
                <div className="lens-topline">
                  <span className="status-dot" />
                  <span>Routine prepared</span>
                </div>
                <div className="lens-core">
                  <span className="lens-orbit orbit-one" />
                  <span className="lens-orbit orbit-two" />
                  <span className="lens-center">
                    <HeartHandshake size={34} strokeWidth={1.7} />
                  </span>
                </div>
                <div className="lens-message">
                  <span className="message-line long" />
                  <span className="message-line" />
                </div>
                <div className="care-pill">
                  <CheckCircle2 size={17} /> Caregiver connected
                </div>
              </div>
              <div className="floating-note note-a">Gentle prompt</div>
              <div className="floating-note note-b">Private Memo</div>
            </div>
          </div>
        </section>

        <section ref={howItWorksRef} id="how-it-works" className="steps-section">
          <div className="container">
            <div className="section-heading">
              <p className="eyebrow">One simple, hands-free support loop</p>
              <h2>Support at the right moment. Meaningful context for caregiver follow-up.</h2>
            </div>
            <div className="step-grid">
              {STEPS.map(({ number, icon: Icon, title, body }) => (
                <article className="step-card" key={number}>
                  <div className="step-card-top">
                    <span className="step-icon" aria-hidden="true">
                      <Icon size={22} />
                    </span>
                    <span className="step-number">{number}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="boundary-section">
          <div className="container boundary-grid">
            <div className="boundary-copy">
              <p className="eyebrow light">Designed around trust</p>
              <h2>Helpful context. Not automated medication decisions.</h2>
              <p>{PRODUCT_BOUNDARY}</p>
            </div>
            <div className="boundary-list" role="list">
              <div role="listitem">
                <ShieldCheck size={21} />
                <span>Memo audio and video stay on this device during the test.</span>
              </div>
              <div role="listitem">
                <Eye size={21} />
                <span>Memolens does not decide what happened. The caregiver reviews the Memo and decides whether follow-up is needed.</span>
              </div>
              <div role="listitem">
                <HeartHandshake size={21} />
                <span>Supervised testing with safe test items keeps the demonstration responsible.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="final-cta-section">
          <div className="container final-cta-card">
            <div>
              <p className="eyebrow">Try the complete loop</p>
              <h2>See how hands-free support works in practice.</h2>
            </div>
            <div className="final-actions">
              <button
                id="final_test_memolens"
                className="button button-primary"
                type="button"
                onClick={() => openTest("final_test_memolens")}
              >
                Test Memolens <ArrowRight size={18} />
              </button>
              <button
                id="final_preorder"
                className="button button-secondary"
                type="button"
                onClick={() => openPreorder("final_preorder")}
              >
                Pre-order Now
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <Brand compact />
          <p>Supervised research prototype · Memos erased on refresh or close</p>
          <Link to="/privacy">Privacy</Link>
        </div>
      </footer>

      <AnalyticsConsentChoice />

      <button
        id="sticky_test_memolens"
        className={`sticky-test-button ${showSticky ? "visible" : ""}`}
        type="button"
        onClick={() => openTest("sticky_test_memolens")}
        aria-hidden={!showSticky}
        tabIndex={showSticky ? 0 : -1}
      >
        Test Memolens <ArrowRight size={18} />
      </button>

      {preorderSource ? (
        <PreorderDialog
          sourceCta={preorderSource}
          onClose={() => setPreorderSource(null)}
        />
      ) : null}
    </div>
  );
}
