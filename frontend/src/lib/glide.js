/** A playlist's cover and title glide between its shelf and its page: the browser animates them, the rest swaps at once. */

let arrive = null;
const MAX_WAIT_MS = 300; // A page that isn't ready by then simply appears, without the glide.

/** Changes page with the glide, or at once without the browser's support or when motion is reduced. */
export function glide(go) {
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    go();
    return;
  }
  document.startViewTransition(
    () =>
      new Promise((resolve) => {
        arrive = resolve;
        go();
        setTimeout(resolve, MAX_WAIT_MS);
      }),
  );
}

/** The destination page calls this once mounted: the browser can then take its picture. */
export function glideArrived() {
  arrive?.();
  arrive = null;
}
