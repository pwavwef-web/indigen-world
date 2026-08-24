export const ROUTE_LOADER_DELAY_MS = 100;
export const ROUTE_LOADER_MIN_VISIBLE_MS = 1_100;

/**
 * Gives every route transition a brief branded moment without restoring the
 * previous three-second delay. The initial grace period avoids a hard flash.
 */
export async function withRouteLoadingTiming<T>(modulePromise: Promise<T>): Promise<T> {
  const startedAt = performance.now();
  const module = await modulePromise;
  const elapsed = performance.now() - startedAt;
  const remainingVisibleTime =
    ROUTE_LOADER_DELAY_MS + ROUTE_LOADER_MIN_VISIBLE_MS - elapsed;

  if (remainingVisibleTime > 0) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, remainingVisibleTime);
    });
  }

  return module;
}
