export const ROUTE_LOADER_DELAY_MS = 100;

/**
 * Keep route imports behind one seam without extending their real load time.
 * RouteLoader owns the short grace period that prevents a flash on fast loads.
 */
export async function withRouteLoadingTiming<T>(modulePromise: Promise<T>): Promise<T> {
  return modulePromise;
}
