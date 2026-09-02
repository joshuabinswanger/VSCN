> Mirrors the per-project memory file `~/.claude/projects/D--SynoDrive-VSCN/memory/firebase-entity-restructuring.md` so any Claude instance can read it without access to Josh's user profile.

# Firebase entity restructuring — approved design, not implemented

Approved on 2026-09-02, design at `documentation/20260902-firebase-entity-restructuring-design.md`, **no code written yet**. Josh's ask: everything linked by ids so an account can be purged, searched and re-emailed by a function.

The load-bearing decisions, none of which are visible from the code:

- **`images/{imageId}` becomes the source of truth**, flat and top-level with an `ownerUid`, NOT a subcollection under the account. Reason: the privacy boundary here is collection-level (`users` private, `publicProfiles` public) and rules cannot read a parent doc, so nesting public image records under a private account doc buys nothing and still needs `ownerUid` duplicated for `collectionGroup` filters.
- **The upload order inverts**: record first (`status: "uploading"`), then bytes, then `live`. That is the actual fix for orphan accumulation — a file can no longer exist without a record, so cleanup becomes a query and `scripts/cleanup-orphaned-storage.mjs` is deleted rather than improved. See [[storage-rules-cap-tracks-max-edge]] for the neighbouring upload constraints.
- **Soft delete rides on `active: false`**, which the directory already filters on, so a deletion request removes a member from the public site with zero new build logic. 30-day grace, Auth user stays *enabled* so the member can sign in to cancel — the cost is that their email address stays claimed for those 30 days.
- **`slugs/` is owned by a Firestore trigger, never by the build.** `membersBuild.ts` runs in CI with a service account, so a build that wrote slugs back would have every PR preview build mutating live data. The migration seeds the table from today's `assignSlugs` output so no existing URL moves. Reverses the derive-every-build behaviour in [[member-profile-pages-live]].
- **Admins get read through rules, writes only through callables** — one auditable path for every state change, logged to `adminActions`.

**Why:** the four operations Josh needs (purge, email change, member lookup, image queries) were all impossible because images had no identity — they existed only as URL strings inside an array, and deletion worked by parsing a download URL back into a storage path.

**How to apply:** treat the design doc as the contract; the next step is the implementation plan. Do not start with the client — rollout order is deliberately rules-first (accepting both array shapes), then functions, then dev migration, then prod, then client, then rules tightening. An old client keeps working until the tightening step, and that window is the only rollback. Watch [[firestore-rules-hasonly-gotcha]]: three new collections multiply that trap.
