import { BrandMark } from './ui/BrandMark';

/**
 * The studio's two loading states.
 *
 * `FullPageLoader` continues the boot screen in index.html — the same mark on
 * the same grid ground — so a cold start and an access check read as one
 * wait. `RouteLoader` is the quieter one for a lazy page arriving inside a
 * shell that is already drawn: it holds the content area with the shape of a
 * page instead of replacing a drawn sidebar with a splash.
 */
export function FullPageLoader({ note = 'Opening your workspace…' }: { note?: string }) {
  // Same geometry as #boot in index.html, so the hand-over is invisible.
  return (
    <div className="ts-boot" role="status" aria-live="polite">
      <BrandMark size="56px" live className="ts-boot__mark" />
      <span className="ts-boot__words">
        <span className="ts-boot__name">TribeStudio</span>
        <span className="ts-boot__note">{note}</span>
      </span>
      <span className="ts-boot__bar" aria-hidden="true"><span /></span>
    </div>
  );
}

export function RouteLoader({ note = 'Loading' }: { note?: string }) {
  return (
    <div className="ts-page" role="status" aria-live="polite" aria-label={note}>
      <div className="ts-skeleton" aria-hidden="true">
        <span className="ts-skel ts-skel--line" style={{ width: '7rem' }} />
        <span className="ts-skel ts-skel--title" style={{ height: '1.9rem', maxWidth: '22rem' }} />
        <span className="ts-skel ts-skel--line" style={{ maxWidth: '34rem' }} />
      </div>
      <div className="ts-stats" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="ts-stat">
            <span className="ts-skel ts-skel--line" style={{ width: '55%' }} />
            <span className="ts-skel ts-skel--title" style={{ width: '40%', height: '1.6rem' }} />
          </div>
        ))}
      </div>
      <div className="ts-panel" aria-hidden="true">
        <span className="ts-skel ts-skel--title" style={{ width: '30%' }} />
        <span className="ts-skel ts-skel--line" />
        <span className="ts-skel ts-skel--line" style={{ width: '86%' }} />
        <span className="ts-skel ts-skel--line" style={{ width: '64%' }} />
      </div>
      <span className="sr-only">{note}</span>
    </div>
  );
}
