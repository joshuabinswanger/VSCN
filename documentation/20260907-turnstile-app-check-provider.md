# Cloudflare Turnstile as the App Check attestation (replacing reCAPTCHA Enterprise)

Date: 2026-09-07. Status: spec, then implemented on branch `feat/turnstile-app-check`
(stacked on `fix/network-error-two-faces`, which it needs for `errorParts` and the
fail-fast pre-flight).

## Why

A member on the SLF institute network could not sign up. The error took 30 seconds to
appear and read "Could not reach the server". Reproduced against prod with CSP-blocked
probe pages (see `documentation/agent-memory/network-error-has-two-faces.md`): the
institute blocks `www.google.com/recaptcha`. Because prod **enforces** App Check on Auth
and Firestore, and App Check is attested by Google reCAPTCHA Enterprise, no sign-in can
succeed from any network that blocks Google's script. The member confirmed the 30-second
face, which is the reCAPTCHA one.

Most members are expected to sit at ETH, UZH or similar institutions, whose web filters
block Google services by category far more often than they block Cloudflare's challenge
host, which fronts a large share of the web. So the attestation moves to **Cloudflare
Turnstile**, through App Check's documented custom-provider mode. Enforcement stays
exactly as it is; Google leaves the login path.

Decisions that were weighed and rejected:

- **Switch App Check enforcement off.** Would drop the abuse protection on the public API
  key for everyone (sign-up spam, credential stuffing, denial-of-wallet on Firestore) to
  fix one network. Kept as the emergency escape hatch only.
- **reCAPTCHA via `recaptcha.net`.** The App Check SDK hardcodes `www.google.com`; not
  configurable.
- **Invisible Turnstile mode.** Fails silently when Cloudflare cannot clear a visitor in
  the background. Managed mode shows a one-click checkbox in that case instead. For App
  Check, which re-attests roughly hourly while a member edits, "click once" beats
  "writes start failing".

## What is built

### Cloudflare side (Josh, dashboard)

