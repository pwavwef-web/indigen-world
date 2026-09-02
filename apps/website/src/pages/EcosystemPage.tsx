import { useState } from "react";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import {
  ECOSYSTEM_PRODUCTS,
  FLAGSHIP_PROGRAMME,
  SHARED_FOUNDATION,
} from "../content/ecosystem";
import { SectionHeading } from "../components/SectionHeading";
import { ProductCard } from "../components/ProductCard";
import { Icon } from "../components/Icon";
import { Link } from "../app/router";
import { StatusBadge } from "../components/StatusBadge";
import { ResponsiveDisclosure } from "../components/ResponsiveDisclosure";

const route = ROUTES_BY_PATH["ecosystem"];

const PUBLIC_PRODUCTS = ECOSYSTEM_PRODUCTS;
const PROGRAMME = FLAGSHIP_PROGRAMME;
const BACKEND = SHARED_FOUNDATION;

type AudienceFilter = "all" | "creators" | "learners" | "researchers" | "custodians";

const PRODUCT_IDS_BY_AUDIENCE: Record<Exclude<AudienceFilter, "all">, readonly string[]> = {
  creators: ["tribestudio", "public-website"],
  learners: ["mobile-app", "public-website"],
  researchers: ["public-website", "tribestudio"],
  custodians: ["tribestudio"],
};

export function EcosystemPage() {
  useDocumentMeta(route.title, route.description);

  const [audience, setAudience] = useState<AudienceFilter>("all");

  // Filtering replaces product-card DOM nodes. Include the selected audience
  // so newly mounted cards are observed and do not remain at opacity: 0.
  useRevealOnScroll(`${route.path}:${audience}`);

  const filteredProducts = PUBLIC_PRODUCTS.filter((p) => {
    if (audience === "all") return true;
    return PRODUCT_IDS_BY_AUDIENCE[audience].includes(p.id);
  });

  return (
    <>
      <section className="page-hero page-hero--ecosystem">
        <div className="container">
          <SectionHeading
            eyebrow="One ecosystem, three products"
            title="Different doors. One cultural future."
            body="The public website, TribeStudio and the mobile app each have a clear job. Together, they connect public discovery, cultural creation and everyday learning while keeping responsibilities and permissions clear."
            light
            as="h1"
          />
        </div>
      </section>

      <section className="section section--white">
        <div className="container">
          {/* Interactive Audience Filter Matrix */}
          <div className="ecosystem-filter-bar" data-reveal>
            <span className="filter-label" id="ecosystem-filter-label">Filter by Audience &amp; Role:</span>
            <div className="filter-pills" role="group" aria-labelledby="ecosystem-filter-label">
              {(
                [
                  ["all", "✦ All Doors"],
                  ["creators", "🎙️ Creators & Storytellers"],
                  ["learners", "📱 Everyday Learners"],
                  ["researchers", "🔬 Researchers & Linguists"],
                  ["custodians", "🛡️ Elders & Validators"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-pill ${audience === key ? "is-active" : ""}`}
                  aria-pressed={audience === key}
                  onClick={() => setAudience(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="filter-results" role="status" aria-live="polite">
              Showing {filteredProducts.length} {filteredProducts.length === 1 ? "product" : "products"}.
            </p>
          </div>

          {filteredProducts.length > 0 ? (
            <div className="product-grid" id="ecosystem-product-grid">
              {filteredProducts.map((product, index) => (
                <ProductCard key={product.id} product={product} index={index} />
              ))}
            </div>
          ) : (
            <p className="filter-empty" role="status">
              No products currently match this audience.
            </p>
          )}

          <section className="programme-band" data-reveal aria-labelledby="flagship-programme-title">
            <div className="programme-band__icon">
              <Icon name="book" size={28} />
            </div>
            <div className="programme-band__copy">
              <div className="programme-band__heading">
                <div>
                  <p className="eyebrow">Flagship programme</p>
                  <h3 id="flagship-programme-title">{PROGRAMME.title}</h3>
                </div>
                <StatusBadge status={PROGRAMME.status} />
              </div>
              <p>{PROGRAMME.body}</p>
              <Link to={PROGRAMME.href!} className="card-link">
                {PROGRAMME.ctaLabel} <Icon name="arrow" size={17} />
              </Link>
            </div>
          </section>

          <ResponsiveDisclosure
            className="ecosystem-deep-dive"
            summary="See the target workflow and technical foundation"
          >
            {/* Ecosystem Architecture Dataflow Visualizer */}
            <div className="ecosystem-dataflow iw-glass-card" data-reveal>
              <div className="dataflow-head">
                <span className="iw-eyebrow">✦ Target workflow</span>
                <h3>How cultural knowledge is intended to move through Indigen World</h3>
                <p className="tiny muted">
                  The public dictionary and core Firebase services are in use. Capture, review and
                  wider publishing workflows remain partly in development.
                </p>
              </div>

              <div className="dataflow-steps">
                <div className="dataflow-step">
                  <span className="step-num">01</span>
                  <span className="dataflow-status">In development</span>
                  <strong>1. Community capture</strong>
                  <p className="tiny">Planned recording and sentence-pairing tools in TribeStudio, with explicit consent.</p>
                </div>
                <div className="dataflow-arrow" aria-hidden="true">➔</div>
                <div className="dataflow-step">
                  <span className="step-num">02</span>
                  <span className="dataflow-status dataflow-status--live">In use</span>
                  <strong>2. Secure storage and services</strong>
                  <p className="tiny">Firebase storage, database rules and server functions protect published and restricted records.</p>
                </div>
                <div className="dataflow-arrow" aria-hidden="true">➔</div>
                <div className="dataflow-step">
                  <span className="step-num">03</span>
                  <span className="dataflow-status">In development</span>
                  <strong>3. Community review</strong>
                  <p className="tiny">Elders and qualified teachers review language accuracy, dialect and permission to publish.</p>
                </div>
                <div className="dataflow-arrow" aria-hidden="true">➔</div>
                <div className="dataflow-step">
                  <span className="step-num">04</span>
                  <span className="dataflow-status dataflow-status--partial">Partly live</span>
                  <strong>4. Approved publishing</strong>
                  <p className="tiny">Reviewed dictionary entries are live; wider educational and research datasets remain planned.</p>
                </div>
              </div>
            </div>

            <div className="infrastructure-band" data-reveal>
              <div className="infrastructure-band__icon">
                <Icon name="layers" size={28} />
              </div>
              <div>
                <p className="eyebrow">{BACKEND.eyebrow}</p>
                <h3>{BACKEND.title}</h3>
              </div>
              <p>{BACKEND.body}</p>
            </div>
          </ResponsiveDisclosure>
        </div>
      </section>

      <section className="section section--cream">
        <div className="container">
          <SectionHeading eyebrow="A note on scope" title="What this website is — and isn't." />
          <ul className="kicker-list" data-reveal>
            <li>
              <strong>It explains</strong>
              <span>The mission, the ecosystem, the team, and how each product fits together.</span>
            </li>
            <li>
              <strong>It publishes</strong>
              <span>
                A public Kasem dictionary for immediate search, reference and sharing without an
                app installation.
              </span>
            </li>
            <li>
              <strong>It routes</strong>
              <span>
                Learners to the richer mobile experience and contributors to the appropriate
                reviewed participation path.
              </span>
            </li>
            <li>
              <strong>It does not replace</strong>
              <span>
                The mobile app's offline learning and contribution features, TribeStudio's
                workspace, or future translation tooling.
              </span>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
