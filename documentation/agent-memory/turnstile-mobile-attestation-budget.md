> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/turnstile-mobile-attestation-budget.md` memory file; keep the two in sync.

---
name: turnstile-mobile-attestation-budget
description: "2026-09-08 iOS Chrome \"server not reached\" = App Check attestation outliving Auth's 30 s clock (mobile Turnstile challenge 15-25 s); LIVE ON DEV as merge ccfd4db (one 24 s budget, page-load warm-up from the two forms, spare late token); VERIFIED on Josh's iPhone (Chrome iOS) on dev; prod release open"
metadata: 
  node_type: memory
  type: project
  originSessionId: 76b111b0-e3d0-4536-9403-067436b8cd57
  modified: 2026-09-08T07:26:23.316Z
---

Josh reported on 2026-09-08 that login fails from Chrome on iOS with the "could not reach the login server" sentence, and asked for that sentence to stop naming Google (reCAPTCHA is gone from the login path since [[turnstile-app-check-provider]]).

**Root cause (reasoned, not reproduced on a device):** Firebase Auth awaits the App Check token INSIDE its 30 s `NetworkTimeout` race ([[network-error-has-two-faces]]). The Turnstile provider had per-step deadlines — 20 s script, 25 s challenge, unbounded mint — but no shared one, and the first challenge only started at the login click, because Auth registers no App Check token listener and so the SDK's proactive refresher never runs on /login. Cloudflare's community (Sep 2025) documents that exactly our widget configuration (Managed, `execution: execute`, `appearance: interaction-only`) intermittently takes 15-25 s on mobile where desktop takes under 3 s. Mobile challenge + script + mint > 30 s → `auth/network-request-failed` with no detail → the network sentence. So the "30 s face" has a third cause besides a blocked script: a slow one.

**Fix (branch `fix/turnstile-mobile-timeout`, worktree `D:\SynoDrive\VSCN\wt-fix-turnstile-mobile`, commit `9d9af3a` + a docs commit, NOT pushed, no PR):**
- `src/lib/appCheckTiming.ts` (pure, unit-tested): `ATTESTATION_BUDGET_MS = 24_000` for script + challenge + mint together; `spareIsUsable` (a Turnstile token is good for 5 min, spare kept 4).
- `src/lib/appCheckTurnstile.ts`: a `Budget` bounds every step; the challenge clock sits on `pending` itself, so a token arriving after the clock (late checkbox click, Turnstile's own refresh-expired cycle) lands in `spare` and the next attempt is instant — this closes the "late click is dropped" follow-up.
- `warmUpAppCheck()` in `firebase.ts`, called by AuthForm and OnboardingForm on `astro:page-load`. Deliberately NOT in firebase.ts's module body: Navbar imports firebase.ts on every page, and a landing-page visitor must not get a Turnstile checkbox.
- Network sentence (EN/DE) reworded: "the login server ... identitytoolkit.googleapis.com, the Firebase Authentication service this site uses". The host is still Google's and must stay in the sentence; only the "Google's login service" framing went.

**Verified in the browser pane (dev server, test site key):** script requested 61 ms after navigation; login click at 4.4 s → identitytoolkit call at 24.4 s (budget expiry; the pane always gets the checkbox and synthetic clicks don't satisfy it) → normal Auth answer. Mobile viewport shows the checkbox bottom-right over the language switcher.

**Why:** on prod the same path used to end in the network sentence, which sent members and IT departments after the wrong host.

**How to apply:** the real proof is Josh logging in from his iPhone on the dev site after `npm run deploy:dev` ([[deploy-dev-needs-development-mode]]) — a real click on the checkbox, and whether Cloudflare even asks for one on iOS Chrome. If mobile challenges still take 15-25 s, the next lever is the widget config itself (drop `execute`/`interaction-only`, which the community thread says made it fast, at the cost of a visible widget). Trap of the day: `npx astro dev` from Bash/PowerShell is killed as "Dev server process exited before becoming ready"; run worktree servers via an entry in `D:\SynoDrive\VSCN\.claude\launch.json` (the PARENT folder's, not repo's — [[preview-tool-ignores-worktree-launch-json]]) with `npm --prefix <worktree> run dev`, and the worktree needs its own `node_modules` junction to `repo\node_modules` first.

**Update 2026-09-08, later:** merged into dev as `ccfd4db` (detached-worktree merge, [[merging-into-dev-without-switching]]) and deployed to https://vscn-dev-f4b60.web.app; the live /login bundle carries the budget string and the new network sentence. Prod release still open; the iPhone login on dev is the check before it.

**Verified 2026-09-08 by Josh:** login on the dev site from Chrome on iOS works with the fix ("works"). Prod release is the only open step — an ordinary PR dev → main. The fix worktree is gone; the repo mirror lives in dev at documentation/agent-memory/ and lacks this line.

**SHIPPED TO PROD 2026-09-08 as `ef63f4d`** (PR #17). The iPhone verification was done against
dev before the release; nobody has re-walked it on prod, though prod and dev now run the same
attestation code.
