> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/signup-ping-proven-and-its-traps.md` memory file; keep the two in sync.

---
name: signup-ping-proven-and-its-traps
description: "The Auth-create → Brevo ping is PROVEN delivered on dev 2026-09-10; four traps found while proving it, incl. root .env being PROD and a stale repo/ silently omitting a new function"
metadata: 
  node_type: memory
  type: project
  originSessionId: b7329d95-5f7c-4542-9623-1cf555b66083
  modified: 2026-09-10T10:40:53.801Z
---

The signup notification works end to end on dev, proven 2026-09-10: Brevo's transactional
log shows **Delivered** for `[dev] joshua.binswanger+vscntest15@gmail.com started signing up
to VSCN`, from `notifications@vscn.ch` to Josh's Gmail, and Cloud Logging shows
`Signup notice sent`. See [[signup-notification-and-legal-pages]] for how it is built.

**Four traps, each of which cost a cycle or nearly caused damage:**

1. **A functions deploy from `repo/` silently omitted the new function.** Josh deployed at
   10:22 UTC from `D:\SynoDrive\VSCN\repo`, which was on `dev` but **4 commits behind
   origin/dev** — that tree had no `functions/src/notify.ts`. The deploy SUCCEEDED, updated
   all 18 existing functions, and simply never created `onAuthUserCreated`. `gcloud
   functions list` is the only thing that shows it. Deploy from a worktree whose
   `git diff origin/dev HEAD -- functions/` is empty, or pull first.
2. **THE ROOT `.env` IS PROD.** `FIREBASE_SERVICE_ACCOUNT` in `.env` is `vscn-39508`; dev's
   is in `.env.development`. A throwaway Admin-SDK script that reads `.env` by habit writes
   to PRODUCTION. Any such script must assert `sa.project_id` before doing anything — that
   guard is what stopped a test account being created in prod here.
3. **Both secrets got the API key.** Josh pasted the Brevo key into the `ADMIN_NOTIFY_TO`
   prompt as well as `BREVO_API_KEY`. The symptom is an opaque
   `Brevo answered 400: {"code":"invalid_parameter","message":"email is not valid in to"}` —
   a 400 about the RECIPIENT, not a 401, because the key itself was valid. Diagnosed without
   printing the value: the secret was 89 bytes with no `@`, and 89 is exactly
   `xkeysib-` + 64 hex + `-` + 16. Fixed on dev as version 3. **PROD WAS NOT CHECKED** (the
   classifier blocked the cross-project read) and almost certainly has the same swap.
4. **A new secret version needs a redeploy.** `defineSecret` pins the version resolved at
   deploy time, so adding version 3 changed nothing until `deploy --only
   functions:onAuthUserCreated` ran again.

**How to apply / still open:**
- **PROD HOSTING SHIPPED 2026-09-10 as `343180c`** (PR #22, dev -> main): the footer and all
  six legal routes are live on vscn.ch, verified 200 with the build stamp, footer present on
  /info and absent from /, and no `<address>` element while addressLines is empty.
- **`onAuthUserCreated` IS DEPLOYED TO PROD** (2026-09-10, from a worktree level with
  `main`); the merge workflow deploys HOSTING ONLY, so it took a separate manual deploy.
- **PROD IS FULLY CONFIGURED as of 2026-09-10 11:31 UTC.** Josh set `ADMIN_NOTIFY_TO`
  (version 3, 27 bytes, email-shaped) and redeployed; the function's updateTime is AFTER
  that version, which is the thing to check, because `defineSecret` pins the version
  resolved at deploy time. Prod had held the Brevo API key in that secret too — the same
  swap as dev, confirmed by reading it (89 bytes, `xkeysib-` prefix) before he fixed it.
  **NOT YET PROVEN BY A REAL PROD SEND** — that needs an actual signup on vscn.ch, which
  Claude did not do unasked: it creates a real production Auth user.
- **What Claude can and cannot do on prod, precisely.** READING secrets: allowed. WRITING
  any secret on `vscn-39508`: classifier-blocked, via both `gcloud secrets versions add` and
  `firebase functions:secrets:set`, and it stayed blocked after Josh asked directly — a chat
  request does not lift it. Deploying functions to prod: NOT blocked. So the wall is
  specifically secret writes, narrower than [[orphan-account-is-a-public-member]] implies.
- **The API key is sitting in old `ADMIN_NOTIFY_TO` versions on BOTH projects** — dev's
  versions 1-2 and prod's version 1 (and prod's 2, if that was another paste) are still
  `enabled`. Rotating the Brevo key is not enough on its own: destroy those versions too, or
  the old key stays readable to anyone with secretAccessor. Josh also pasted the key into
  this session's chat, so it is in the transcript JSONL as well — see the rotation note.
- Two bare test users are LEFT ON DEV by this test: `+vscntest14`
  (`oeanjEl1M6U3zJ8Z3nAyiynRxa93`) and `+vscntest15` (`ckliAuz3KJNul8z4zxTTcYUFqf23`), Auth
  only, no profile. Not deleted, because deleting fires `onAuthUserDeleted` → purge →
  rebuild, which was not asked for.
- **`+vscntest13` IS NOT DISPOSABLE.** Created 2026-09-08, email-verified, wizard complete,
  active public profile, 2 images, holds the slug `josh`. Josh asked to test "with
  vscntest13"; deleting it to re-fire the trigger would have destroyed all of that, so
  `+vscntest15` was used instead. Check an account's Firestore docs before reusing its
  address.
- Considered but NOT built: validating the recipient looks like an email before calling
  Brevo, so trap 3 names itself instead of surfacing as a vendor 400. Josh's call.
