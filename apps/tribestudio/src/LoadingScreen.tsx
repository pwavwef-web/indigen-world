/**
 * The studio's loading states, in one place.
 *
 * There were four different ones before this: a centred "Loading…", a centred
 * "Opening your studio...", a muted paragraph inside a page, and a bare
 * `notice`. Three of them were unstyled text on an empty page, which reads as
 * a failed navigation rather than as work in progress — and none of them
 * resembled the boot screen the visitor had just been looking at.
 *
 * `FullPageLoader` continues that boot screen: same mark, same drawing
 * animation, same words, so a cold start and an auth check look like one
 * uninterrupted wait instead of two screens.
 *
 * `RouteLoader` is the quieter one, for a lazy page arriving inside a shell
 * that is already drawn. It holds the content area rather than the viewport,
 * because replacing a drawn sidebar with a full-screen splash is a worse
 * experience than the wait it is covering.
 */

/** The drawing house-mark, shared with the boot screen in index.html. */
function LoaderMark() {
  return (
    <span className="loader__mark" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path d="M15 47V23l17-9 17 9v24" />
        <path d="M24 44V29m8 15V24m8 20V29" />
        <circle cx="32" cy="14" r="4" />
      </svg>
    </span>
  );
}

export function FullPageLoader({ note = 'Opening your workspace…' }: { note?: string }) {
  return (
    <div className="loader loader--full" role="status" aria-live="polite">
      <LoaderMark />
      <div className="loader__words">
        <p className="loader__name">TribeStudio</p>
        <p className="loader__note">{note}</p>
      </div>
      <span className="loader__bar" aria-hidden="true"><span /></span>
    </div>
  );
}

export function RouteLoader({ note = 'Loading' }: { note?: string }) {
  return (
    <div className="loader loader--route" role="status" aria-live="polite">
      <LoaderMark />
      <p className="loader__note">{note}</p>
      <span className="loader__bar" aria-hidden="true"><span /></span>
    </div>
  );
}
