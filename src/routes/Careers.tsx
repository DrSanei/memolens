import { Heart, Lightbulb, Stethoscope, Users } from "lucide-react";
import { CareersInterestForm } from "../components/CareersInterestForm";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const COMMUNITY = [
  {
    icon: Heart,
    title: "Families and caregivers",
    description: "Share the everyday moments where better support would make a difference.",
  },
  {
    icon: Stethoscope,
    title: "Doctors and researchers",
    description: "Help us ask better questions and evaluate our ideas responsibly.",
  },
  {
    icon: Lightbulb,
    title: "Future teammates",
    description: "Bring your experience in product, design, engineering, or community building.",
  },
  {
    icon: Users,
    title: "Investors and partners",
    description: "Explore thoughtful ways to support an early-stage team and its mission.",
  },
];

export function CareersPage() {
  return (
    <div className="site-shell story-page">
      <SiteHeader />
      <main>
        <section className="careers-hero">
          <div className="container careers-hero-inner">
            <p className="eyebrow light">Join the Memolenz journey</p>
            <h1>Help us make care feel more connected.</h1>
            <p>
              We are an early-stage team. If you share our passion for supporting people
              living with dementia and the people who care for them, we would love to hear from you.
            </p>
            <a className="button careers-hero-button" href="#careers-interest">Get in touch</a>
          </div>
        </section>

        <section className="container careers-community" aria-labelledby="careers-community-title">
          <div className="careers-community-heading">
            <p className="eyebrow">There is more than one way to help</p>
            <h2 id="careers-community-title">A place for different perspectives.</h2>
          </div>
          <div className="careers-community-grid">
            {COMMUNITY.map(({ icon: Icon, title, description }) => (
              <article className="careers-community-card" key={title}>
                <span className="careers-community-icon"><Icon size={23} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="careers-contact-section" id="careers-interest" aria-labelledby="careers-contact-title">
          <div className="container careers-contact-grid">
            <div>
              <p className="eyebrow">Start a conversation</p>
              <h2 id="careers-contact-title">Let&apos;s hear from you.</h2>
              <p>
                Tell us how you would like to be involved. Leave your name and mobile number,
                and we will contact you soon.
              </p>
            </div>
            <CareersInterestForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
