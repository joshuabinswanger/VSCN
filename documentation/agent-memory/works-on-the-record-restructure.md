> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/works-on-the-record-restructure.md` memory file; keep the two in sync.

---
name: works-on-the-record-restructure
description: "Works-on-the-record: SHIPPED TO PROD 2026-09-08 as ef63f4d (PR #17) — rules, functions, migration, then hosting; both prod members with works still render, and nothing on prod is tagged yet so the wall's Grid still offers only All tags"
metadata: 
  node_type: memory
  type: project
  originSessionId: 407c1e47-3fdf-4ad3-bbf4-dae6ee0671e6
  modified: 2026-09-08T18:20:00.000Z
---

**Step 1 — state on 2026-09-07:** merged to `dev` at `38e5814` via
[PR #14](https://github.com/joshuabinswanger/VSCN/pull/14) (classifier blocked `gh pr merge`,
Josh merged it himself). Deployed to the dev Firebase project (`vscn-dev-f4b60`): `firestore.rules`
+ all functions released together, then `node scripts/migrate-gallery-to-ids.mjs -P dev --write`
migrated 16 `publicProfiles` + 10 `users` docs (0 drops, 1 `link` backfilled from array text onto
`images/5303e8fa-9675-4cd3-9ccd-104869a12168`), then `check-integrity.mjs -P dev` came back with
only the 18 pre-existing Auth-mirror problems — nothing gallery-shaped. Spec
`documentation/20260907-works-on-the-record-design.md`, plan
`documentation/20260907-works-on-the-record-plan.md` — both on `dev`.

**Step 2 of the SPEC — image tags — LIVE ON DEV 2026-09-08:** built bounded-path (no plan doc)
as `75d1dd8` (the feature) + `45fe4fd` (the double-check's fixes), then merged into `dev` as
`82bfdcb` and deployed: `firestore.rules` + all 18 functions by hand from the merged tree, THEN
the push, so the ruleset was live before the hosting build existed. Hosting went out on its own
via the staging workflow (run `34209135828`, 1m18s). Proven live by curl: `/community` stamps
`build-commit 82bfdcb`, `/profile` serves both selectors (`data-max-tags` 7 and 5) and
`id="member-tags-field"`, and the wall's 28 tag options all carry
`data-count-works-by-tag="0"` — correct, nothing is tagged on dev yet, so Grid offers only
"All tags" until Josh tags something. Branch and worktree are gone (merged, deleted).
The merge technique this needed is its own note: [[merging-into-dev-without-switching]]. Josh: *"before we do so, we need a way to add tags to
images"* — i.e. before the prod release of step 1. `images/{imageId}.tags` ≤5 labels ≤50 chars
(`validImageTags` in rules, `tags` in `validImage`'s hasOnly); one `<tag-selector maxTags=5>`
per gallery row in the editor, saved through `saveGalleryRecords`; `ProfileWork.tags` is a
REQUIRED array (every producer supplies it — memberView, ProfileForm preview, OnboardingForm
preview). The wall's tiles carry the WORK's tags (`workTagsAttr`); the dropdown gained a third
count `worksByTag` + `data-count-works-by-tag`, read by Grid only; `tagHasWorks(tag, mode)` and
`reflectTagOptions(mode)` are mode-aware; option list is the UNION of member and image tags.
Verified in the browser on dev data: Grid offers only "All tags" (nothing tagged yet), spread
unchanged (28/29), `?tag=botany` dropped on spread→grid switch, deep link into grid gives the
honest empty state. Gates: unit 49/49, rules 46/46, lint 0, functions tsc 0, build 65 pages,
`astro check` 25 = pre-existing baseline. The member-level `tag-selector` query is now scoped to
`#member-tags-field` — an unscoped one would grab a gallery row's. The double-check (Fable,
09-08, `45fe4fd`) found two things the per-row clones exposed in `TagSelector.astro`: every
instance read the whole `tags` registry on connect (now ONE module-level promise per page,
shared array, failed read retried), and a default `inputId` stamped the same id on every row
(now no id unless passed). Proven in the browser: a `.value` set before the clone upgrades
survives adoption and is capped at maxTags. NOT provable there: any live Firestore read — the
browser pane never reaches the backend (10 s timeout, zero requests to googleapis).

**Why:** the community tag dropdown offered tags whose members had no artwork (artwork-only
galleries since 09-03). Image tags were the real answer, and they needed a home; the array
could not be it (rules budget, [[rules-evaluation-budget]]). Josh chose the restructure over
the cheap join: *"B looks cleaner, implement it"*, two releases.

**What step 1 changed:** `gallery` on both profile docs is `string[]` of image ids; `validGallery`
checks eight short strings; `validImage` gained `link` (≤200). `src/lib/galleryRecords.ts` is
the ONE pure join (owner + kind + live + dedupe + geometry) shared by the editor
(`loadGallery`) and the build (`membersBuild` fetches live gallery records once). Save writes
records FIRST via `saveGalleryRecords`; a refused record is the Save error naming the image
by position, never a console warning. Migration: `scripts/migrate-gallery-to-ids.mjs`
(dry-run default, plans before it writes, refuses on drops without `--allow-drops`, keeps
grace-period ids, array text WINS over record text).

