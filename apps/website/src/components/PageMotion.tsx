import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRoute } from '../app/router';
import { EditorialScene } from '../features/motion/EditorialScene';
import { themeForPage } from '../features/motion/themes';
import { useSiteMotion } from '../features/motion/SiteMotion';

const RemotionArtwork = lazy(() => import('../features/motion/RemotionArtwork'));

class ArtworkBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function PageMotion({ placement = 'banner' }: { placement?: 'banner' | 'art' | 'inline' }) {
  const { path } = useRoute();
  const theme = themeForPage(path);
  const { paused, reduced, toggle } = useSiteMotion();
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [foreground, setForeground] = useState(!document.hidden);
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setLoaded(true);
    }, { threshold: 0.05 });
    observer.observe(container.current);
    const update = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  const still = <EditorialScene theme={theme} />;
  return <div ref={container} className={`page-motion page-motion--${placement}`} data-motion-theme={theme}>
    <div className="page-motion__art" aria-hidden="true" inert>
      {loaded && !reduced ? <ArtworkBoundary fallback={still}>
        <Suspense fallback={still}><RemotionArtwork theme={theme} playing={visible && foreground && !paused} /></Suspense>
      </ArtworkBoundary> : still}
    </div>
    {!reduced && <button type="button" className="page-motion__toggle" onClick={toggle} aria-pressed={paused}>
      <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span> {paused ? 'Resume animations' : 'Pause animations'}
    </button>}
  </div>;
}
