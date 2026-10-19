# iOS Back: the history entry must be pushed inside the tap (2026-10-20)

## Symptom

Josh, over 2026-10-19/20: "make back work from profile to community page",
"chrome on ios doesnt work", "find a solution how to make back button
navigation work in ios". On an iPhone, Back from a member's page did not
return to the Portfolios; on a desktop, in headless WebKit at phone size and
against the deployed dev host it always did. Three earlier fixes (per-index
member restore, a full-load Back path, an opacity-only page change) were each
verified in headless WebKit and changed nothing on the phone.

## Cause: WebKit's back/forward list hijacking prevention

Since iOS 16 WebKit marks a history item that script creates "without user
interaction" and hides it from the browser's own Back: the Safari button, the
edge swipe, and Chrome on iOS, which drives the same WKWebView. Going back from
such an item skips it **and the item before it** ("the one the user thinks
they're on"), and `popstate` never fires for either. Only `history.back()`
from script traverses the list as written, which is why the Portfolios pill
(43f54ac) worked where the button did not.

- bugs.webkit.org/show_bug.cgi?id=248303 comment 6 (Chris Dumez): entries
  added by JS "get skipped on user navigation unless they were added with a
  user interaction"; the advice is to call `pushState()` from the user's
  action.
- The rule, `Document::hasRecentUserInteractionForNavigationFromJS()`:
  true while a gesture is being handled, or within a window after the
  window's last activation — 1 s in the first iOS 16 builds, 10 s from
  253405@main (iOS 16.1), and since 278881@main (iOS 17.5) the 10 s run from
  the *transient* activation, which any activation-consuming API ends early.
- The flag is set only by `pushState` (`HistoryController::pushState`); a
  later `replaceState` leaves it alone. The skipping lives in
  `WebBackForwardList::itemStartingAtIndexSkippingItemsAddedByJSWithoutUserGesture`
  and is compiled for Apple platforms only (`shouldSkipItemsWithoutUserGestureForWebKitAPI`
  returns false elsewhere), so **no headless WebKit on Windows or Linux can
  reproduce it**, and Playwright's `goBack` is not the UI's Back in any case.

Astro's ClientRouter pushes the entry late: `moveToLocation` runs after the
fetch of the new page, after this site's leave fade (220 ms, `Layout.astro`),
after the view transition's capture. On a phone that is routinely a second
after the tap, which on an older iOS is outside the window outright and on a
current one leaves the entry at the mercy of whatever consumed the activation
in between.

## Fix: `src/lib/gestureHistory.ts`, imported by `Layout.astro`

`astro:before-preparation` is dispatched **synchronously inside the click's
call stack** (`router.js`: `navigate → transition → doPreparation →
dispatchEvent`, before the first `await`). A listener there pushes the entry
itself — `{index: current + 1, scrollX: 0, scrollY: 0}`, the router's own
state shape — for every `push` navigation whose destination differs from
`location.href`. The router then finds the URL already in place and skips its
own `pushState` (`moveToLocation` guards on `to.href !== location.href`);
the swap, the scroll bookkeeping and traversals are untouched.

Three details:

- After the loader the router writes the old page's scroll into the current
  entry, which is now the new one; `astro:before-swap` resets it to 0, which
  is what the router's push would have written.
- A navigation that never reaches its swap (a second tap before the first
  page arrived) leaves its entry; the next push **replaces** it, so Back never
  visits a page that was never shown. Verified: two taps 40 ms apart add one
  entry and land on the second member.
- The router's private history counter is not advanced by a push it did not
  make. It is re-read from `history.state` on every traverse, so the only
  effect is the direction label (`data-astro-transition`) on a Back after
  two pushes in a row; nothing on this site reads it.

The same module notes when a traverse was animated by the browser
(`hasUAVisualTransition` on the popstate event, the iOS edge swipe). Layout
then skips the leave fade and the 500 ms arrival hold for that navigation —
the swipe has already shown the page coming back, and a fade of the page
just left followed by half a second of blank read as the Back failing. The
flag is caught by an inline script in the head, registered before the
router's own popstate listener: same-target listeners fire in registration
order (a Chromium probe showed `prep → bubble → capture`), and the router
dispatches `astro:before-preparation` from inside its listener.

## What was verified (Chromium 1243 and WebKit 2368, 390 × 844, local preview)

Right after `page.click()` returns, before any swap: `location.href` is the
member's URL, `history.state.index` is 1, `history.length` grew by one, and
`navigator.userActivation.isActive` was true inside `astro:before-preparation`.
After the swap: the member page, state scrollY 0. Back lands on the member
left (rank 2 → rank 2), Forward returns, the Portfolios pill returns, a view
switch pushes exactly one entry, two quick taps push one entry. The
browser-animated branch was exercised with a synthetic `PopStateEvent`
carrying `hasUAVisualTransition: true`: no hold, no fade.

Not verified: a real iPhone. The skipping cannot be reproduced off Apple
hardware; the proof is WebKit's source and the timing above.
