> Mirror of the `~/.claude/projects/D--SynoDrive-VSCN/memory/projects-feature-withdrawn.md` memory file, kept in the repo so any Claude instance can read it without access to the user profile. Keep both copies in sync.

---
name: projects-feature-withdrawn
description: "Projects ripped out completely on 2026-09-01 at Josh's ask; the side effect is that it DISSOLVES the prod-rules blocker, because the client now sends projects: deleteField() instead of the field"
metadata: 
  node_type: memory
  type: project
  originSessionId: f49ede1e-5399-49d4-b844-eefe32ece1ee
  modified: 2026-09-01T13:20:06.231Z
---

2026-09-01, Josh: "drop projects for now" — and when asked how far down, "Rip it out
completely". So it is gone, not hidden: `src/lib/projects.ts` deleted, `projects` off
`UserDoc`/`ProfileViewModel`, `projectId` off `GalleryItem`, the editor block and the
per-image project `<select>` removed, the member page's Projects section and every
"Part of …" credit removed, 16 i18n keys × 2 locales dropped, and
`validProjects`/`validProjectItem`/`validProjectId` deleted from firestore.rules
along with `'projects'` in both `allowedKeys` and `'projectId'` in
`validGalleryItem`'s `hasOnly`.

**The reason this matters beyond tidiness: it dissolves the prod-rules blocker.**
[[user-content-backend-status]] recorded a hard prerequisite — prod's ruleset predates
`validProjects`, so a profile Save that wrote `projects` was rejected whole by
`hasOnly`, losing unrelated edits silently. The client no longer writes the field at
all; it writes `projects: deleteField()`, which merges to an **absent key** and so
passes even the old prod ruleset. The same trick the legacy `primaryAudience` cleanup
has always used. Profile Saves against un-updated prod rules should now work.

Two things that had to be got right, and would break silently otherwise:

- **Stored `projectId` on gallery items would have blocked every Save.** The editor
  loads the stored gallery array and writes it back whole, so a member whose images
  were tagged before the withdrawal would have sent an unlisted key forever. Hence
  `sanitizeGalleryItems()` in `src/lib/gallery.ts` — a whitelist applied on LOAD, which
  also means the stale tags leave Firestore on that member's next Save. See
  [[firestore-rules-hasonly-gotcha]].
- **The new ruleset is NOT deployed anywhere** (deploy was `--only hosting`). Harmless:
  the old rules on dev and prod accept everything the new client sends. The tightening
  simply is not live yet.

Related: [[community-click-semantics]], [[image-cards-need-content]]
