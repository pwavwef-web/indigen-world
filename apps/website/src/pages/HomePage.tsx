/**
 * src/pages/HomePage.tsx
 *
 * Landing page: hero, belief strip, ecosystem highlights, a Project
 * Kasena spotlight (trimmed — the full translation demo and roadmap
 * live on the dedicated Project Kasena page), an honestly-labelled
 * progress snapshot, and a closing CTA. Adapted from the top portion
 * of the uploaded template's single-page App.tsx.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { HOME_ECOSYSTEM_HIGHLIGHTS } from "../content/ecosystem";
import { Button } from "../components/Button";
import { ProverbCard, CounterRollup } from "@indigen-world/web-ui";
import { Icon } from "../components/Icon";
import { BrandMark } from "../components/BrandMark";
import { SectionHeading } from "../components/SectionHeading";
import { ProductCard } from "../components/ProductCard";

const route = ROUTES_BY_PATH["home"];

const HOW_IT_WORKS = [
  ["Preserve", "Capture words, stories and cultural context with clear source information."],
  ["Validate", "Route submissions through teachers, elders and other qualified language custodians."],
  ["Create", "Give approved material useful forms for storytelling, education and future tools."],
  ["Learn", "Make trusted culture easier to discover across devices and generations."],
  ["Reconnect", "Help local communities and diaspora families keep language present in daily life."],
] as const;

const WHO_IT_SERVES = [
  "Local communities",
  "Diaspora families",
  "Creators",
  "Educators and schools",
  "Researchers",
  "Language custodians",
  "Cultural partners",
] as const;

export function HomePage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);

  return (
    <>
      <section className="hero" id="top">
        <div className="hero__pattern" aria-hidden="true" />
        <div className="container hero__grid">
          <div className="hero__content" data-reveal>
            <span className="status-pill">
              <span className="status-pill__dot" />
              Building from Northern Ghana, designed to scale
            </span>
            <p className="hero__kicker">A community-governed cultural technology ecosystem</p>
            <h1>
              Culture belongs
              <span> in the future.</span>
            </h1>
            <p className="hero__lead">
              Indigen World builds digital spaces where indigenous languages, stories, creators
              and communities can remain present online — and shape what comes next.
            </p>
            <div className="hero__actions">
              <Button to="ecosystem">Explore the ecosystem</Button>
              <Button to="get-involved" variant="secondary">
                Get involved
              </Button>
            </div>
            <div className="hero__trust-row">
              <span>
                <Icon name="shield" size={18} /> Community validation
              </span>
              <span>
                <Icon name="mobile" size={18} /> Low-bandwidth first
              </span>
              <span>
                <Icon name="layers" size={18} /> Reusable language cells
              </span>
            </div>
          </div>

          <div className="hero-visual" data-reveal>
            <div className="hero-orbit hero-orbit--one" aria-hidden="true" />
            <div className="hero-orbit hero-orbit--two" aria-hidden="true" />
            <div className="hero-visual__core">
              <BrandMark compact />
              <p>INDIGEN WORLD</p>
              <span>Language • Story • Identity</span>
            </div>
            <div className="floating-card floating-card--language">
              <span className="floating-card__icon">
                <Icon name="book" size={19} />
              </span>
              <div>
                <small>Language cell 01</small>
                <strong>Project Kasena</strong>
              </div>
            </div>
            <div className="floating-card floating-card--creator">
              <span className="floating-card__icon">
                <Icon name="studio" size={19} />
              </span>
              <div>
                <small>Creator workspace</small>
                <strong>TribeStudio</strong>
              </div>
            </div>
            <div className="floating-card floating-card--community">
              <span className="floating-card__icon">
                <Icon name="community" size={19} />
              </span>
              <div>
                <small>Guided by</small>
                <strong>Community custodians</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--cream" id="why-it-matters">
        <div className="container split-intro">
          <SectionHeading
            eyebrow="Why this matters"
            title="A language needs a digital life to remain part of everyday life."
          />
          <div className="split-intro__copy" data-reveal>
            <p>
              When a language is hard to find in search, learning tools and the services people
              use every day, younger speakers have fewer reasons and fewer places to use it.
            </p>
            <p>
              Indigen World works with communities to build a trusted digital record without
              separating language from the people, permissions and cultural context that give it
              meaning.
            </p>
          </div>
        </div>
      </section>

      <section className="belief-strip" aria-label="Indigen World principles">
        <div className="container belief-strip__inner">
          <p>Not a digital museum.</p>
          <span aria-hidden="true">✦</span>
          <p>A living cultural infrastructure.</p>
          <span aria-hidden="true">✦</span>
          <p>Built with communities, not around them.</p>
        </div>
      </section>

      <section className="section section--white" id="ecosystem-highlights">
        <div className="container">
          <SectionHeading
            eyebrow="One connected ecosystem"
            title="Different doors. One cultural future."
            body="TribeStudio, the mobile experience, Project Kasena and shared data infrastructure each have a clear job — and an honest status."
          />
          <div className="product-grid">
            {HOME_ECOSYSTEM_HIGHLIGHTS.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
          <div className="section-cta" data-reveal>
            <Button to="ecosystem" variant="secondary">
              See the full ecosystem
            </Button>
          </div>
        </div>
      </section>

      <section className="section section--indigo" id="kasena-spotlight">
        <div className="container kasena-spotlight">
          <SectionHeading
            eyebrow="Flagship programme"
            title="Project Kasena starts with one language—deeply."
            body="Indigen World's first language cell and intended model for community-validated language preservation. It begins with Kasem and is building foundations for future text and voice research."
            light
          />
          <Button to="project-kasena" variant="secondary">
            Explore Project Kasena
          </Button>
        </div>
      </section>

      {/* Proverb of the Day & Share Card Generator */}
      <section className="section section--cream" id="daily-proverb">
        <div className="container">
          <SectionHeading
            eyebrow="Living wisdom"
            title="Wisdom passed down through spoken words."
            body="Each day, discover an authentic proverb preserving Kasena philosophy, moral principles, and cultural metaphors."
          />
          <ProverbCard
            proverb={{
              kasem: "Kukuri ba bore ne voro",
              phonetic: "koo-koo-ree bah boh-reh neh voh-roh",
              translation: "A dog does not bark at its master's lineage.",
              meaning: "Loyalty, family honour, and deep gratitude to those who gave you life and shelter.",
              dialect: "Kasem (Paga & Navrongo)",
            }}
          />
        </div>
      </section>

      <section className="section section--cream" id="how-it-works">
        <div className="container">
          <SectionHeading
            eyebrow="How Indigen World works"
            title="From community knowledge to useful, governed technology."
            body="The model keeps cultural authority present at every step instead of treating validation and consent as an afterthought."
          />
          <ol className="process-list" data-reveal>
            {HOW_IT_WORKS.map(([title, body], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--white" id="who-it-serves">
        <div className="container split-intro">
          <SectionHeading
            eyebrow="Who it serves"
            title="Built for the people who keep culture moving."
            body="The ecosystem supports different roles without asking every visitor to use the same product or contribution path."
          />
          <ul className="audience-list" data-reveal>
            {WHO_IT_SERVES.map((audience) => (
              <li key={audience}>{audience}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section--white" id="progress">
        <div className="container">
          <SectionHeading
            eyebrow="MVP ambition"
            title="Build measurable value before chasing spectacle."
            body="Our first milestones focus on a working product, trusted validation and a useful language dataset—not vanity features."
          />
          <p className="target-label" data-reveal>
            Figures below describe the Project Kasena MVP ambition, not completed results.
          </p>
          <div className="impact-grid">
            <article data-reveal>
              <strong><CounterRollup target={5000} suffix="+" /></strong>
              <span>Validated dictionary entries</span>
            </article>
            <article data-reveal>
              <strong><CounterRollup target={1000} suffix="+" /></strong>
              <span>Kasem–English sentence pairs</span>
            </article>
            <article data-reveal>
              <strong><CounterRollup target={200} suffix="+" /></strong>
              <span>Active community contributors</span>
            </article>
            <article data-reveal>
              <strong><CounterRollup target={30} suffix="+" /></strong>
              <span>Elders &amp; qualified validators</span>
            </article>
          </div>
          <div className="section-cta" data-reveal>
            <Button to="impact-governance" variant="secondary">
              See governance &amp; full targets
            </Button>
          </div>
        </div>
      </section>

      <section className="contact-section" id="get-involved-cta">
        <div className="contact-section__pattern" aria-hidden="true" />
        <div className="container contact-card" data-reveal>
          <div>
            <p className="eyebrow">Partners, educators, funders &amp; cultural custodians</p>
            <h2>Help build a future where culture is digitally present—and still belongs to its people.</h2>
            <p>
              We are preparing the first Kasem pilot and welcome conversations with communities,
              schools, researchers, cultural organisations, technology partners and responsible
              funders.
            </p>
          </div>
          <div className="contact-card__actions">
            <Button to="get-involved">Get involved</Button>
          </div>
        </div>
      </section>
    </>
  );
}
