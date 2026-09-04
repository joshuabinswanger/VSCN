> Mirror of `~/.claude/projects/D--SynoDrive-VSCN/memory/vscn-gallery-tech-stack.md`, kept in the repo
> so any Claude instance can read it without access to the user profile.

---
name: vscn-gallery-tech-stack
description: "Agreed tech approach + chosen frontend libraries for the VSCN member gallery feature (upload, compression, static rendering, lightbox, carousel)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4825b0e4-daa5-4595-9aad-fd50e78d2d80
---

Decided 2026-06-12: VSCN member galleries extend the existing Astro 6 + Firebase stack (repo at D:\SynoDrive\VSCN\repo\Desktop\VSCN). No external image service.

## Pipeline

- **Upload:** client-side compression before Firebase Storage upload — resize longest edge to ~2000px, re-encode WebP q~0.82 via canvas/`browser-image-compression` (strips EXIF, fixes orientation). 2 MB hard cap in storage.rules under `galleries/{uid}/{filename}`.
- **Data:** `gallery` array on `publicProfiles` docs (url, caption, **width, height** stored at upload), capped ~8–12, validated in firestore.rules like photoURL.
- **Rendering:** static at build time like the community page — Astro `getImage()` on remote Storage URLs (remotePatterns for firebasestorage.googleapis.com), responsive AVIF/WebP widths [400, 800, 1600] served from Firebase Hosting CDN. Storage bandwidth only spent at build.
- **Profile page keeps a live client-side gallery preview** from Storage URLs (rebuild-staleness only affects public pages, consistent with avatars/bios).
- Caveats: HEIC not canvas-decodable (restrict accept types); CI should cache `node_modules/.astro`; rebuild trigger (nightly or content webhook) is a follow-up.

## Frontend libraries (decided the same day)

- **Lightbox: PhotoSwipe v5** (MIT, ~12KB, vanilla ESM) — uses the width/height stored in Firestore via `data-pswp-width/height`.
- **Carousel: Embla Carousel** (MIT, ~5-7KB, vanilla) for the inline swipeable gallery on member cards. User knows keen-slider; Embla chosen over it (keen is stalled, no a11y).
- Main gallery rendering: static CSS grid. lightGallery rejected (GPL/commercial license).
- First draft intentionally plain — user will restyle later.
