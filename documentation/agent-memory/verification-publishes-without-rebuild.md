<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/verification-publishes-without-rebuild.md — kept in sync so any Claude instance can read it without Josh's user profile. -->
---
name: verification-publishes-without-rebuild
description: "Michael Zehnder's missing index entry (2026-09-08) — email verification flipped `active` but never rebuilt the static site; fix on feat/verify-triggers-rebuild, plus Analytics removed for GDPR"
metadata: 
  node_type: memory
  type: project
  originSessionId: 671f9987-33fd-46bb-be9e-577769fe392e
  modified: 2026-09-08T06:35:20.471Z
---

On 2026-09-07 Michael Zehnder (scientist, uid `yOIkybYivihPMuCJz6xSQQyhXi73`) registered
on prod at 17:15 UTC, an hour after the last prod build (16:16). He walked the wizard to
step 4, clicked the verification link at 17:17:38 (which ran `activatePublicProfileIfExists`
→ `active: true`) and never came back to finish. His private doc has no `onboardingComplete`.
Result: publishable in Firestore, absent from vscn.ch, and prod's `requestRebuild` logged
nothing after 16:16 — the only rebuild triggers were the wizard's LAST step and the profile
editor's Save. Verification published him but nothing rebuilt.

**Why:** the directory is a static snapshot, so every path that makes a member visible has
to dispatch a rebuild, and verification is such a path (it is what flips `active`). Any new
"publish" path in future must call `triggerRebuild()` too.

**How to apply / status:**
- Immediate remedy done 2026-09-08 06:31 UTC: `gh workflow run firebase-hosting-merge.yml --ref main`
  (run 34195058755) — Michael is live, 24 members served.
- Lasting fix on branch `feat/verify-triggers-rebuild` (worktree `wt-feat-verify-triggers-rebuild`):
  `activatePublicProfileIfExists` returns a boolean and both verification paths
  (`VerifyEmailForm.astro` ×2, `auth/action.astro`) call `triggerRebuild()` when it wrote.
- Same branch removes Firebase Analytics: `getAnalytics()` ran as an import side effect on
  every page, set two `_ga` cookies for anonymous visitors with no consent and no privacy
  page, and the export was read nowhere. GA measurement id dropped from the three
  workflows and `.env.example`; the GitHub secrets `PUBLIC_FIREBASE_MEASUREMENT_ID` /
  `DEV_FIREBASE_MEASUREMENT_ID` are now unused and can be deleted.
- STILL OPEN: the site has no privacy policy and no Impressum (only a `mailto:info@vscn.ch`
  in InfoPage). Needs the association's legal name, address and a responsible contact from
  Josh before it can be written. See [[gdpr-privacy-page-open]] if that gets its own note.

To diagnose a "member missing" report: compare `build-time` in the served `<head>` with the
profile's `createdAt`/`updatedAt`, then `gcloud logging read` on service `requestrebuild`.
Related: [[rebuild-dispatcher-cloud-function]], [[signup-is-the-wizards-first-step]].

**SHIPPED TO PROD 2026-09-08 as `ef63f4d`.** The branch landed on `dev` as `d79bbb0` (PR #15)
and rode the release to prod, so both verification paths now dispatch a rebuild and Firebase
Analytics is gone from every page. Circumstantial confirmation that the rebuild paths work:
prod re-built at 2026-09-09T08:20:46Z on the SAME commit `ef63f4d`, i.e. a member action
dispatched it, not a deploy. **The privacy policy and Impressum are STILL OPEN** and are now the
only thing outstanding from this note.

**2026-09-10:** the Impressum and privacy policy are BUILT on `feat/signup-notify-legal-pages` — see [[signup-notification-and-legal-pages]]. Nothing from this note is open any more.
