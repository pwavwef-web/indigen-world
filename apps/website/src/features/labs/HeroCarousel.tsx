import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { carouselReducer, initialCarousel, isAutoplaying, swipeDirection } from "./carousel";
import type { LabsPhoto } from "./labs-media";
import { useSiteMotion } from "../motion/SiteMotion";

const INTERVAL = 8000;

/**
 * Photographic hero. The copy is passed in and never changes with the slides;
 * it sits on a solid ink panel, so contrast does not depend on any photo.
 */
export function HeroCarousel({ photos, children }: { photos: LabsPhoto[]; children: ReactNode }) {
  // Reduced motion, or the site-wide "Pause animations" choice, starts the slideshow paused.
  const { paused: sitePaused, reduced } = useSiteMotion();
  const [state, dispatch] = useReducer(carouselReducer, photos.length, (n) => initialCarousel(n, reduced || sitePaused));
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0]));
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const root = useRef<HTMLElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const playing = isAutoplaying(state);
  const next = (state.index + 1) % photos.length;

  // Only the visible slide and the one after it are ever requested.
  useEffect(() => {
    setMounted((m) => (m.has(state.index) && m.has(next) ? m : new Set([...m, state.index, next])));
  }, [state.index, next]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => dispatch({ type: "next", manual: false }), INTERVAL);
    return () => window.clearTimeout(timer);
  }, [playing, state.index]);

  useEffect(() => {
    const visibility = () => dispatch({ type: "hidden", value: document.hidden });
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) =>
      dispatch({ type: "offscreen", value: !entry.isIntersecting }),
    );
    if (root.current) observer.observe(root.current);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
    };
  }, []);

  const current = photos[state.index];
  return (
    <section
      ref={root}
      className="lab-hero"
      aria-roledescription="carousel"
      aria-label="Indigen World Labs introduction"
      data-playing={playing}
      onPointerEnter={(e) => e.pointerType === "mouse" && dispatch({ type: "hover", value: true })}
      onPointerLeave={(e) => e.pointerType === "mouse" && dispatch({ type: "hover", value: false })}
      onFocus={(e) => {
        // Keyboard focus holds the rotation; a mouse click on a control does not.
        if ((e.target as HTMLElement).matches(":focus-visible")) dispatch({ type: "focus", value: true });
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) dispatch({ type: "focus", value: false });
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        if ((e.target as HTMLElement).closest("input, textarea, select")) return;
        e.preventDefault();
        dispatch({ type: e.key === "ArrowRight" ? "next" : "prev", manual: true });
      }}
    >
      <div className="lab-hero__panel">
        <div className="lab-hero__copy">{children}</div>
        <div className="lab-hero__controls">
          <div className="lab-hero__steps" role="group" aria-label="Choose a photograph">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className="lab-hero__step"
                aria-current={i === state.index ? "true" : undefined}
                aria-label={`Photo ${i + 1} of ${photos.length}: ${p.caption}`}
                onClick={() => dispatch({ type: "go", index: i })}
              >
                <span className="lab-hero__step-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span className="lab-hero__step-label" aria-hidden="true">{p.label}</span>
                <span className="lab-hero__step-bar" aria-hidden="true">
                  {i === state.index && <span key={`${state.index}-${playing}`} className="lab-hero__step-fill" />}
                </span>
              </button>
            ))}
          </div>
          <div className="lab-hero__buttons">
            <button type="button" className="lab-icon-btn" onClick={() => dispatch({ type: "prev", manual: true })}>
              <span aria-hidden="true">←</span>
              <span className="lab-visually-hidden">Previous photo</span>
            </button>
            <button type="button" className="lab-icon-btn" onClick={() => dispatch({ type: "next", manual: true })}>
              <span aria-hidden="true">→</span>
              <span className="lab-visually-hidden">Next photo</span>
            </button>
            <button
              type="button"
              className="lab-icon-btn lab-icon-btn--wide"
              onClick={() => dispatch({ type: "toggle" })}
            >
              <span aria-hidden="true">{state.userPaused ? "▶" : "❚❚"}</span>
              <span>{state.userPaused ? "Play" : "Pause"}</span>
              <span className="lab-visually-hidden"> slideshow</span>
            </button>
          </div>
        </div>
      </div>
      <div
        className="lab-hero__media"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start) return;
          const direction = swipeDirection(e.clientX - start.x, e.clientY - start.y);
          if (direction) dispatch({ type: direction > 0 ? "next" : "prev", manual: true });
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        {photos.map((p, i) => (
          <figure
            key={p.id}
            className={`lab-hero__slide${i === state.index ? " is-active" : ""}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${photos.length}`}
            aria-hidden={i !== state.index}
          >
            {mounted.has(i) && !failed.has(i) && (
              <img
                src={p.src}
                srcSet={p.srcSet}
                sizes="(min-width: 900px) 60vw, 100vw"
                width={p.width}
                height={p.height}
                alt={p.alt}
                style={{ objectPosition: p.focus }}
                decoding="async"
                fetchPriority={i === 0 ? "high" : "low"}
                onError={() => setFailed((f) => new Set([...f, i]))}
              />
            )}
            <figcaption className="lab-hero__caption">
              <span>{p.caption}</span>
              <small>
                Photo: {p.credit} · {p.licence}
              </small>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="lab-visually-hidden" aria-live={playing ? "off" : "polite"}>
        Photo {state.index + 1} of {photos.length}: {current.caption}
      </p>
    </section>
  );
}
