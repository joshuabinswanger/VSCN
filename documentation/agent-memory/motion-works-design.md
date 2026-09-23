<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/motion-works-design.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->
---
name: motion-works-design
description: GIFs, loops and YouTube/Vimeo links — DESIGNED 2026-09-23, NOT BUILT; every work keeps its WebP poster at storagePath, motion is an optional extra; six open questions for Josh
metadata:
  type: project
---

2026-09-23: design written as `documentation/20260923-motion-works-design.md` (branch
`docs/motion-works-design`). Nothing built.

Decided with Josh: GIF is an upload format only, converted to a looping video — the site
never serves `image/gif`. Short work = **loop** (server-side ffmpeg, AV1 + H.264 fallback,
Firebase Storage). Long work = **embed** (YouTube/Vimeo, we host only the thumbnail,
iframe only on press, `youtube-nocookie`). No Mux / Cloudflare Stream for now. Members may
upload their own thumbnail (Josh's addition).

**Why:** member feedback asked for GIFs for motion design and for video links; Josh wanted it
efficient.

**How to apply:**
- The load-bearing idea: a motion work is the same `images/{id}` record whose `storagePath`
  WebP is the **poster**, so everything that reads only stills keeps working. Don't give motion
  works their own collection.
- Build embeds + thumbnails first (release 1), loops second. Loops start with a SPIKE: does an
  ffmpeg with `libsvtav1` run in Cloud Functions? If not, Cloud Run.
- `MAX_STORED_OBJECTS = 20` counts FILES; a loop is four, so it must count records instead.
- Member thumbnails share mechanics with the replace-image task (immutable caching means a
  replaced poster needs a NEW object name; replaced images re-enter moderation) — build on it.
- Open for Josh: loop length (20 s?), resolution (1920?), sound (none?), source cap (50 MB?),
  shares the eight-work cap (yes?), Shorts + unlisted Vimeo (yes?).

Related: [[firestore-rules-hasonly-gotcha]], [[rules-evaluation-budget]], [[image-moderation-ranking]]
