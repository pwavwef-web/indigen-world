/**
 * src/pages/EcosystemPage.tsx
 *
 * Full product listing — all five entries from ECOSYSTEM_PRODUCTS,
 * including the website itself and the shared backend (unlike Home's
 * trimmed three-product highlight). Reuses the template's
 * "infrastructure-band" component for the Firebase/backend summary.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useRevealOnScroll } from "../lib/useRevealOnScroll";
import { ROUTES_BY_PATH } from "../content/navigation";
import { ECOSYSTEM_PRODUCTS } from "../content/ecosystem";
import { SectionHeading } from "../components/SectionHeading";
import { ProductCard } from "../components/ProductCard";
import { Icon } from "../components/Icon";

const route = ROUTES_BY_PATH["ecosystem"];

// The backend/infra entry is described in its own band below (matching
// the template's layout), not as a fourth grid card — so the grid only
// shows the four clickable/visitable products.
const GRID_PRODUCTS = ECOSYSTEM_PRODUCTS.filter((product) => product.id !== "backend");
const BACKEND = ECOSYSTEM_PRODUCTS.find((product) => product.id === "backend")!;

export function EcosystemPage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll(route.path);

  return (
    <>
      <section className="page-hero">
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
          <div className="product-grid">
            {GRID_PRODUCTS.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
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
