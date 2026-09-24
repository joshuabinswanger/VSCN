> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/stale-branches-superseded.md` memory file; keep the two in sync.

---
name: stale-branches-superseded
description: "every claude/* and feat/* branch behind the deleted worktrees is inside dev, verified by content 2026-09-06 — but two were SUPERSEDED, not ported, and merging them would undo dev"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0245c4ba-76a1-4d2e-ba9e-2c372be82057
  modified: 2026-09-07T08:37:07.573Z
---

**2026-09-03. Everything on `main` and on the four `claude/*` branches is already in dev,
and merging any of them would be a regression.** Verified by content, not by counting
commits.

**Why:** that lineage — the intro rework, the member-type selector, `wantsToContribute`,
the server-side rebuild dispatch — was REBASED onto dev's history under different SHAs, so
`git cherry` and `git branch -vv` still report them as outstanding. They are counting
patch-ids, and the patch-ids changed. `dev` is 138 commits ahead of `main`; `main` is
"6 ahead" of dev and none of those six are actually missing.

**How to apply:** before merging any branch into dev, check the FEATURE, not the count.
The four that were checked and found present:

- `ea648e2` / `10a7eba` intro rework → dev's `556ad50` / `44ff1e3`; `PageLoader.astro` is
  byte-identical between `10a7eba` and dev.
- `c2a5ead` member types → dev's `src/lib/memberType.ts` (from `3fcc0ba`, `8e00d27`).
- `800e8b7` `wantsToContribute` in the rules → present in dev's `firestore.rules`.
- `678b5fb` server-side rebuild dispatch → dev's `functions/src/rebuild.ts`; no
  `PUBLIC_GITHUB*` token anywhere under `src/`. See
  [[rebuild-dispatcher-cloud-function]].
- `24397fe` rebuild target per project → superseded by `e96a024`, which IS in dev and is
  the fuller version. See [[rebuild-dispatcher-cloud-function]].
- `e7d4645` "a new public profile says whether it is active" → its own commit message says
  it is superseded by the verification-gated version, and that version is what dev has in
  `publishPublicProfile`.

`feature/user-content-backend` is fully merged (0 commits outstanding, by content and by
patch-id both). `feat/gallery-uploader` is the one branch that carried real work — handled
separately, see [[gallery-uploader-reconciled]].

These branches are safe to delete. Left in place only because deleting someone's branches
is their call.

## The audit is dated, and one branch outgrew it — 2026-09-06

`claude/design-notes-20260904` did not exist when the list above was made, and it went on
to carry **two commits of real, unmerged work**: `7c1a7e7` (the barless lightbox, the
growing wall tiles, one description per image, the account tab) and `c60d478`
(`adminDeleteImage`). Both were written, browser-verified and committed on 2026-09-04 —
and then simply never merged, so dev and prod both kept serving the two-field image
editor for two days while a memory note described the single-field version as the current
state.

Merged into `dev` on 2026-09-06 as `377d2db`. It did not merge cleanly in the sense that
matters — see [[conflict-free-merge-semantic-break]].

**How to apply:** this note names branches that were safe to ignore *on 2026-09-03*. It is
not a standing claim about `claude/*`. Re-check by content — and by date — before trusting
it about any branch created since.

## The worktrees are gone, and all three branches behind them are absorbed — 2026-09-06

Both `.claude/worktrees/` checkouts were removed. The three branches behind them —
`claude/admiring-bartik-77471f` (`678b5fb`), `claude/charming-mendel-c54de0` (`e7d4645`)
and `feat/gallery-uploader` (`4bd68bd`) — were re-verified feature by feature against dev
and every one is present. That closes the loose end the 2026-09-03 audit left open:
`feat/gallery-uploader`, the one branch said to carry real work, is in dev too —
`src/lib/galleryQueue.ts`, the per-image `link` shaping in `src/lib/links.ts` and
`profile.gallery.err.decode` are all there.

**A worktree's name does not name the branch its HEAD is on.** Both worktrees were on
DETACHED heads. `claude/admiring-bartik-77471f` sounds like the gallery worktree; the ref
actually points at `678b5fb`, the rebuild dispatch, while the worktree beside it sat
detached on `4bd68bd` — the tip of `feat/gallery-uploader`, a branch of a different name.
Had that branch not existed, `git worktree remove` would have dropped five commits to the
reflog with no ref naming them. Run `git branch --contains <worktree HEAD>` before
removing any detached worktree.

**Two of these were SUPERSEDED, not ported, and merging them would undo dev.** `e7d4645`
stamped `active: true` at creation because an absent field read as inactive in the editor;
dev instead changed both readers so absent means PUBLISHED (`src/lib/firestore.ts`), which
makes the stamp unnecessary. `4bd68bd` recoloured the profile preview sheet from `#fff` to
`--color-bg`; a day later dev deleted the sheet outright, so the preview *is* the page.

**How to apply:** "already on dev" has two shapes — the same fix under a different SHA, and
a fix for a problem dev has since designed away. Only the first is safe to skim past; the
second means the branch is actively wrong now, and a merge would reintroduce what was
deleted. Check what dev did INSTEAD, not just whether the identifier is present.

## Update 2026-09-07: `claude/design-notes-20260904` triaged — one commit is real

The branch holds 7 commits absent from dev by ancestry. Checked against dev by content:

- `0a104f7` + `6e24f35` (gallery fade trigger/anchors) — SUPERSEDED: dev's 09-05 fade
  rework (fade-inset, filter-bar anchor, same Josh quote in its comments) is the later
  answer to the same complaint.
- `46a6380` (EN/DE tap target) — SUPERSEDED by dev's `fd03401` (09-05, toggle to the
  left corner on mobile), which post-dates it on the same concern.
- `8bb56c2` (docs) — content already in [[deploy-dev-needs-development-mode]].
- `81024a5` (vscn-preview launch config) — trivial, portable if wanted; repo lacks it.
- **`a010b1c` (per-image captions + descriptions in English AND German, 13 files,
  rules + tests + member page) — GENUINELY UNLANDED.** Its ruleset is what is actually
  deployed to the dev project (09-04 13:27): dev's live firestore rules are a SUPERSET
  of the repo, with `captionDe`/`descriptionDe` in `validGalleryItem`/`validImage`.
  Consequence: a repo-based `firebase deploy --only firestore:rules -P dev` would
  silently DROP those keys. Whether to port a010b1c or declare it superseded by the
  09-06 single-string caption decision ([[next-session-captions-and-prod]]) is Josh's
  call — do not delete this branch until he makes it.

**Update 2026-09-07 (later): `a010b1c` is PORTED — the branch is now fully spent.**
Josh chose port over drop; it landed on dev as `a075cbe` (one conflict, links.ts,
both sides kept). Lint clean, build 71 pages, rules tests 45/45. The ported
firestore.rules is byte-identical to the dev project's deployed ruleset, so that
divergence closed itself with no deploy. `claude/design-notes-20260904` now holds
nothing unlanded and can be deleted with the other stale branches (remote deletion
is a push — Josh's). One standing consequence: **prod's deployed firestore ruleset
now trails the repo** (no captionDe/descriptionDe) — RESOLVED the same day: prod
rules deployed ahead of the release, and repo/prod/dev now hold the identical
ruleset `507cd718`.

## CLOSED 2026-09-07: every branch in this note is deleted, local and remote

`dev` and `main` are the only branches left, in the repo and on origin. Deleted with
their tips recorded, in case anything is ever wanted back: `claude/exciting-einstein-0d2484`
`678b5fb`, `claude/interesting-bose-12cfd3` `10a7eba`, `feat/community-shuffle` `ea648e2`,
`feature/user-content-backend` `8cd5d82` (origin's tip was `e96a024`), `split-a349ded`
`d2f6a81`, `claude/design-notes-20260904` `0a104f7` (origin's `c60d478`).

**Re-verified by content before deleting, and `git cherry` was wrong about four of them.**
It reported `ea648e2`, `800e8b7`, `c2a5ead` and `678b5fb` as outstanding while
`src/components/PageLoader.astro` is byte-identical (`de2997d`) between `10a7eba` and dev,
`src/lib/memberType.ts` and `functions/src/rebuild.ts` are both present, and
`wantsToContribute` appears twice in dev's rules. `split-a349ded` was the opposite case:
`git cherry` found all five patch-ids upstream AND the tip's comment block is verbatim in
dev. `feature/user-content-backend` had zero commits outstanding by ancestry.

**How to apply:** patch-ids are evidence only when they say YES. A `+` from `git cherry`
in this repo means nothing at all, because the release history is photocopied rather than
merged (see CLAUDE.md's Releasing to main). Check the feature.

## Update 2026-09-07: the notes branch was deleted locally; its last scrap was salvaged

`claude/design-notes-20260904` is gone from the local repo (tip was `0a104f7`,
`origin`'s was `c60d478`). **`origin/claude/design-notes-20260904` still exists** —
the deleting push was refused by the permission classifier, so that one command is
Josh's to run.

Before deleting, `81024a5`'s `vscn-preview` launch entry — the one thing on the
branch neither superseded nor ported — was lifted out and put on PR #2
([[pr-preview-deploy-secret-fix]]). **Its blob survived the branch deletion**:
`git cat-file -p <blob>` still printed the file with no ref pointing at it, which
is how a scrap gets rescued after the fact. The recorded tip SHAs above are what
makes that possible, so keep them.

**How to apply:** deleting a branch does not destroy its objects. If something
turns out to have been wanted, the SHA in a note is enough to recover it —
locally from the object store, or from GitHub by fetching the SHA directly, for
as long as it survives gc.

## Second prune 2026-09-23: 27 remote branches → 6 once Josh runs the push

Every PR branch since 09-10 had been left behind after merge. Classified with
`gh pr list --state all` plus `merge-base --is-ancestor origin/dev` (merges here are real
merges, so ancestry is trustworthy for these). `fix/publication-invoker-main` (PR #60,
CLOSED not merged, tip `13af972`) was the odd one: its files diff EMPTY against main, so
the fix reached main by another route.

Deleted locally, tips recorded: `chore/release-verification` `a472532`,
`wip/repo-tree-snapshot-20260917` `0600617` (Josh said delete it), plus 14 merged
branches via `git branch -d`. Worktrees `wt-chore-release-verification`,
`wt-feat-desktop-header-scale` removed. Their dirty memory mirrors went to dev first
as PR #68.

**The classifier split the job:** `git push origin --delete` (Git Destructive) and
`git worktree remove --force` (Irreversible Local Destruction) were both refused; plain
`git worktree remove`, `git branch -d`, and even `git branch -D` went through. So remote
deletes and dirty-worktree removal are Josh's commands.

**A removed worktree leaves its folder behind** when it holds a `node_modules` JUNCTION
into `repo/node_modules`. Unlink it with `cmd //c rmdir <dir>\node_modules` (removes the
junction only), never `rm -r`, which would follow it into repo's real modules.

Kept: `chore/release-train` (3 unmerged commits, design only), `docs/audit-notes-20260917`
(#43), `feat/communication-preferences` (#45), `fix/worktree-remove-install` (#44),
`feat/admin-unsent-notices` (another session was live in it that day).
