import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

function cx(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  return <button className={cx(`iw-button iw-button--${variant}`, className)} {...rest} />;
}

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(`iw-badge iw-badge--${tone}`, className)} {...rest}>
      {children}
    </span>
  );
}

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Container({ className, children, ...rest }: ContainerProps) {
  return (
    <div className={cx('iw-container', className)} {...rest}>
      {children}
    </div>
  );
}

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  body?: string;
}

export function SectionHeading({ eyebrow, title, body }: SectionHeadingProps) {
  return (
    <div className="iw-section-heading">
      {eyebrow ? <p className="iw-eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {body ? <p className="iw-section-heading__body">{body}</p> : null}
    </div>
  );
}
