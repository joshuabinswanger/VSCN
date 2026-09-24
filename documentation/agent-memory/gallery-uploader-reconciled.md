> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/gallery-uploader-reconciled.md` memory file; keep the two in sync.

---
name: gallery-uploader-reconciled
description: "feat/gallery-uploader is ported onto dev, not merged - a third of it was superseded; the queue is VERIFIED signed-in as of 2026-09-22 and the link field's rules are deployed"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0245c4ba-76a1-4d2e-ba9e-2c372be82057
  modified: 2026-09-03T15:30:11.483Z
---

**2026-09-03. `feat/gallery-uploader` is on dev — as a port, not a merge.** A real merge
conflicted in 28 hunks across 11 files, because dev rewrote the upload pipeline underneath
the branch after it was cut (record-first uploads via `images.ts`, 4K masters, cropping
removed). Merging would have resurrected work dev had deliberately taken out.

**Why:** the branch was cut on 2026-09-01 and dev moved 56 commits past it. Three of its
five commits carried live value; the other two were about machinery dev no longer has.

**How to apply:** treat the branch as spent. It is NOT merged and its tip is not an
ancestor of dev, so `git cherry` and the ahead/behind counts still show it as outstanding —
they are counting patches, and the patches are gone through by hand. Do not try to merge it.

## What landed on dev

- **`2b265ed` per-image link** — `link` on `GalleryItem`, `workLink()`/`hostLabel()` in
  `links.ts`, rendered in the member page's figcaption and in the editor's live preview.
  **Rules deploy VERIFIED DONE on both projects (2026-09-07, via the Firebase Rules
  REST API):** prod's deployed firestore ruleset is byte-identical to the repo and carries
  `link`; dev's carries it too. Saving an image with a link is safe everywhere.
- **`338bb5c` the error taxonomy** — `GalleryErrorCode`, `GalleryError`,
  `galleryErrorCode()`, plus a quality-then-size ladder in `compressGalleryImage` that
  makes the 8 MB storage door enforceable from the client. That ladder is load-bearing for
  the taxonomy, not a nicety: without it a rules size refusal and an expired token both
  arrive as `storage/unauthorized` and cannot be told apart. See
  [[storage-rules-cap-tracks-max-edge]].
- **`830598f` the upload queue** — `src/lib/galleryQueue.ts` plus the editor's task rows,
  drag-and-drop, ↑/↓ reorder, a Cover badge, and per-completion persistence.

## What was dropped, and why

- **The per-row Crop and its CORS error message (`59a2b43`).** Cropping left the pipeline
  on 2026-09-02 and `src/lib/imageEditor.ts` was deleted on 2026-09-03. The branch built
  Crop at the same time dev was removing it.
- **The white-sheet fix (`4bd68bd`).** dev's preview has no sheet at all any more — see
  [[profile-editor-preview-mode]].
- **`MAX_UPLOAD_BYTES = 1.9 MB` and its 2 MB wording.** dev's door is 8 MB.

## What is NOT verified

The queue has never been driven in a signed-in session. It builds, lints and typechecks
clean, and `workLink()` was exercised directly (including that a `javascript:` value cannot
survive `href()`), but **rows, progress, cancel, retry and reorder are untested against a
real account** — that is what Josh's comprehensive pass is for. The dev server on :4321
belongs to another session and returns `504 Outdated Optimize Dep` for Firebase modules,
so this could not be driven from here either.

## The queue is VERIFIED signed-in (2026-09-22)

Walked end to end on dev in the Playwright MCP browser, signed in as Josh's own account
(see [[playwright-drives-the-animation-clock]] for how the session was obtained). A
1600x1100 PNG dropped on `#gallery-files`:

- the queue row appears instantly and reads `Uploading... 0%` **for the whole conversion and
  upload** - the percentage never moves off 0, so a stalled-looking 0% is NORMAL, not a hang.
  It took ~15 s for a 20 KB PNG. Do not diagnose a stall from the percentage.
- the bytes go to `pending/{uid}/gallery/{uuid}.webp` first and then to
  `users/{uid}/gallery/{uuid}.webp`. The `pending/` prefix is the record-first staging step,
  NOT a divergence from the layout in CLAUDE.md - it looks like one mid-flight.
- client-side WebP conversion happens as designed.

**The upload commits WITHOUT clicking Save, and so does the removal.** The image survived a
full reload with the form untouched, and the thumbnail's `.gallery-thumb-remove` took it away
again across another reload with no Save and no confirm dialog. Only the
caption/description/link/tag fields need the sticky Save. So an accidental drop is live
immediately - there is no unsaved-changes safety net on the image itself.

Cleanup after the walk left the gallery at its original three images; the removed record is
`pendingDeletion` for `sweepImages` to finish.