**How to apply — Josh's runbook, in order:**
1. DONE 2026-09-07 (dev): PR #14 merged; rules + functions deployed together from the merged tree.
2. DONE 2026-09-07 (dev): migration dry run → `--write` (snapshots first) → integrity clean.
3. THE ONE OPEN ITEM ON DEV — needs Josh signed in: editor round trip (upload, caption, link,
   reorder, remove, Save; forced 201-char link must be a Save error). NOW ALSO: tag an image
   on https://vscn-dev-f4b60.web.app/profile, Save, confirm `images/{id}.tags` lands, then
   confirm Grid narrows to that tag — the community page is a build-time snapshot, so the tag
   only reaches the wall after a rebuild (the profile save dispatches one via `requestRebuild`).
4. DONE 2026-09-08 (dev): merged as `82bfdcb`; rules+functions deployed by hand BEFORE the
   push, hosting by the staging workflow after it. The ordering rule held: **RULES BEFORE OR
   WITH HOSTING** — the client writes `tags` on every record save; hasOnly rejects the whole
   save silently otherwise.
5. OPEN — prod release of step 1 (+ step 2 if merged by then): deploy rules+functions, run the
   migration (no-op on prod — zero galleries — still run it), integrity check, from `main`.
6. OPEN — later: remove the old-shape tolerance (`galleryRecords.ts`, `functions/src/util.ts`,
   `check-integrity.mjs`, `seed-image-descriptions.mjs`) once both environments pass integrity.

**PROD RELEASE SHIPPED 2026-09-08 as `ef63f4d`; opened as — [PR #17](https://github.com/joshuabinswanger/VSCN/pull/17),
`dev` → `main`, and it is waiting on Josh, not on code.** The merge was rehearsed first in a
throwaway detached worktree at `origin/main`: `--no-ff` merge of `origin/dev`, zero conflicts,
and — the check worth repeating — `git diff HEAD origin/dev` came back **empty**, so the merged
tree is byte-identical to `dev` and every gate run on `dev` is a gate on the release. Green on
that tree: unit 51/51, rules 46/46, lint 0, functions `tsc` 0, build 71 pages. The worktree is
gone; the PR is the merge.

Two things this rehearsal established that the runbook did not know:

- **Step 5's "no-op on prod" is WRONG now.** The prod build emits 25 member pages and **two of
  them carry PhotoSwipe**, i.e. two prod members have uploaded gallery content since the
  09-04 release. The migration has real arrays to rewrite, so its dry run must actually be read.
- **Every prod-side command in this release is classifier-blocked for an agent** — not just
  `gcloud` and `set-admin`, but `node scripts/…  -P prod` (even the read-only dry run) and
  `firebase deploy -P default`. Both were attempted and refused. Do not plan an agent-driven
  prod release; plan the PR, the gates and the runbook, and hand the four commands over.

**The order, and why it is not negotiable:** the new client writes `tags` on every record save and
ids into `gallery`; `hasOnly` refuses the WHOLE save, silently, if the deployed ruleset does not
know those fields ([[firestore-rules-hasonly-gotcha]]). So rules and functions go out BEFORE the
hosting build, then the migration, then the merge. Josh runs, from `repo/` (the checkout at D:/SynoDrive/VSCN/repo)
(the `dev` tree — identical to the merge, and the only checkout holding `.env`, which
`scripts/lib/admin-app.mjs` resolves relative to itself):

1. `npx -y firebase-tools@latest deploy -P default --only firestore:rules,storage`
2. `$env:FUNCTIONS_DISCOVERY_TIMEOUT = "90"` then the same deploy `--only functions`
   ([[turnstile-app-check-provider]] trap 2 — without it discovery times out at 10 s naming nothing)
3. `node scripts/migrate-gallery-to-ids.mjs -P prod`, read the plan, then `--write`
4. `node scripts/check-integrity.mjs -P prod` — the passing condition is **1 problem and it is
   "Test"** ([[orphan-account-is-a-public-member]]), never literal 0
5. merge PR #17; the merge workflow deploys hosting

The window between 1 and 5 is the only exposure: the OLD client is still live and its gallery
writes are old-shape, so those two members' saves would be refused for minutes. Keep 1→5 close.

**PROD RELEASE CLOSED 2026-09-08.** Josh ran the four commands (rules+storage, functions,
migration, integrity) and merged PR #17 himself; `origin/main` is `ef63f4d` and the merge
workflow (run `34250427576`) put it live at 16:20:56 UTC. Verified from outside: `/community`
stamps `build-commit ef63f4d`, the sitemap serves 25 members, and **both prod members with
works still render their gallery** (`/members/joshua-binswanger` and `/members/quaint` each
still carry `data-pswp-width`) — which is the real proof the ids-only migration did not drop
anything. The tag dropdown offers 29 options all at `data-count-works-by-tag="0"`: correct,
because no prod image has been tagged yet, so Grid shows only "All tags" until a member tags
something. Same state dev was in before the seeder ran.

**Order confirmation worth keeping:** the window between the rules deploy and the merge stayed
open longer than planned (the deploys ran, then the merge waited on a human), and nothing broke —
but that was luck, not design: the only writers exposed were the two members with galleries.


Known residue: `npx astro check` has 25 pre-existing errors (`[slug].astro` syntax defect,
`OnboardingForm` `memberType`/`openTo` shape, `ProfileForm` `Lang` args, custom-element
`extends HTMLElement` complaints) — the gate is "no more than 25, none in your lines";
`npm run test:rules` needs port 8080 (free on 09-08; CompleteAnatomy sometimes holds it);
`npm run worktree` does NOT install `functions/node_modules` — `cd functions && npm install`
before `tsc`; the preview tool ignores worktree launch.json — `npm run dev` via Bash, it picks
4322 when repo/ holds 4321, open by URL.
