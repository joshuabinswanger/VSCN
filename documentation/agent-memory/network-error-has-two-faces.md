> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/network-error-has-two-faces.md` memory file; keep the two in sync.

---
name: network-error-has-two-faces
description: auth/network-request-failed ("Could not reach the server") means two different blocked hosts — instant = identitytoolkit blocked, ~30 s = reCAPTCHA script blocked (SDK hang, no onerror); prod enforces App Check on Auth and Firestore
metadata:
  type: project
---

Reproduced 2026-09-07 with CSP-blocked probe pages against the prod Firebase project (SLF-network report, second one after the App Check message in fdc3465):

| blocked host | time to error | code | `err.customData.message` |
|---|---|---|---|
| www.google.com/recaptcha/enterprise.js | ~30.7 s | auth/network-request-failed | (none) |
| identitytoolkit.googleapis.com | ~0.2 s | auth/network-request-failed | `TypeError: Failed to fetch` |
| firebaseappcheck.googleapis.com, or domain not on the key's allow-list | ~0.5 s | auth/firebase-app-check-token-is-invalid. | (none) |

The 30 s face is a firebase-js-sdk defect: `loadReCAPTCHAEnterpriseScript` in @firebase/app-check 0.11.2 sets `script.onload` but no `onerror`, so a blocked script leaves the App Check `initialized` Deferred pending forever; Auth awaits `_getAppCheckToken()` INSIDE its 30 s `NetworkTimeout` race and reports the timeout as a network error with no detail. Our `friendlyError` shows the same sentence for both faces and drops `customData.message`, so a member's screenshot cannot tell them apart.

Prod (vscn-39508) App Check enforcement, read via the App Check REST API on 2026-09-07: identitytoolkit ENFORCED, firestore ENFORCED, firebasestorage UNENFORCED. Dev (vscn-dev-f4b60) has the App Check API disabled entirely. So on prod a network that blocks reCAPTCHA cannot sign in at all, whatever the wording.

Hosts a prod sign-up/login touches (recorded from vscn.ch/login): vscn.ch (Cloudflare-fronted), www.google.com/recaptcha/*, www.gstatic.com/recaptcha/*, firebaseappcheck.googleapis.com, identitytoolkit.googleapis.com, securetoken.googleapis.com (refresh), firestore.googleapis.com, firebasestorage.googleapis.com (uploads), plus optional firebase.googleapis.com / googletagmanager / google-analytics.

**Why:** "Could not reach the server" reads like the member's connection, but on a locked-down institute network it is almost always one specific blocked host, and which one decides whether IT must allow-list Google reCAPTCHA or Google's auth API.

**How to apply:** ask the member whether the message came instantly or after about half a minute. Instant = identitytoolkit blocked; half a minute = reCAPTCHA blocked. SHIPPED TO PROD 2026-09-07 (PR #11 → dev, release PR #13 → main `88cfc41`): `friendlyError` now appends `customData.message` for the network code, `firebase.ts` listens for the error event on the SDK's reCAPTCHA script tag and exports `isRecaptchaBlocked()`, both forms refuse before calling Auth with `auth.error.code.recaptchaBlocked`, and all three network-ish sentences name ETH/UZH-style institutional networks plus the host IT must allow. A screenshot alone now tells the two faces apart — and since the same release replaced reCAPTCHA with Cloudflare Turnstile ([[turnstile-app-check-provider]]), the 30 s face can no longer come from Google's script at all; the sentence for a blocked check names challenges.cloudflare.com. Related: [[auth-action-url-is-console-only]], [[rules-evaluation-budget]].

**Update 2026-09-08:** the 30 s face has a third cause — a SLOW attestation, not only a blocked script: mobile Turnstile challenges take 15-25 s and the per-step deadlines summed past Auth's clock. One shared budget now ends it under 30 s; see [[turnstile-mobile-attestation-budget]].
