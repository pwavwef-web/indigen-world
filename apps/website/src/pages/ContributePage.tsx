/**
 * src/pages/ContributePage.tsx
 *
 * The contributor's entry point: one open campaign, with the task spelled out
 * and the review process shown before anybody is asked to sign in.
 *
 * A would-be contributor used to meet a waitlist, an interest form, or a
 * vague promise of recognition. This page gives them something they can do today —
 * share one everyday Kasem expression — says exactly what that involves, and
 * shows what a reviewer will do with it. The button goes straight to the form
 * in TribeStudio.
 *
 * Published expressions are read live from `expressionEntries`, so nothing on
 * this page is an unreviewed Kasem example.
 */
import { useEffect, useState } from "react";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { STUDIO_KNOWLEDGE_URL } from "../content/creatorLinks";
import {
  CAMPAIGN_CTA_URL,
  CAMPAIGN_FACTS,
  CAMPAIGN_FAQS,
  GOOD_TO_SEND,
  PLEASE_DO_NOT_SEND,
  REVIEW_STEPS,
  TASK_STEPS,
} from "../content/expressionsCampaign";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { SectionHeading } from "../components/SectionHeading";
import { fetchPublishedExpressions, type PublishedExpression } from "../features/expressions/expressionData";

const route = ROUTES_BY_PATH.contribute;

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: PublishedExpression[] };

