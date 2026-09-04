> Mirror of the `~/.claude/projects/D--SynoDrive-VSCN/memory/user-content-backend-status.md` memory file, kept in the repo so any Claude instance can read it without access to the user profile. Keep both copies in sync.

---
name: user-content-backend-status
description: "gallery/avatar backend hardening shipped; rules + hosting on DEV. The prod-rules blocker on profile Saves is GONE since projects were withdrawn (2026-09-01); the new ruleset is undeployed but harmless; client upload paths still unverified"
metadata: 
  node_type: memory
  type: project
  originSessionId: 604a2893-1d84-43e7-8c0e-67b0521e0baf
  modified: 2026-08-23T21:23:19.478Z
---

⚠ Superseded in part — the "still pending" items below moved on; read the two 2026-08-24 updates
AND the 2026-08-28 correction at the end before acting on anything here.

As of 2026-08-23: the user-content backend hardening (spec `documentation/20260823-user-content-backend-design.md`, plan `...-plan.md`, both untracked) is fully implemented in 5 commits on `feature/user-content-backend` (branched off dev; the uncommitted proto/member-curation WIP rides along untouched). Immutable cache headers, avatar unique-name WebP overhaul, dominant-color placeholders (`photoColor`, `gallery[].color`), AVIF input + SVG/HEIC rejections, crop/rotate editor (`src/lib/imageEditor.ts`).

Update 2026-08-24: **rules + hosting ARE deployed to dev** (vscn-dev-f4b60);
seeded gallery objects serve 200 with the immutable cache header — cache-control
is verified for admin-seeded files. firestore.rules gained validStorageUrl()
accepting BOTH buckets (the prod-only allowlist would have rejected every dev
save). The cleanup script exists (scripts/cleanup-orphaned-storage.mjs), never run.

Still open:
- PROD rules deployed nowhere. ⚠ **No longer true as written — see the 2026-08-28
  correction at the end.** A prod ruleset DID go out on 2026-08-28; it is just not
  the one this file is about.
- Live verification of the CLIENT paths (upload flows, legacy JPEG avatar
  replacement, crop UI) still needs Josh signed in on dev.

Related: [[vscn-gallery-tech-stack]], [[release-b-shipped-to-dev]] (the prototype it grew out of has since been deleted)

Update 2026-08-24 (per-image descriptions + projects): the profile doc gained a
`projects` array and gallery items gained `description` + `projectId`
(`src/lib/projects.ts`, `validProjects`/`validProjectItem` in firestore.rules).
This makes the manual PROD rules deploy a **hard prerequisite, not a tidy-up**:
until it lands, every profile Save from the editor writes `projects` and is
rejected whole by hasOnly — so members would lose unrelated edits too, silently.
Dev rules are current. See [[firestore-rules-hasonly-gotcha]].

Update 2026-08-28 (correction to "PROD rules deployed nowhere"): prod `vscn-39508` **does**
now have a deployed ruleset — it went out ahead of the scientist-signup push and carries the
`memberType` keys ([[scientist-signup-slice-off-main]]). It was cut from `main`, so it does
**not** carry `validProjects`/`validProjectItem`. The hard blocker in the 2026-08-24 projects
update therefore still stands: until the *projects* rules deploy, a profile Save that writes
`projects` is still rejected whole by `hasOnly`. "Prod rules exist" and "prod rules accept
this branch's writes" are different claims — see [[uncommitted-tree-two-features]].

Update 2026-09-01 (**the projects blocker is dissolved**): projects were ripped out
entirely at Josh's ask, so the client no longer writes the field — it writes
`projects: deleteField()`, which merges to an absent key and passes even prod's
pre-`validProjects` ruleset. The 2026-08-24 "hard prerequisite" and the 2026-08-28
restatement of it no longer apply: a profile Save should now succeed against the rules
prod already has. What IS still undeployed is the *new* ruleset (projects checks
deleted, `projectId` off the gallery item whitelist) — on dev and prod both, since the
2026-09-01 dev push was `--only hosting`. That is harmless, not blocking: the old rules
accept everything the new client sends. See [[projects-feature-withdrawn]].
