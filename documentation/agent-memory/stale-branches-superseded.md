<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/stale-branches-superseded.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: stale-branches-superseded
description: "every claude/* and feat/* branch behind the deleted worktrees is inside dev, verified by content 2026-09-06 — but two were SUPERSEDED, not ported, and merging them would undo dev"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0245c4ba-76a1-4d2e-ba9e-2c372be82057
  modified: 2026-09-06T00:00:00.000Z
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
  the fuller version. See [[rebuild-target-per-project]].
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
