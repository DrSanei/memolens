import { ArrowRight, HeartHandshake, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export function AboutPage() {
  return (
    <div className="site-shell story-page">
      <SiteHeader />
      <main>
        <section className="story-hero">
          <div className="container story-hero-grid">
            <div>
              <p className="eyebrow">About Memolenz</p>
              <h1>More independence in the moment. More assurance for the people who care.</h1>
              <p className="story-lead">
                Memolenz is an early-stage effort to make everyday memory support more
                thoughtful, private, and connected to the people who can help.
              </p>
            </div>
            <div className="story-hero-art" aria-hidden="true">
              <div className="story-art-ring story-art-ring-outer" />
              <div className="story-art-ring story-art-ring-inner" />
              <div className="story-art-center"><HeartHandshake size={53} strokeWidth={1.5} /></div>
              <span className="story-art-label story-art-label-top">Support in the moment</span>
              <span className="story-art-label story-art-label-bottom">Caregiver in the loop</span>
            </div>
          </div>
        </section>

        <section className="container story-why" aria-labelledby="story-why-title">
          <div>
            <p className="eyebrow">Why we started</p>
            <h2 id="story-why-title">A reminder is only part of the story.</h2>
          </div>
          <p>
            A person may need a gentle cue during a routine. A caregiver may need to know
            what happened afterward. We started Memolenz to explore how technology could
            support both sides of that moment, while leaving care decisions with people.
          </p>
        </section>

        <section className="story-founders" aria-labelledby="story-founders-title">
          <div className="container">
            <p className="eyebrow">The people behind Memolenz</p>
            <h2 id="story-founders-title">Meet the founders.</h2>
            <div className="founder-grid">
              <article className="founder-card">
                <img className="founder-portrait" src="/founders/ladan-kian.png"
                  alt="Ladan Kian" width="92" height="92" loading="lazy" />
                <div>
                  <p className="founder-role">Co-founder &amp; CEO</p>
                  <h3>Ladan Kian</h3>
                  <p>
                    Ladan is a privacy and cybersecurity researcher and a PhD candidate in
                    Computer and Cyber Sciences at Augusta University. She brings experience
                    in privacy-preserving computing and secure systems to Memolenz.
                  </p>
                </div>
              </article>
              <article className="founder-card">
                <img className="founder-portrait" src="/founders/mohamad-sanei.png"
                  alt="Dr. Mohamad Sanei" width="92" height="92" loading="lazy" />
                <div>
                  <p className="founder-role">Co-founder &amp; CTO</p>
                  <h3>Dr. Mohamad Sanei</h3>
                  <p>
                    Mohamad is a physician, clinical researcher, and digital-health
                    entrepreneur. He brings clinical experience and a product builder&apos;s
                    perspective to the team.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="container story-principles" aria-labelledby="story-principles-title">
          <div className="story-principles-heading">
            <p className="eyebrow">Where we are headed</p>
            <h2 id="story-principles-title">Independence for the person. Assurance for the caregiver.</h2>
          </div>
          <div className="story-principle-grid">
            <article>
              <Sparkles size={25} aria-hidden="true" />
              <h3>Support that fits daily life</h3>
              <p>Start with a supervised phone-based prototype, then explore compatible wearables as we learn with families and clinicians.</p>
            </article>
            <article>
              <ShieldCheck size={25} aria-hidden="true" />
              <h3>Privacy and human judgment</h3>
              <p>Keep personal moments private and give caregivers context to make their own follow-up decisions.</p>
            </article>
          </div>
        </section>

        <section className="container story-join" aria-labelledby="story-join-title">
          <div>
            <p className="eyebrow light">Build the future with us</p>
            <h2 id="story-join-title">Good care takes a community.</h2>
            <p>We welcome people who want to contribute insight, skill, time, or financial support as Memolenz grows.</p>
          </div>
          <Link className="button story-join-button" to="/careers">
            Invest Time or Money in Memolenz <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
