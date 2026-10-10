import { useEffect, useState } from "react";
import { Link } from "../app/router";
import { Button } from "../components/Button";
import { ExperienceFeedback } from "../components/ExperienceFeedback";
import { PageMotion } from "../components/PageMotion";
import { SectionHeading } from "../components/SectionHeading";
import { ROUTES_BY_PATH } from "../content/navigation";
import { fetchPublishedExpressions, type PublishedExpression } from "../features/expressions/expressionData";
import { useDocumentMeta } from "../lib/useDocumentMeta";

const route = ROUTES_BY_PATH.learn;

export function LearnPage() {
  useDocumentMeta(route.title, route.description);
  const [expressions, setExpressions] = useState<PublishedExpression[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchPublishedExpressions(3).then((items) => {
      if (active) { setExpressions(items); setStatus("ready"); }
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [retry]);

  return <>
    <section className="page-hero page-hero--kasena">
      <PageMotion />
      <div className="container">
        <SectionHeading eyebrow="Learn & explore · Kasem" title="Start with a word. Stay for its story." body="Find a meaning, hear a recording where one is available, and discover how words are used. Start here without an account." light as="h1" />
        <div className="learn-actions"><Button to="dictionary">Find a word</Button><Button to="dictionary?saved=1" variant="secondary">Return to saved words</Button></div>
      </div>
    </section>

    <section className="section section--white">
      <div className="container">
        <SectionHeading eyebrow="A few minutes at a time" title="Your next three steps." body="Follow these in order, or pick the resource you need today." />
        <ol className="learning-steps">
          <li><span className="learning-step-number">01</span><h3>Find and listen</h3><p>Look up an English or Kasem word. Filter for recordings and compare dialect or source labels before choosing an entry.</p><Button to="dictionary?audio=1" variant="secondary">Find words with audio</Button><small>No sign-in · audio varies by entry</small></li>
          <li><span className="learning-step-number">02</span><h3>Keep a few words</h3><p>Choose Save word on an entry. Return to your list, read an example aloud, and check its meaning again.</p><Button to="dictionary?saved=1" variant="secondary">Open saved words</Button><small>Saved in this browser · no cloud backup</small></li>
          <li><span className="learning-step-number">03</span><h3>Try a little practice</h3><p>Visit Kasem Practice Lab for an experimental practice session using eligible published sources. Availability is shown in the Lab.</p><Button to="labs/kasem-practice" variant="secondary">Visit Practice Lab</Button><small>Alpha · sign-in may be required</small></li>
        </ol>
      </div>
    </section>

    <section className="section section--cream" id="reference">
      <div className="container">
        <SectionHeading eyebrow="Read with a source" title="Make sense of sounds and sentences." body="Use the existing book guides for spelling, examples and grammar. They retain source references so you can see where the material comes from." />
        <div className="learning-reference-grid">
          <article className="learning-resource"><span className="target-badge">Public reference</span><h3>Kasem spelling guide</h3><p>Explore spelling rules and printed vocabulary examples. Tone marks and special letters matter; similar-looking spellings can carry different meanings.</p><a href="/spelling-guide.html">Read the spelling guide <span aria-hidden="true">↗</span></a><small>Opens the reference guide on this website</small></article>
          <article className="learning-resource"><span className="target-badge">Public reference</span><h3>Kasem grammar guide</h3><p>Read sentence patterns, pronouns and word forms from P. L. Hewer’s <em>A Basic Grammar of Kasem</em>, with examples from the book.</p><a href="/grammar-guide.html">Read the grammar guide <span aria-hidden="true">↗</span></a><small>Opens the reference guide on this website</small></article>
          <article className="learning-resource"><span className="target-badge">Separate reference site</span><h3>Explore the wider collections</h3><p>Browse published sentences, grammar and book illustrations in the Kasem reference web app, hosted at Venacula.</p><a href="https://www.venacula.com/?collection=sentences" target="_blank" rel="noreferrer">Browse sentence sources <span aria-hidden="true">↗</span></a><small>Opens venacula.com in a new tab</small></article>
        </div>
      </div>
    </section>

    <section className="section section--white" id="expressions">
      <div className="container">
        <SectionHeading eyebrow="Language in everyday life" title="Read a published expression." body="Whole expressions keep their meanings and sources together. Regional variants are part of the record." />
        {status === "loading" && <p role="status">Loading published expressions…</p>}
        {status === "error" && <div role="status"><p>Expressions could not be loaded. You can still use the guides above.</p><Button type="button" variant="secondary" onClick={() => setRetry((value) => value + 1)}>Try again</Button></div>}
        {status === "ready" && expressions.length === 0 && <p>Published expressions will appear here as the collection grows.</p>}
        {status === "ready" && <div className="learning-reference-grid">{expressions.map((expression) => <article className="learning-resource learning-expression" key={expression.id}>
          <span className="eyebrow">{expression.kindLabel} · {expression.dialect || "Kasem"}</span>
          <h3>{expression.phrase}</h3><p className="learning-expression__meaning">{expression.meaning}</p>
          {expression.context && <p><strong>When it is used:</strong> {expression.context}</p>}
          {expression.alternatives.length > 0 && <details><summary>Recorded alternatives</summary><p>{expression.alternatives.join(" · ")}</p></details>}
          <p className="learning-expression__source">{expression.sourceLabel}{expression.sourceDetail ? `. ${expression.sourceDetail}` : ""}<br />Shared by {expression.contributorName}</p>
        </article>)}</div>}
        <p className="learning-section-link"><Link to="contribute#published">Read more expressions and learn how to contribute →</Link></p>
      </div>
    </section>

    <section className="section section--cream">
      <div className="container learning-culture">
        <figure><img src="/beyond-the-reef/images/social-cover.jpg" alt="Illustrated cover of the Beyond the Reef music film" loading="lazy" width="1200" height="630" /><figcaption>Beyond the Reef · creative music film with generated imagery.</figcaption></figure>
        <div><p className="eyebrow">A different way to explore</p><h2>Make room for a song.</h2><p>Open <em>Beyond the Reef</em>, an illustrated music film with synchronised lyrics. Playback starts when you choose to begin.</p><p className="tiny">A creative work, presented separately from the language reference collection.</p><Button to="beyond-the-reef" variant="secondary">Explore the music film</Button></div>
      </div>
    </section>

    <section className="section section--white">
      <div className="container">
        <SectionHeading eyebrow="Know what to expect" title="One community, a few different spaces." />
        <div className="learning-services">
          <div><strong>This website</strong><p>Browse words, guides and expressions without signing in. Some entries still need a recording, example or source detail.</p></div>
          <div><strong>TribeStudio</strong><p>Our contributor workspace opens separately. A free Google sign-in lets you submit work and follow its review. <Link to="contribute">See the task first</Link>.</p></div>
          <div><strong>Indigen World Labs</strong><p>Practice and creative tools are experiments. Access and availability can change; check the status shown before starting.</p></div>
          <div><strong>The mobile app</strong><p>Public access is still listed through a waitlist. <Link to="get-involved?route=mobile-app-waitlist">Register your interest</Link> while you use the public web resources.</p></div>
        </div>
        <div className="learning-source-note"><h3>Read the record behind the word.</h3><p>Check its dialect, example, source and review label. “Published entry” describes public availability; a review label appears when that status is recorded. Missing details are shown openly. <Link to="impact-governance">Read about sources and permissions</Link>, or use Suggest a correction on an entry.</p></div>
        <ExperienceFeedback page="learn" />
      </div>
    </section>
  </>;
}