/** The reviewed expressions, newest first — or an honest empty state. */
function PublishedExpressions() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetchPublishedExpressions()
      .then((items) => {
        if (active) setState({ status: "ready", items });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return <p className="contribute-published__note" role="status">Loading published expressions…</p>;
  }
  if (state.status === "error") {
    return (
      <p className="contribute-published__note" role="status">
        Published expressions could not be loaded just now. The campaign is still open.
      </p>
    );
  }
  if (state.items.length === 0) {
    return (
      <div className="contribute-empty">
        <strong>No expressions have been published yet.</strong>
        <p>The first ones appear here as soon as a reviewer approves them. Yours could be one of them.</p>
        <Button href={CAMPAIGN_CTA_URL} external variant="secondary">
          Share an expression
        </Button>
      </div>
    );
  }
  return (
    <ul className="expression-list" aria-label="Recently published expressions">
      {state.items.map((item) => (
        <li key={item.id} className="expression-card">
          <p className="expression-card__kind">
            {item.kindLabel}
            {item.dialect ? ` · ${item.dialect}` : ""}
          </p>
          <h3 lang="xsm">{item.phrase}</h3>
          {item.alternatives.length ? (
            <p className="expression-card__also">
              Also: <span lang="xsm">{item.alternatives.join(" · ")}</span>
            </p>
          ) : null}
          <p className="expression-card__meaning">{item.meaning}</p>
          {item.literalTranslation ? (
            <p className="expression-card__detail">
              <span>Word for word</span> {item.literalTranslation}
            </p>
          ) : null}
          {item.context ? (
            <p className="expression-card__detail">
              <span>When it is used</span> {item.context}
            </p>
          ) : null}
          <p className="expression-card__source">
            {item.sourceLabel}
            {item.speakerName ? ` — ${item.speakerName}` : ""}
            {item.sourceDetail ? `. ${item.sourceDetail}` : ""}
            <br />
            Shared by {item.contributorName}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ContributePage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);

  return (
    <>
      <section className="page-hero page-hero--contribute">
        <div className="container contribute-hero">
          <SectionHeading
            eyebrow="Open campaign · Everyday Kasem expressions"
            title="Share a Kasem expression you use every day."
            body="Greetings, blessings, idioms and sayings — the things you hear at home or in the market. Send one with what it means, when it is said and who you learned it from. A Kasem-speaking reviewer checks it before anyone else can see it."
            light
            as="h1"
          />
          <div className="hero__actions contribute-hero__actions">
            <Button href={CAMPAIGN_CTA_URL} external>
              Share an expression
            </Button>
            <Button href="#review" variant="secondary" showArrow={false}>
              How review works
            </Button>
          </div>
          <dl className="contribute-facts">
            {CAMPAIGN_FACTS.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section section--cream" id="knowledge" aria-labelledby="knowledge-title">
        <div className="container knowledge-intro">
          <div className="section-heading">
            <p className="eyebrow">For speakers, teachers and cultural custodians</p>
            <h2 id="knowledge-title">Preserve the detail behind the words.</h2>
            <p className="section-heading__body">
              The Knowledge workspace brings original Kasem, translations, sources, regional variants and recordings
              into one record. Save a draft, explain the context, and send it for independent human review.
            </p>
            <Button href={STUDIO_KNOWLEDGE_URL} external>Open the Knowledge workspace</Button>
            <p className="tiny">Sign in to contribute. Review access is assigned separately. Review does not automatically publish your material.</p>
          </div>
          <div className="knowledge-intro__areas">
            <h3>Ten ways to contribute</h3>
            <ul aria-label="Knowledge dataset areas">
              {["Words and meanings", "Grammar", "Expressions", "Sentences", "Proverbs", "Literature and oral traditions", "Dialogue", "Pronunciation", "Cultural knowledge", "Questions and verified answers"].map(area => <li key={area}>{area}</li>)}
            </ul>
            <p>Keep literal meaning separate from cultural interpretation. Record a variant or uncertainty when there is no single answer.</p>
          </div>
        </div>
      </section>

      <section className="section section--white" id="task" aria-labelledby="task-title">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Your task</p>
            <h2 id="task-title">One expression, five things.</h2>
            <p className="section-heading__body">
              That is the whole task. The form in TribeStudio asks for exactly these, one section at a time, and keeps
              your draft if you step away.
            </p>
          </div>
          <ol className="contribute-task" data-reveal>
            {TASK_STEPS.map((step, index) => (
              <li key={step.title}>
                <span aria-hidden="true">{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="contribute-scope" data-reveal>
            <div>
              <h3>
                <Icon name="check" size={18} /> Good to send
              </h3>
              <ul>
                {GOOD_TO_SEND.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>
                <Icon name="x" size={18} /> Please do not send
              </h3>
              <ul>
                {PLEASE_DO_NOT_SEND.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--cream" id="review" aria-labelledby="review-title">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">The review process</p>
            <h2 id="review-title">What happens after you send it.</h2>
            <p className="section-heading__body">
              Every expression is read by a Kasem-speaking reviewer before anyone else can see it. You follow each step
              in TribeStudio, under “Your expressions”, and you are notified when a reviewer decides.
            </p>
          </div>
          <ol className="contribute-review" data-reveal>
            {REVIEW_STEPS.map((step) => (
              <li key={step.title}>
                <span className="contribute-status">{step.status}</span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="target-label">You can withdraw an expression at any time, even after it is published.</p>
        </div>
      </section>

      <section className="section section--white" id="published" aria-labelledby="published-title">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Expressions stay expressions</p>
            <h2 id="published-title">Published whole, never split into dictionary words.</h2>
            <p className="section-heading__body">
              An approved expression is published with its meaning, the situation it is used in and where it came
              from, and credited to the person who shared it. The dictionary keeps single words; expressions keep their
              context. AI use happens only where a contributor separately opted in.
            </p>
          </div>
          <PublishedExpressions />
        </div>
      </section>

      <section className="section section--cream" id="questions" aria-labelledby="questions-title">
        <div className="container contribute-faq">
          <div className="section-heading">
            <p className="eyebrow">Questions</p>
            <h2 id="questions-title">Before you start.</h2>
          </div>
          <div className="contribute-faq__list">
            {CAMPAIGN_FAQS.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--indigo">
        <div className="container contribute-cta">
          <SectionHeading
            eyebrow="Ready when you are"
            title="Share your first expression."
            body="It takes about five minutes, and you will see its review status as soon as you send it."
            light
          />
          <div className="hero__actions">
            <Button href={CAMPAIGN_CTA_URL} external>
              Share an expression
            </Button>
            <Button to="dictionary" variant="secondary">
              Here to learn? Open the dictionary
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
