> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/replace-work-image.md` memory file; keep the two in sync.

---
name: replace-work-image
description: "Per-row \"Replace image\" MERGED TO DEV 2026-09-23 (PR #76, 2241364); the two upload callables are NOT deployed to dev or prod, so until then the new record starts textless"
metadata:
  node_type: memory
  type: project
  originSessionId: 66db0f5b-355f-43cc-814a-67cc9e72fb46
  modified: 2026-09-23T18:57:54.752Z
---

Member feedback (DE): replacing a work's picture meant deleting the work and retyping everything. PR #76 (merged to dev as `2241364` on 2026-09-23) adds "Replace image" to each gallery row in /profile.

**Design: a new record that inherits the text, not a reused id.** The imageId IS the storage filename (storage.rules, authorizeImageUpload, completeImageUpload) and verified objects are cached `immutable` for a year, so new bytes need a new object, which means a new id. No public URL carries an image id (member pages go by slug), so nothing a visitor sees moves. The unverified slot `{uid}-gallery` replaces in place.

**Moderation, Josh's decision:** ratings reset (the new picture is back in every admin's rating queue) and a hide carries over (replacing is not a way round a hide). This is settled in completeImageUpload via `replaces` on the uploadPermit.

**Deploy:** dev CI deploys hosting and rules only, and the classifier refused my `firebase deploy --only functions:... -P dev`, so Josh deployed both callables himself at 2026-09-23 19:29Z. His first attempt died with `User code failed to load ... Timeout after 10000`: the predeploy `npm --prefix functions ci` reinstalls onto SynoDrive, and the cold load blows the 10 s discovery limit (a warm load is ~1 s). `$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"` is the fix. **Prod:** deploy the same two callables BEFORE the hosting release (they are backward-compatible), because the release pipeline is hosting-only, see [[admin-console-ux-pass]].

**Walked on dev 2026-09-23** on Josh's own account (inactive profile, uid T7fO…), replacing work 1 with its own bytes: swap at the same position, old record marked pendingDeletion after the array write, button disabled then re-enabled. The new record came up textless (old function), as predicted; Save restored it. The rebuild could not be observed because the profile is inactive and fingerprints as absent.

**Proven after the deploy (19:31Z):** a replace with no Save gave `c2b0d806`, live and carrying caption + description; the old record went pendingDeletion; the array holds the new id at position 1. The moderation half (ratings reset, hide kept) is proven only by the emulator tests, not live.

**Playwright trap:** file-chooser modals from earlier clicks survive a `browser_navigate`, and a `browser_file_upload` can land on a STALE one. Cancel them all with an empty `browser_file_upload` before clicking Replace.

**Why:** the only gap between walk and design was the undeployed callables, and that is now closed on dev.
**How to apply:** for the prod release, deploy both callables first, then repeat the no-Save replace check on prod.
