import { useState } from "react";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { ECOSYSTEM_PRODUCTS } from "../content/ecosystem";
import { SectionHeading } from "../components/SectionHeading";
import { ProductCard } from "../components/ProductCard";
import { Icon } from "../components/Icon";

const route = ROUTES_BY_PATH["ecosystem"];

const GRID_PRODUCTS = ECOSYSTEM_PRODUCTS.filter((product) => product.id !== "backend");
const BACKEND = ECOSYSTEM_PRODUCTS.find((product) => product.id === "backend")!;

type AudienceFilter = "all" | "creators" | "learners" | "researchers" | "custodians";

export function EcosystemPage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);

  const [audience, setAudience] = useState<AudienceFilter>("all");

  const filteredProducts = GRID_PRODUCTS.filter((p) => {
    if (audience === "all") return true;
    if (audience === "creators") return p.id === "tribestudio" || p.id === "website";
    if (audience === "learners") return p.id === "mobile" || p.id === "kasena";
    if (audience === "researchers") return p.id === "kasena" || p.id === "website";
    if (audience === "custodians") return p.id === "tribestudio" || p.id === "kasena";
    return true;
  });

  return (
    <>
      <section className="page-hero page-hero--ecosystem">
        <div className="container">
          <SectionHeading
            eyebrow="One ecosystem, several products"
            title="Different doors. One cultural future."
            body="Each product has a clear job. Together, they connect public discovery, cultural creation and everyday learning without collapsing governance boundaries."
            light
            as="h1"
          />
        </div>
      </section>

      <section className="section section--white">
        <div className="container">
          {/* Interactive Audience Filter Matrix */}
          <div className="ecosystem-filter-bar" data-reveal>
            <span className="filter-label">Filter by Audience &amp; Role:</span>
            <div className="filter-pills">
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
                  onClick={() => setAudience(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="product-grid">
            {filteredProducts.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>

          {/* Ecosystem Architecture Dataflow Visualizer */}
          <div className="ecosystem-dataflow iw-glass-card" data-reveal>
            <div className="dataflow-head">
              <span className="iw-eyebrow">✦ Governed Architectural Pipeline</span>
              <h3>How Cultural Knowledge Flows Through Indigen World</h3>
              <p className="tiny muted">From oral recording in community cells to validated publication.</p>
            </div>

            <div className="dataflow-steps">
              <div className="dataflow-step">
                <span className="step-num">01</span>
                <strong>1. Community Capture</strong>
                <p className="tiny">Oral recording &amp; sentence pairing in TribeStudio with explicit consent.</p>
              </div>
              <div className="dataflow-arrow" aria-hidden="true">➔</div>
              <div className="dataflow-step">
                <span className="step-num">02</span>
                <strong>2. Trusted Storage &amp; Functions</strong>
                <p className="tiny">Encrypted Cloud Storage &amp; Firebase security rules enforcing permission tiers.</p>
              </div>
              <div className="dataflow-arrow" aria-hidden="true">➔</div>
              <div className="dataflow-step">
                <span className="step-num">03</span>
                <strong>3. Custodian Validation</strong>
                <p className="tiny">Elders &amp; qualified teachers review dialect fidelity and confirm publication licence.</p>
              </div>
              <div className="dataflow-arrow" aria-hidden="true">➔</div>
              <div className="dataflow-step">
                <span className="step-num">04</span>
                <strong>4. Governed Publishing</strong>
                <p className="tiny">Released to Indigen World Mobile &amp; approved educational/research datasets.</p>
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
              <strong>It routes</strong>
              <span>
                Visitors to the right product, waitlist or contribution path once each is
                approved and live.
              </span>
            </li>
            <li>
              <strong>It does not rebuild</strong>
              <span>
                Dashboards, dictionaries, translators or validator tools — those belong to their
                own products.
              </span>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
