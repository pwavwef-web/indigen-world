/**
 * src/components/Button.tsx
 *
 * One button component for every call-to-action on the site. The
 * uploaded template's Button only rendered `<a href>` — fine for a
 * single scrolling page where every "action" is a scroll-to-anchor,
 * but the new Get Involved/Contact pages need real form submit
 * buttons too. This version renders three different elements
 * depending on which prop is passed:
 *
 *   <Button to="get-involved">        -> in-app <Link> (router)
 *   <Button href="mailto:...">        -> external/mailto <a>
 *   <Button type="submit">            -> real <button> (forms)
 *
 * The three prop shapes are mutually exclusive in the type below, so
 * passing both `to` and `href` is a compile error rather than a
 * component that silently ignores one of them.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "../app/router";
import { Icon } from "./Icon";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";

export type ButtonVariant = "primary" | "secondary";

interface SharedProps {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
  /** Most buttons on this site are paired with an arrow icon, matching
   *  the template's CTA style. Set false for form-submit buttons,
   *  where an arrow reads oddly next to "Sending…". */
  showArrow?: boolean;
}

interface RouteButtonProps extends SharedProps {
  to: string;
  href?: never;
  type?: never;
}

interface ExternalButtonProps extends SharedProps {
  href: string;
  to?: never;
  type?: never;
  external?: boolean;
}

interface SubmitButtonProps
  extends SharedProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  to?: never;
  href?: never;
  type: "submit" | "button" | "reset";
}

type ButtonProps = RouteButtonProps | ExternalButtonProps | SubmitButtonProps;

export function Button(props: ButtonProps) {
  const { variant = "primary", children, className = "", showArrow = true } = props;
  const classes = `button button--${variant} ${className}`.trim();
  const label = typeof children === "string" ? children : "cta";

  if ("to" in props && props.to !== undefined) {
    return (
      <Link
        to={props.to}
        className={classes}
        onClick={() => {
          if (variant === "primary") {
            trackEvent(ANALYTICS_EVENTS.primaryCtaClick, {
              destination: props.to,
              label,
            });
          }
        }}
      >
        <span>{children}</span>
        {showArrow && <Icon name="arrow" size={18} />}
      </Link>
    );
  }

  if ("href" in props && props.href !== undefined) {
    const { href, external } = props;
    return (
      <a
        className={classes}
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        onClick={() => {
          if (external) {
            trackEvent(ANALYTICS_EVENTS.outboundProductLink, { destination: href, label });
          }
        }}
      >
        <span>{children}</span>
        {showArrow && <Icon name="arrow" size={18} />}
      </a>
    );
  }

  const { variant: _v, children: _c, className: _cl, showArrow: _sa, to: _t, href: _h, ...buttonAttrs } =
    props as SubmitButtonProps;

  return (
    <button className={classes} {...buttonAttrs}>
      <span>{children}</span>
      {showArrow && <Icon name="arrow" size={18} />}
    </button>
  );
}
