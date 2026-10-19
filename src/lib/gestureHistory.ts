// THE HISTORY ENTRY IS PUSHED INSIDE THE TAP (2026-10-20, Josh: "find a
// solution how to make back button navigation work in ios").
//
// WebKit guards the back/forward list against hijacking: a history entry that
// a script pushes "without user interaction" is INVISIBLE to the browser's own
// Back — Safari's button, the edge swipe, and Chrome on iOS, which is the same
// WebKit behind its own chrome. Going back from such an entry skips it AND the
// entry before it ("the one the user thinks they're on"), and no popstate
// fires for either (bugs.webkit.org/show_bug.cgi?id=248303, comment 6). An
// entry counts as user-initiated only if pushState runs while the tap is
// being handled, or inside a short window after the window's last activation
// (10s on iOS 17.5+, but any API that consumes the activation ends it early;
// 1s on the first iOS 16 builds). history.back() from a script does not skip,
// which is why the Portfolios pill worked where the button did not.
//
// Astro's ClientRouter pushes the entry LATE: after the fetch of the new
// page, after this site's leave fade (Layout.astro), after the view
// transition's capture — on a phone, well outside any gesture. Every entry
// this site created was therefore a candidate for skipping, and Back from a
// member's page could land on the page before the Portfolios, or nowhere.
// Headless WebKit never showed it: the skipping is compiled for Apple
// platforms only (WebBackForwardList.cpp, shouldSkipItemsWithoutUserGesture-
// ForWebKitAPI), and Playwright's goBack is not the UI's Back anyway.
//
// The fix is timing. astro:before-preparation is dispatched SYNCHRONOUSLY in
// the click's own call stack (router.js: navigate → transition → doPreparation
// → dispatchEvent, before the first await), so an entry pushed here is pushed
// inside the gesture on every iOS that has the guard. The router then finds
// location.href already at the destination and skips its own pushState
// (moveToLocation guards on `to.href !== location.href`); everything else it
// does — the swap, scroll bookkeeping, the traverse handling — is unchanged.
// The state carries the router's own shape ({index, scrollX, scrollY}) with
// the next index, so the per-index memory this site keeps (the Portfolios
// deal seed, the member a Back returns to) keys exactly as before.
//
// Two consequences, both deliberate:
// - The router's private history counter is not advanced by a push it did
//   not make. It is re-read from history.state on every traverse, so the only
//   effect is the direction label on a Back after two pushes in a row
//   (data-astro-transition says "forward"); nothing on this site reads it.
// - After the loader the router writes the OLD page's scroll offset into the
//   entry that is now current — the new one. before-swap below resets it to
//   0, which is what the router's own push would have written.
//
// A navigation that never reaches its swap (a second tap before the first
// page arrived) leaves its entry behind; the next push REPLACES that entry
// instead of adding one, so Back never visits a page that was never shown.

type RouterState = { index?: number; scrollX?: number; scrollY?: number } | null;

/** The destination pushed for a navigation whose page has not arrived yet. */
let pendingHref: string | null = null;

// ── THE BROWSER'S OWN BACK ANIMATION ──
// An edge swipe on iOS shows the previous page sliding in BEFORE popstate
// fires (hasUAVisualTransition on the event). Running this site's leave fade
// and the 500ms arrival hold on top of that shows the page just left a
// second time, then a blank, then the page the swipe already showed. The
// flag is caught by an inline script in Layout's <head> — the router's own
// popstate listener runs before anything registered after it (same-target
// listeners fire in registration order, the capture flag notwithstanding,
// as a probe in Chromium showed) and dispatches astro:before-preparation
// from inside it — and Layout.astro skips both animations for that one
// navigation. Chrome on iOS draws its gesture itself and sets no flag, so
// its Back keeps the fade.
let traversalAnimatedByBrowser = false;

function popstateHadUATransition(): boolean {
  return (window as unknown as { __vscnPopstateUA?: boolean }).__vscnPopstateUA === true;
}

/** True while the navigation in flight, or the page just arrived, is a Back
 *  or Forward the browser already animated (the iOS swipe). */
export function browserAnimatedThisTraversal(): boolean {
  return traversalAnimatedByBrowser;
}

document.addEventListener("astro:before-preparation", (event) => {
  const prep = event as unknown as { navigationType?: string; to: URL };
  traversalAnimatedByBrowser = prep.navigationType === "traverse" && popstateHadUATransition();
  (window as unknown as { __vscnPopstateUA?: boolean }).__vscnPopstateUA = false;
  if (prep.navigationType !== "push") return;
  const href = prep.to.href;
  // The router does not push for these either: a same-URL navigation only
  // re-renders the page.
  if (href === location.href) return;
  const state = history.state as RouterState;
  // Not under the router's bookkeeping (it writes {index: 0} at load): leave
  // the push to it rather than invent a shape.
  if (!state || typeof state.index !== "number") return;
  try {
    if (pendingHref !== null) {
      history.replaceState({ ...state, scrollX: 0, scrollY: 0 }, "", href);
    } else {
      history.pushState({ index: state.index + 1, scrollX: 0, scrollY: 0 }, "", href);
    }
    pendingHref = href;
  } catch {
    /* A rate-limited or refused pushState costs nothing: the router pushes
       at the swap, as it did before. */
  }
});

document.addEventListener("astro:before-swap", () => {
  if (pendingHref === null || location.href !== pendingHref) return;
  const state = history.state as RouterState;
  if (!state) return;
  try {
    history.replaceState({ ...state, scrollX: 0, scrollY: 0 }, "");
  } catch {
    /* The offset the router wrote stays; a traverse back lands a scroll off. */
  }
});

document.addEventListener("astro:after-swap", () => {
  pendingHref = null;
});
