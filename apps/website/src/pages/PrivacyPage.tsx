import { useEffect } from "react";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { CultureHero } from "../components/HomeHero";
import { ROUTES_BY_PATH } from "../content/navigation";
import { PRIVACY_SECTIONS } from "../content/privacy";
import { Link, scrollToTop } from "../app/router";
import "../styles/privacy.css";

const route = ROUTES_BY_PATH["privacy"];

function PrivacyHero() {
  return <CultureHero id="privacy-top">
      <div className="container privacy-hero__content">
        <p className="eyebrow">Privacy notice · Indigen World</p>
        <h1 id="privacy-title">Your information.<br /><span>Our responsibility.</span></h1>
        <p className="privacy-hero__intro">Understand what you share, where it goes, and the choices you have — from learning a word to contributing to a cultural archive.</p>
        <div className="privacy-hero__actions">
          <a href="#privacy-overview" className="privacy-button">Read the privacy notice <span aria-hidden="true">↓</span></a>
          <Link to="contact" className="privacy-hero__contact">Make a privacy request <span aria-hidden="true">↗</span></Link>
        </div>
        <p className="privacy-hero__date">Last reviewed <time dateTime="2026-10-02">2 October 2026</time> · Implementation notice</p>
      </div>
  </CultureHero>;
}

export function PrivacyPage() {
  useDocumentMeta(route.title, route.description);
  // The app shell can attempt fragment scrolling before this lazy route mounts.
  useEffect(() => scrollToTop(), []);

  return (
    <div className="privacy-page">
      <PrivacyHero />
      <section className="privacy-overview container" id="privacy-overview" aria-labelledby="privacy-overview-title">
        <div className="privacy-overview__heading" data-reveal>
          <p className="eyebrow">The notice at a glance</p>
          <h2 id="privacy-overview-title">Different ways to participate.<br />Clearer choices about your data.</h2>
          <p>These highlights are a starting point. The full notice below explains the details and limits for each part of the ecosystem.</p>
        </div>
        <div className="privacy-principles">
          <a href="#mobile" data-reveal><span className="privacy-principles__number">01 / On your device</span><h3>Offline has a place.</h3><p>Local drafts and saved words are different from submitted work and cloud records.</p><span className="privacy-principles__link">See what stays local ↗</span></a>
          <a href="#culture" data-reveal><span className="privacy-principles__number">02 / With permission</span><h3>Culture carries context.</h3><p>Consent, source, licence and cultural permissions guide review and publication.</p><span className="privacy-principles__link">Understand cultural permissions ↗</span></a>
          <a href="#rights" data-reveal><span className="privacy-principles__number">03 / Your choices</span><h3>A route to be heard.</h3><p>Ask for access, correction, deletion or a review of how your information is used.</p><span className="privacy-principles__link">Find your request route ↗</span></a>
        </div>
      </section>
      <div className="container privacy-layout">
        <aside className="privacy-contents">
          <nav aria-label="Privacy notice sections">
            <p className="eyebrow">In this notice</p>
            <ol>{PRIVACY_SECTIONS.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.shortTitle}</a></li>)}</ol>
            <Link className="privacy-contents__contact" to="contact">Contact the privacy team ↗</Link>
          </nav>
        </aside>
        <article className="privacy-copy" aria-label="Full privacy notice">
          <div className="privacy-status"><strong>A notice grounded in how the products work.</strong><p>This is a plain-language implementation summary pending final legal approval. It describes data handling and available choices; it does not announce a release of every feature mentioned.</p></div>
          {PRIVACY_SECTIONS.map((section, index) => <section className="privacy-copy__section" key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
            <div data-reveal>
              <span className="privacy-copy__number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.content}
            </div>
          </section>)}
          <div className="privacy-request" data-reveal><p className="eyebrow">Let’s resolve it</p><h2>Have a question about your information?</h2><p>Tell us which product or record is involved and what you need. Account and server-side requests are handled by the team.</p><Link to="contact" className="privacy-button">Make a privacy request <span aria-hidden="true">↗</span></Link><a href="#privacy-top" className="privacy-request__top">Back to the top ↑</a></div>
        </article>
      </div>
    </div>
  );
}
