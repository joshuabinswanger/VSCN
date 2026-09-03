# The prod release order (2026-09-03)

Dev has accumulated **three independent things** that all reach prod through one
deploy, and each has a gate of its own. The gates are recorded in three
different places, which is how a step gets missed. This note is the order and
nothing else — it deliberately does **not** restate the mechanics.

**The mechanics live in one place already:** the 8-step prod runbook (plus step
3½) in `documentation/agent-memory/firebase-entity-restructuring.md`. Do not
copy it here. If a step changes, it changes there.

## What is actually waiting on dev

| # | The thing | Its gate |
|---|-----------|----------|
| 1 | **The Firebase entity restructuring** — images as records, server-side lifecycle, `/admin`, slug aliases | Prod data must be migrated *before* the tightened rules land. The runbook is the procedure. |
| 2 | **The image-led directory** (Release B) and everything after it — the galleries, the ledger, the previews, 4K uploads | Members must green-light their work appearing publicly: the **review email**. Prod galleries are at zero until then. |
| 3 | **The description split** — `description` long, `descriptionShort` everywhere else | Dev's placeholder text must not be mistaken for, or become, real content. |

The trap is that **#1's step 3 ships #2 and #3 with it.** The merge to `main`
is not "the restructuring release" — it is everything sitting on `dev`. The
runbook says so at step 3; this note exists so that fact is not discovered
inside the runbook, halfway through a migration.

## The order, and why each constraint exists

**Before anything: the signed-in pass on dev.** No human or agent has driven a
single signed-in flow on the new client — not an upload, not an avatar
replacement, not a delete-cancel, not the `/admin` console. The avatar-save case
(the reviewer's C1) is the one to do first because its failure is silent. This
is not a formality: prod is the first place a mistake here costs a real member
their picture.

**Then, in this order:**

1. **Grant the admin claim on dev** (`set-admin.mjs -P dev <email>`) — it is
   granted nowhere at present, so `/admin` cannot be exercised at all until it
   is. It is also a prerequisite for testing the console before prod.
2. **Decide and send the review email.** It gates #2, and #2 rides on #1's step
   3. Deciding after the merge is deciding too late.
3. **Clear dev's placeholder descriptions** if any dev data is ever going to be
   promoted or compared against prod: `seed-image-descriptions.mjs -P dev
   --write --clear`. The seeder refuses non-dev projects, so the text cannot
   walk to prod by itself — the risk is a human reading it as a member's own
   words.
4. **Run the runbook**, steps 1 → 8, keeping 2 → 3 → 3½ close together: the
   window between them is the only period in which an old client can write
   un-migrated data, and the shorter it is the fewer members are affected.
5. **`set-admin.mjs -P prod <email>`** — runbook step 8, and the thing that is
   easiest to forget because everything already appears to work without it.

## The two ordering rules that are not in the runbook

**Storage rules go before the hosting that relies on them.** The client caps a
gallery image at 4000px on its longest edge; the Storage rule caps the object at
8 MB, and a 4K WebP does not fit through the old 2 MB. Deploy hosting first and
every member gets a 4K encoder against a door too small — surfacing as a
permission error that never mentions size. `--only storage`, then hosting.
Details: `documentation/agent-memory/storage-rules-cap-tracks-max-edge.md`.

**A repo's rules file is not proof of what a project has deployed.** Deploying
`--only storage` from a branch whose `storage.rules` predates the restructuring
*replaces* the live ruleset with the retired path layout. That happened to dev
on 2026-09-02 and had to be re-released from dev's tip. Check the console, or
re-deploy from the tip you mean, before assuming.

## Verifying you are looking at what you think you are

Every page now stamps the build into its `<head>` (2026-09-03,
`src/lib/buildInfo.ts`):

```
curl -s https://<host>/community | grep 'name="build-'
```

A `-dirty` suffix means the build came from an edited working tree. This exists
because the public directory is a build-time snapshot, so "is the deployed site
current?" is a question a release needs to be able to answer in one command —
and on 2026-09-03 a stale snapshot was briefly mistaken for missing data.
