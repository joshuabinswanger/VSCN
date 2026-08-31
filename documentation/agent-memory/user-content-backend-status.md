<!-- Mirrors ~/.claude/projects/D--SynoDrive-VSCN/memory/user-content-backend-status.md — readable by any Claude instance without user-profile access. -->
---
name: user-content-backend-status
description: gallery/avatar backend hardening implemented on feature/user-content-backend; dev deploy + authenticated browser verification still pending
metadata: 
  node_type: memory
  type: project
  originSessionId: 604a2893-1d84-43e7-8c0e-67b0521e0baf
  modified: 2026-08-23T21:23:19.478Z
---

As of 2026-08-23: the user-content backend hardening (spec `documentation/20260823-user-content-backend-design.md`, plan `...-plan.md`, both untracked) is fully implemented in 5 commits on `feature/user-content-backend` (branched off dev; the uncommitted proto/member-curation WIP rides along untouched). Immutable cache headers, avatar unique-name WebP overhaul, dominant-color placeholders (`photoColor`, `gallery[].color`), AVIF input + SVG/HEIC rejections, crop/rotate editor (`src/lib/imageEditor.ts`).

Update 2026-08-24: **rules + hosting ARE deployed to dev** (vscn-dev-f4b60);
seeded gallery objects serve 200 with the immutable cache header — cache-control
is verified for admin-seeded files. firestore.rules gained validStorageUrl()
accepting BOTH buckets (the prod-only allowlist would have rejected every dev
save). The cleanup script exists (scripts/cleanup-orphaned-storage.mjs), never run.

Still open:
- PROD rules deployed nowhere: they go out manually in the same window as the
  main merge (CI deploys hosting only).
- Live verification of the CLIENT paths (upload flows, legacy JPEG avatar
  replacement, crop UI) still needs Josh signed in on dev.

Related: [[vscn-gallery-tech-stack]], [[community-prototype-state]]

Update 2026-08-24 (per-image descriptions + projects): the profile doc gained a
`projects` array and gallery items gained `description` + `projectId`
(`src/lib/projects.ts`, `validProjects`/`validProjectItem` in firestore.rules).
This makes the manual PROD rules deploy a **hard prerequisite, not a tidy-up**:
until it lands, every profile Save from the editor writes `projects` and is
rejected whole by hasOnly — so members would lose unrelated edits too, silently.
Dev rules are current. See [[firestore-rules-hasonly-gotcha]].
