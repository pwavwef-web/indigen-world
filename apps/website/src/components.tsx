import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type IconName =
  | 'arrow'
  | 'book'
  | 'check'
  | 'community'
  | 'globe'
  | 'layers'
  | 'menu'
  | 'mobile'
  | 'shield'
  | 'spark'
  | 'studio'
  | 'x';

export type CardProps = {
  eyebrow: string;
  title: string;
  body: string;
  icon: IconName;
  tone?: 'indigo' | 'terracotta' | 'gold';
  tag?: string;
  to?: string;
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const shared = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'arrow':
      return (
        <svg {...shared}>
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );
    case 'book':
      return (
        <svg {...shared}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
          <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
        </svg>
      );
    case 'check':
      return (
        <svg {...shared}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case 'community':
      return (
        <svg {...shared}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18" />
          <path d="M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...shared}>
          <path d="m12 2 9 5-9 5-9-5z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 17 9 5 9-5" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...shared}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'mobile':
      return (
        <svg {...shared}>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M10 18h4" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...shared}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...shared}>
          <path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5z" />
          <path d="m19 15-.75 2.25L16 18l2.25.75L19 21l.75-2.25L22 18l-2.25-.75z" />
          <path d="m5 14-.75 2.25L2 17l2.25.75L5 20l.75-2.25L8 17l-2.25-.75z" />
        </svg>
      );
    case 'studio':
      return (
        <svg {...shared}>
          <path d="M4 19h16" />
          <path d="M6 17V8l6-4 6 4v9" />
          <path d="M9 17v-5h6v5" />
          <path d="M8 9h.01M16 9h.01" />
        </svg>
      );
    case 'x':
      return (
        <svg {...shared}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
  }
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path className="brand-mark__frame" d="M15 47V23l17-9 17 9v24" />
        <path className="brand-mark__line" d="M24 44V29m8 15V24m8 20V29" />
        <circle className="brand-mark__sun" cx="32" cy="14" r="4" />
      </svg>
    </span>
  );
}

export function Button({
  href,
  children,
  variant = 'primary',
  external = false,
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'text';
  external?: boolean;
}) {
  const className = `button button--${variant}`;
  const inner = (
    <>
      <span>{children}</span>
      <Icon name="arrow" size={18} />
    </>
  );

  // Internal route paths use the router; anchors and external links stay as <a>.
  if (href.startsWith('/') && !external) {
    return (
      <Link className={className} to={href}>
        {inner}
      </Link>
    );
  }

  return (
    <a
      className={className}
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      {inner}
    </a>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  light = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  light?: boolean;
}) {
  return (
    <div className={`section-heading${light ? ' section-heading--light' : ''}`} data-reveal>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {body ? <p className="section-heading__body">{body}</p> : null}
    </div>
  );
}

export function ProductCard({ eyebrow, title, body, icon, tone = 'indigo', tag, to }: CardProps) {
  return (
    <article className={`product-card product-card--${tone}`} data-reveal>
      <div className="product-card__topline">
        <span className="product-card__icon">
          <Icon name={icon} />
        </span>
        {tag ? <span className="chip">{tag}</span> : null}
      </div>
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{body}</p>
      {to ? (
        <Link to={to} className="card-link">
          Learn more <Icon name="arrow" size={17} />
        </Link>
      ) : null}
    </article>
  );
}
