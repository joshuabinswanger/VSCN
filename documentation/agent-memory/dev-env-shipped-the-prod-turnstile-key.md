> Mirrors the `~/.claude` memory note `dev-env-shipped-the-prod-turnstile-key`.
> Kept in sync with `~/.claude/projects/d--SynoDrive-VSCN-repo/memory/dev-env-shipped-the-prod-turnstile-key.md`.

---
name: dev-env-shipped-the-prod-turnstile-key
description: ".env.development had no PUBLIC_TURNSTILE_SITE_KEY, so npm run deploy:dev shipped the PROD key to the dev host and broke sign-in there; fixed 2026-09-14."
metadata: 
  node_type: memory
  type: project
  originSessionId: a11d4ee5-e7ec-4f51-b9d0-97b424f86c61
  modified: 2026-09-14T08:46:16.475Z
---

`.env.development` was written 2026-05-26 and never updated when App Check moved
from reCAPTCHA to Cloudflare Turnstile on 2026-09-07. It still carried the dead
`PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY` and had **no** `PUBLIC_TURNSTILE_SITE_KEY`.

Astro layers `.env` **under** `.env.development`, so a key the mode file does not
define falls through to `.env` rather than being empty. `.env` holds production
values. The result: `npm run deploy:dev` built the dev host with the **production**
Turnstile site key `0x4AAAAAAErqqGe_M5F4Q8wc`, while the dev App Check function
(`functions/src/appCheck.ts`) holds the matching *test* secret. The attestation
never validates, and with prod enforcing App Check on Auth, **nobody can sign in
on staging**.

Fixed 2026-09-14 by appending `PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`
(Cloudflare's published always-pass test key) to `.env.development` in the repo
root and in the one worktree that existed at the time. `scripts/new-worktree.mjs`
copies env files from the repo root, so every worktree made after that date
inherits the fix.

**Why:** the failure is invisible at build time — the build succeeds, the pages
render, the member grid fills. It only shows as a sign-in that does not work on
`vscn-dev-f4b60.web.app`, which reads like whatever change you happened to be
deploying. It was found only because a deploy was being audited key-by-key, not
because anything reported it.

**How to apply:** the GitHub staging workflow
(`.github/workflows/firebase-hosting-staging.yml`) hardcodes the test key
correctly and was never affected — so a **staging deploy via a push to `dev` is
always right, and a local `npm run deploy:dev` is the one that can be wrong**.
After any local `deploy:dev`, confirm what actually shipped rather than trusting
the env files:

```bash
grep -rl "1x00000000000000000000AA" dist/   # expect a hit in dist/_astro/firebase.*.js
grep -rl "0x4AAAAAAErqqGe" dist/            # expect NOTHING
```

More generally: `.env.example` lists a variable, but nothing checks that
`.env.development` actually *defines* it, and the silent fall-through to `.env`
means a missing dev value is served as a production value. When a
`PUBLIC_*` variable is added for prod, check the dev file by hand.

Related: [[rebuild-target-per-project]] — the same shape of bug, where a dev
action reached a production target. Turnstile background is in
`documentation/20260907-turnstile-app-check-provider.md`.
