import { useEffect, useState } from "react";
import { BrandMark } from "./BrandMark";
import { ROUTE_LOADER_DELAY_MS } from "../lib/routeLoading";

/** Branded fallback shown while a lazy route bundle is being loaded. */
export function RouteLoader() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsVisible(true), ROUTE_LOADER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!isVisible) {
    return <div className="route-loading route-loading--pending" aria-hidden="true" />;
  }

  return (
    <div className="route-loading" role="status" aria-live="polite" aria-atomic="true">
      <div className="route-loader__visual" aria-hidden="true">
        <span className="route-loader__ring" />
        <BrandMark compact />
      </div>
      <span className="route-loader__label">Loading page…</span>
    </div>
  );
}
