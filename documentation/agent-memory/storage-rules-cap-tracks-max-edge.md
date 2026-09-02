<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/storage-rules-cap-tracks-max-edge.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: storage-rules-cap-tracks-max-edge
description: "The 4K client cap needs an 8 MB Storage door; dev's restructured rules already grant it, and a rejection when they disagree never mentions size"
metadata: 
  node_type: memory
  type: project
  originSessionId: b58f7d4e-bbf2-4f19-a2f6-4579ba899643
  modified: 2026-09-02T20:35:38.018Z
---

**2026-09-02:** `MAX_EDGE` in `src/lib/gallery.ts` went 2000 → **4000** at Josh's ask
("raise file size limit, cap max res at 4k"). Four times the pixels is roughly four times the
WebP, so the Storage byte cap is a hard dependency of that change.

**The trap:** the client's pixel cap and the rules' byte cap are a pair with **no compile-time
link**, and a Storage rule rejection surfaces as an **opaque permission error that never
mentions size** — the same class of silent failure as
[[firestore-rules-hasonly-gotcha]]. Ship a 4K encoder against a 2 MB door and uploads just
stop, with nothing useful anywhere.

**Where the door actually is, after the restructuring
([[firebase-entity-restructuring]]):** `storage.rules` on `dev` matches
`users/{uid}/{avatar|gallery}/{imageId}.webp` and already grants **gallery 8 MB / avatar
2 MB**. So the 4K cap needed no rules change on dev at all — the branch that raised it was
still on the retired `galleries/{uid}/{filename}` layout, and that edit was **dropped as
redundant** when the work merged into dev (merge `0e12f80`).

**How to apply:** any future move to `MAX_EDGE` means re-checking the `gallery` byte cap in
that per-kind rule, and deploying `--only storage` **before** the hosting that relies on it.
Never assume a repo's `storage.rules` is what a project has deployed — check the console or
re-deploy, because the two drift silently and nothing in the app reports the difference.

**Deploy caution learned the hard way (2026-09-02):** deploying `--only storage` from a branch
whose `storage.rules` predates the restructuring **replaces** the live ruleset with the old
path layout. That happened to `vscn-dev-f4b60` mid-session and had to be re-deployed from
dev's tip. `npx firebase deploy … --non-interactive` works fine here and takes several
minutes; it needs no `--quiet`-style flag the way `gcloud secrets` does
([[rebuild-dispatcher-cloud-function]]).
