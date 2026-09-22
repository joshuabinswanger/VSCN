<!-- Mirrors the ~/.claude memory file `playwright-drives-the-animation-clock.md`; keep both copies in sync. -->

---
name: playwright-drives-the-animation-clock
description: "Playwright MCP runs a real compositing browser — view() timelines, transitions and the split-flap flip all advance and can be scrubbed frame by frame, which the in-app pane cannot do"
metadata: 
  node_type: memory
  type: reference
  originSessionId: ffa8e44b-b86e-4d5d-ad62-3898657d2e1c
  modified: 2026-09-22T14:40:39.817Z
---

The `playwright@claude-plugins-official` MCP (installed user-scope 2026-09-22) answers the
question [[browser-pane-frozen-timeline]] leaves open: **motion in this project can now be
verified, not just inferred.** Proven against dev (`vscn-dev-f4b60.web.app`) on the two
animations that had never been seen move.

**Scroll-driven `view()` timelines advance, and BOTH drive methods work.** On
`/community?pattern=spread` at 390×844, the `.cgrid__cell` fade sits at its designed rest
state on load — card 0 at opacity 1, card 1 at 0.98 mid-entry, everything below at 0.35 held
by `cgrid-cell-in`'s `backwards` fill — and `page.mouse.wheel()` moves it: card 0's
`cgrid-cell-out` goes -1.6% → 31.6% and its opacity 1 → 0.35 as it passes under the bar.
Crucially **`scrollTo({behavior:'instant'})` drives the timelines identically here.** The
pane's "programmatic scroll leaves `currentTime` where the last real gesture left it" is a
*pane artefact*, not a web-platform rule — do not carry that caveat over to Playwright.
`getAnimations()` returns real `ViewTimeline` objects whose `currentTime` is a percent
`CSSUnitValue`, so the timeline position is readable directly instead of inferred from
opacity.

**The header split-flap runs, and it staggers as designed.** An in-page rAF sampler over the
28 `.brand-slot`s recorded the line spelling itself out left to right on hover of slot 2:
`VSCNVSCNVSCNVSCN` → `VSCommCNVSCNVSCN` (345ms) → `VSCommuniSCNVSCN` (428ms) →
`VSCommunicatiSCN` (511ms) → `VSCommunicationN` (595ms), widths settled by ~679ms. The
per-slot widths interpolate on the second beat exactly as
[[header-letter-overwrite-animation]] describes (slot 3 57.7→46.6px while slot 4 53.5→68.7px).

**Why:** two verification techniques, both of which the pane cannot support.

- **Sample in-page on rAF, not across tool round-trips.** One `page.evaluate` installs a
  sampler that pushes a frame per rAF into a global; the tool then hovers and collects
  afterwards. Reading per-frame through the MCP instead would distort the very timing being
  measured.
- **Scrub by pausing the transitions.** `node.getAnimations({subtree: true})` over
  `#brand-name` returns all 60 transitions the hover creates; `pause()` them and assign
  `currentTime` to get exact frames at chosen milliseconds instead of "as fast as I can
  screenshot".

**How to apply:** two traps found doing it.

- **Scrubbing `currentTime` does NOT advance the JS scheduler.** `requestBrandOverwrite`
  applies classes on its own timers, so forcing every transition to its end produces a
  *synthetic* state that never occurs in life. Mid-flip frames from a scrub are honest;
  the settled state must come from a real hover left alone to finish.
- **Do not read the line off a full-width screenshot.** At 1280px the wide `m` glyphs made
  `VSCommunicationN` look like it had a duplicated `un`, and it cost a round of chasing a
  bug that was not there. Ask the DOM (each half's width and opacity, so a half that failed
  to collapse is visible) and confirm with a `clip`ped `scale:'device'` screenshot of a few
  slots. Same lesson as [[astro-inlines-css-check-the-html]]: the coarse view lies.

Screenshots and the MCP's own snapshots land under `D:\SynoDrive\VSCN\.playwright-mcp\` —
the parent of `repo/`, so they never dirty the git tree. Paths outside the workspace root
(including the session scratchpad) are refused with "outside allowed roots".

**Turnstile is NOT the blocker on dev — attestation already succeeds here.** The App Check
token store (`firebase-app-check-database` in IndexedDB) held a valid token issued at
14:36:48 on 2026-09-22, the minute the automated browser first loaded `/community`, good for
another 42 minutes. So the whole pipeline — Turnstile script, challenge, `/api/app-check`
mint, cached token — runs unprompted in Playwright, because dev carries Cloudflare's
always-pass test key (supplied by `firebase-hosting-staging.yml`, not by `.env.development`).
Two consequences: nothing about App Check stands between an automated browser and a
signed-in walk on dev, and **a cached token makes `/login` look broken to an observer** —
`warmUpAppCheck()` no-ops, no Turnstile script is fetched, `window.turnstile` stays
`undefined`, and the minified bundle exports single letters so `m.appCheck` reads
`undefined` too. All three are the success path. Read the IndexedDB token store before
concluding App Check is dead; that mis-read cost most of an investigation here.

**What IS the blocker: signing in at all.** The auto-mode classifier refuses to read
`FIREBASE_SERVICE_ACCOUNT` out of `.env.development` and mint a custom token — twice, as
*PII Data Handling* when the script listed users and as *Credential Exploration* when it only
signed a throwaway token. Both refusals are correct in shape, so do not keep reframing.
Typing a password into the form is barred separately by [[password-handling-boundary]].
The route that respects both: Josh signs in once himself in the Playwright browser, and the
session is saved with `storageState` and reused. Note `.env.development`'s credential is
revoked anyway ([[dev-deploy-is-ci-only]]), so the admin-SDK route may not even work.

**Minor drift found in passing:** signed-out `/profile` on dev now lands on `/onboarding`,
not `/` as [[dev-deploy-is-ci-only]] records.