Turnstile widget, **Managed** mode, hostnames `vscn.ch`, `vscn-39508.web.app`,
`vscn-39508.firebaseapp.com` (subdomains are covered automatically; a hostname list is
mandatory, so PR preview channels remain outside it, exactly as they are outside the
reCAPTCHA key's allow-list today). Yields a **site key** (public) and a **secret key**.

Dev and local use Cloudflare's published test pair, valid on any hostname including
localhost: site key `1x00000000000000000000AA` (always passes, visible), secret
`1x0000000000000000000000000000000AA` (always passes).

### Client (`src/lib/appCheckTurnstile.ts`, new; `src/lib/firebase.ts`)

- Loads `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`
  **ourselves**, with both `onload` and `onerror`. The reCAPTCHA hang came from the SDK
  registering only `onload`; here the tag is ours.
- Renders one widget into `#turnstile-slot`, a fixed, `transition:persist` element in
  `Layout.astro`, with `execution: "execute"`, `appearance: "interaction-only"`,
  `action: "app-check"`. Nothing is visible unless Cloudflare decides to ask.
- `CustomProvider.getToken()`: wait for the script, `turnstile.execute`, take the
  token from the callback, POST it to the mint endpoint, return
  `{ token, expireTimeMillis }`. The three steps share ONE 24 s budget
  (`src/lib/appCheckTiming.ts`), because Auth awaits the App Check token inside its
  own 30 s request timeout. Per-step deadlines (20 s script, 25 s challenge, unbounded
  mint) were the first version; on 2026-09-08 a login from Chrome on iOS outlived
  Auth's clock — mobile Turnstile challenges in this configuration take 15-25 s — and
  was reported as "could not reach the login server". Since then the login and
  sign-up forms also call `warmUpAppCheck()` when they appear, so the challenge runs
  while the member types, and a token that arrives after its attempt's clock ran out
  (a late checkbox click) is kept as a spare for the next attempt. Any failure rejects, which the App Check SDK turns into
  a dummy token, which Auth refuses with `auth/firebase-app-check-token-is-invalid.`,
  which the forms already word.
- **Never** call the mint endpoint through `httpsCallable`: the Functions SDK asks App
  Check for a token before every call, and App Check is at that moment waiting on us.
  Plain `fetch`.
- Mint endpoint selection by hostname at runtime: `localhost` → the dev project's
  `https://us-central1-<projectId>.cloudfunctions.net/mintAppCheckToken` (CORS);
  anything else → same-origin `/api/app-check`, a Firebase Hosting rewrite. Same-origin
  matters here: it keeps one more Google hostname out of the login path.
- `isSecurityCheckBlocked()` replaces `isRecaptchaBlocked()`; it is true once the
  Turnstile script tag fires `error`. Both forms keep their pre-flight and show
  `auth.error.code.securityCheckBlocked`, which names Cloudflare Turnstile and
  `challenges.cloudflare.com`.
- The App Check debug-token flag is removed. With the SDK's debug provider active, local
  testing would never exercise Turnstile; the test key pair does the job instead.
- `PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY` is retired; `PUBLIC_TURNSTILE_SITE_KEY` gates
  initialisation the same way (unset → no App Check on the page).

### Server (`functions/src/appCheck.ts`, new)

`mintAppCheckToken`, a 2nd-gen `onRequest` in `us-central1`, `maxInstances: 3`:

1. CORS: reflect the `Origin` when its host is `localhost` (any port) or in
   `TURNSTILE_ALLOWED_HOSTS`; otherwise no CORS headers, so the browser refuses.
2. Body `{ token }`. POST `https://challenges.cloudflare.com/turnstile/v0/siteverify`
   with the secret (`TURNSTILE_SECRET_KEY`, Secret Manager), the token and the caller's
   IP. Require `success`, `action === "app-check"`, and `hostname` equal to or a
   subdomain of an entry in `TURNSTILE_ALLOWED_HOSTS`. Turnstile tokens are single-use
   and expire after 300 s, which is the rate limit: nobody mints without first solving
   a challenge.
3. `getAppCheck().createToken(APP_CHECK_WEB_APP_ID, { ttlMillis: 3_600_000 })`. One
   hour, the App Check default and what reCAPTCHA gave. The functions' service account
   holds `firebaseappcheck.tokens.mint` through `roles/editor`, but minting also
   **signs** the token via the IAM signBlob API, and Editor does not include
   `iam.serviceAccounts.signBlob`. The first dev deploy failed on exactly that. The
   runtime account needs `roles/iam.serviceAccountTokenCreator` **on itself**:

   ```
   gcloud iam service-accounts add-iam-policy-binding <n>-compute@developer.gserviceaccount.com --member=serviceAccount:<n>-compute@developer.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator --project <project>
   ```

   Done on dev 2026-09-07. Prod needs the same, once, before the function is deployed.
4. Reply `{ token, expireTimeMillis }`; on any refusal `403` with a one-word reason.

Params live in `functions/.env.<project>` like the rebuild ones: `APP_CHECK_WEB_APP_ID`
and `TURNSTILE_ALLOWED_HOSTS` per project.

### Hosting (`firebase.json`)

```json
"rewrites": [{ "source": "/api/app-check", "function": { "functionId": "mintAppCheckToken", "region": "us-central1" } }]
```

Both projects share `firebase.json`, so the dev site gets the same route.

### Copy (`src/i18n/translations.ts`)

`auth.error.code.appCheck` now names `challenges.cloudflare.com` instead of
`firebaseappcheck.googleapis.com` (the client no longer talks to that host at all).
`auth.error.code.recaptchaBlocked` becomes `auth.error.code.securityCheckBlocked` and
names Cloudflare Turnstile. The institutional-network note (ETH, UZH, ...) stays in all
three sentences, in both locales.

## Release order

The prod page will have **no App Check at all** if it is built without a Turnstile site
key while enforcement is on, and every sign-in will fail. So, strictly in this order:

1. Merge `fix/network-error-two-faces` (#11) into dev, then this branch into dev.
2. Josh creates the Turnstile widget and:
   - `npx -y firebase-tools@latest functions:secrets:set TURNSTILE_SECRET_KEY` (prod)
   - adds `PUBLIC_TURNSTILE_SITE_KEY` to `.env` and as a GitHub Actions secret
     (`gh secret set PUBLIC_TURNSTILE_SITE_KEY`)
3. Grant the Token Creator binding above on prod's runtime account
   (`365553954084-compute@developer.gserviceaccount.com`), then
   `firebase deploy --only functions:mintAppCheckToken` to prod, **before** hosting: the
   rewrite must have a function to point at. On this machine the Firebase CLI's 10 s
   discovery timeout trips although the code loads in under a second; run the deploy
   with `FUNCTIONS_DISCOVERY_TIMEOUT=90` in the environment.
4. Release dev → main as usual. The hosting deploy carries the rewrite.
5. Optional cleanup afterwards: remove the reCAPTCHA Enterprise key from the Firebase
   console's App Check page and the `PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY` GitHub secret.
6. Privacy page: mention Cloudflare Turnstile (Cloudflare asks for a reference to its
   Turnstile Privacy Addendum). Not part of this branch.

Dev is set up by this branch's author: App Check API enabled on `vscn-dev-f4b60`
(2026-09-07), the test secret set as `TURNSTILE_SECRET_KEY` on dev, the function deployed
to dev, the test site key in `.env.development` and in the staging workflow (it is a
public dummy value, so it can be a plain env line there).

## Verification

- `npm run test:unit`: the new sentence exists in both locales and names its host; the
  endpoint selection helper picks same-origin off localhost.
- `npm run lint`, `npm run build`, `npm --prefix functions run build`.
- Dev server against the dev project: a login attempt shows, in order, the Turnstile
  script from `challenges.cloudflare.com`, a POST to `mintAppCheckToken` returning a
  token, and an identitytoolkit request carrying `X-Firebase-AppCheck`.
- Probe page with `challenges.cloudflare.com` CSP-blocked: `isSecurityCheckBlocked()`
  flips within milliseconds and the pre-flight refuses.

## What this does not change

Firestore and Storage rules, App Check enforcement modes, the Auth flows, the forms'
behaviour on a good network. Cloud Functions still do not require App Check (they never
did; `requireUser`/`requireAdmin` guard them).
