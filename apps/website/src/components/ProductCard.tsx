/**
 * src/components/ProductCard.tsx
 *
 * One ecosystem product card. Adapted from the template's ProductCard
 * (which took five separate props) to take a single typed
 * `EcosystemProduct` object instead — adding a field to the data shape
 * now only means updating src/lib/types.ts and this component, not
 * every call site that constructs a card by hand.
 *
 * `tone` (indigo/terracotta/gold accent) is derived from the product's
 * position in the list rather than stored on the data, since it's a
 * purely visual rotation, not a fact about the product.
 */
import type { EcosystemProduct } from "../lib/types";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { StatusBadge } from "./StatusBadge";
import { Link } from "../app/router";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

const TONES = ["indigo", "terracotta", "gold"] as const;

const PRODUCT_ICONS: Record<string, IconName> = {
  "public-website": "globe",
  tribestudio: "studio",
  "mobile-app": "mobile",
  "project-kassena": "book",
  backend: "layers",
};

export function ProductCard({ product, index = 0 }: { product: EcosystemProduct; index?: number }) {
  const tone = TONES[index % TONES.length];
  const icon = PRODUCT_ICONS[product.id] ?? "globe";

  return (
    <article className={`product-card product-card--${tone}`} data-reveal>
      <div className="product-card__topline">
        <span className="product-card__icon">
          <Icon name={icon} />
        </span>
        <StatusBadge status={product.status} />
      </div>
      <p className="eyebrow">{product.eyebrow}</p>
      <h3>{product.title}</h3>
      <p>{product.body}</p>
      <dl className="product-card__meta">
        <div>
          <dt>For</dt>
          <dd>{product.audience}</dd>
        </div>
        <div>
          <dt>{product.ownerLabel ?? "Owner"}</dt>
          <dd>{product.owner}</dd>
        </div>
      </dl>
      {product.href !== undefined &&
        (product.external ? (
          <a
            href={product.href}
            className="card-link"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEvent(ANALYTICS_EVENTS.ecosystemProductClick, { product: product.id })
            }
          >
            {product.ctaLabel ?? "Explore the project"} <Icon name="arrow" size={17} />
          </a>
        ) : (
          <Link
            to={product.href}
            className="card-link"
            onClick={() =>
              trackEvent(ANALYTICS_EVENTS.ecosystemProductClick, { product: product.id })
            }
          >
            {product.ctaLabel ?? "Explore the project"} <Icon name="arrow" size={17} />
          </Link>
        ))}
    </article>
  );
}
