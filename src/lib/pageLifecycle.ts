// ONE PAGE VISIT'S LIFETIME, AS AN AbortSignal (2026-09-29).
//
// ClientRouter keeps every module alive across navigations, so whatever an
// astro:page-load handler registers — a listener on window or on a
// `transition:persist` element, an auth observer, a ResizeObserver — outlives
// the document it was registered for unless something takes it back. The
// profile editor has done that with its own AbortController since the 09-28
// review; this is the same pattern for the pages around it: one signal per
// visit, aborted on astro:before-swap, handed to every `addEventListener` as
// `{ signal }` and to releaseWith() for anything that returns an unsubscribe.
//
// Call it only once the handler knows the page is its own (after the "is my
// root element here?" check), so a page without the component registers
// nothing. The before-swap listener is `once`, so even a call on every
// navigation cannot stack.
//
// No Firebase and no astro:transitions import, so node --test can load it
// (tests/unit/pageLifecycle.test.mjs); watchAuth() in auth.ts is the auth
// half.

/** A signal that aborts when the router starts swapping this page out. */
export function pageLifetime(events: EventTarget = document): AbortSignal {
  const controller = new AbortController();
  events.addEventListener("astro:before-swap", () => controller.abort(), { once: true });
  return controller.signal;
}

/**
 * Runs `release` when `signal` aborts — or at once, if it already has. The
 * second half is the point: an abort listener added to an already-aborted
 * signal never fires, so a subscription made after an await that outlived
 * its page would otherwise be kept for good.
 */
export function releaseWith(signal: AbortSignal, release: () => void): void {
  if (signal.aborted) {
    release();
    return;
  }
  signal.addEventListener("abort", () => release(), { once: true });
}
