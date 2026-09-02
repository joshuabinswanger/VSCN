<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/storage-rules-cap-tracks-max-edge.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: storage-rules-cap-tracks-max-edge
description: "The 4K upload cap only works where storage.rules is deployed — dev has the 8 MB door, prod still has 2 MB, and a rejection there says nothing about size"
metadata: 
  node_type: memory
  type: project
  originSessionId: b58f7d4e-bbf2-4f19-a2f6-4579ba899643
  modified: 2026-09-02T10:31:27.496Z
---

**2026-09-02:** `MAX_EDGE` in `src/lib/gallery.ts` went 2000 → **4000** at Josh's ask
("raise file size limit, cap max res at 4k"). Four times the pixels is roughly four times the
WebP, and `storage.rules` capped a gallery upload at **2 MB** — sized for the old 2000px
encode. Raised to **8 MB** in the same change.

**The trap:** these two are a pair with no compile-time link. Ship the client without the
rules and every member gets a 4K encoder and a 2 MB door — and a Storage rule rejection
surfaces as an **opaque permission error that never mentions size**, the same class of
silent failure as [[firestore-rules-hasonly-gotcha]].

**State as of 2026-09-02:**

- dev (`vscn-dev-f4b60`): storage rules **deployed** (8 MB), hosting **deployed**. Consistent.
- prod: **neither**. Still the 2000px client against the 2 MB rule, which is also consistent
  — so prod is fine until someone deploys hosting there.

**How to apply:** the next prod hosting deploy from this work MUST be preceded by
`npx firebase deploy -P <prod> --only storage`, or 4K uploads break for every member with no
usable error. Same for any future change to `MAX_EDGE`. Related divergence bookkeeping:
[[dev-vs-prod-firestore-divergence]].

`npx firebase deploy … --non-interactive` works fine here and takes several minutes — it does
not need a `--quiet`-style flag the way `gcloud secrets` does
([[rebuild-dispatcher-cloud-function]]).
