---
name: scientist-signup-slice-off-main
description: feat/scientist-signup is a hand-built 2-commit slice off main that opens signup to scientists without shipping Release B; it exists on no other branch and is blocked on the manual prod rules deploy
metadata: 
  node_type: memory
  type: project
  originSessionId: 6a015129-9da1-42c9-b3fd-a9c326359bbe
  modified: 2026-08-28T14:04:14.750Z
---
> Mirror of `~/.claude/projects/D--SynoDrive-VSCN/memory/scientist-signup-slice-off-main.md`.
> Kept in the repo so it travels with the code; edit either copy and sync the other.


Built 2026-08-28 in the worktree `D:/SynoDrive/VSCN/wt-scientist-signup` (branch
`feat/scientist-signup`, cut from `main`, **committed but never pushed** — Josh gates pushes).
Two commits:

- `800e8b7` `fix(rules): allow wantsToContribute…` — a **pre-existing prod bug**, not part of
  the feature. Onboarding step 2 writes `wantsToContribute` to the user doc, but `main`'s
  `validPrivateUser` allowedKeys never listed it, so `hasOnly` invalidated the whole write —
  and the call site is `.catch(() => {})`, so the step looked like it succeeded while `openTo`
  was silently discarded with it. Whether this is live depends on what ruleset is actually
  deployed to `vscn-39508`, which nobody has verified. See [[firestore-rules-hasonly-gotcha]].
- `c2a5ead` `feat: members say whether they make images or need them` — the member-type half
  of `3fcc0ba` and nothing else.

**Why a hand-built slice rather than a merge:** memberType shipped inside `3fcc0ba` bundled
with the member gallery, and `dev → main` would also ship the (since-deleted-on-feature)
`/proto` prototype to production. `main` turned out to be **byte-identical to `3fcc0ba^`** for
all seven touched files, so the hunks applied cleanly — the whole `OnboardingForm` diff is
member-type work and went in with `git apply`; `ProfileForm` and `MemberCard` were hand-picked
to leave the gallery behind.

IN the slice: onboarding "Who are you?" step, lab-facing field wording for
scientist/organization, the profile-editor field, the member-card badge, the "For Scientists &
Research Groups" info section, `memberType` through `toPublicProfile()`, and the rules keys.
OUT: gallery, the community-grid member-type/openTo filter (and its `community.filter.*` keys),
`data-member-type` on the card, styleguide, and everything from [[uncommitted-tree-two-features]].

**Deploy order is not cosmetic.** All writes are `merge: true` and Firestore rules evaluate the
*merged* document, so once a profile carries `memberType`, a ruleset without that key rejects
**every later save that member makes** — not just signup. Rules go first:
`firebase deploy --only firestore:rules --project default`. Keep the `--only`: `firebase.json`
now declares a `functions` codebase, so a bare deploy would also push the unreviewed rebuild
dispatcher ([[rebuild-dispatcher-cloud-function]]).

Verified: prod-data build (18 pages), lint 9 warnings / 0 errors with none in the nine touched
files, and the adaptive copy driven live in the browser (creator ⇄ scientist ⇄ organization all
swap name/role/portfolio wording and revert correctly). **Not** verified: the preview badge
rendering — both preview surfaces gate on auth and `main` has no `/proto/profile-preview`
harness — and the rules file has never been parsed by Firebase.

Also unresolved: `main` and `dev` have **diverged**. `main` carries `10a7eba`/`b67762e`/`ea648e2`
(intro animation) that read as re-applied duplicates of dev's `44ff1e3`/`556ad50`, so any later
`dev → main` merge will conflict on the intro regardless of this slice. This branch will need
merging back toward `dev`/`feature` so Release B does not re-fight it — see
[[release-b-shipped-to-dev]].

**Update 2026-08-28 (evening): SHIPPED.** Rules deployed to `vscn-39508` first
(compiled + released), Josh pushed `c2a5ead`, CI went green, and vscn.ch serves the
member-type onboarding in both locales — scientists can sign up on prod. A third
commit `678b5fb` (the server-side rebuild dispatcher, lifted from the feature
branch's uncommitted work) is on the branch and local `main` but **not pushed**;
the `requestRebuild` function is **not deployed** (classifier-blocked). The new
PAT is in prod Secret Manager as `GITHUB_REBUILD_TOKEN` v1. Until `678b5fb` +
`firebase deploy --only functions -P default` land, the live bundle still runs the
old client-side triggerRebuild — new signups won't appear in the static directory
without a manual Actions dispatch. Old `PUBLIC_GITHUB_*` Actions secrets still
need deleting, and the old burned token (plus the first mistyped PAT Josh pasted
on 2026-08-28) must be revoked.
