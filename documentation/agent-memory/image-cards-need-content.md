<!-- Mirrors ~/.claude/projects/D--SynoDrive-VSCN/memory/image-cards-need-content.md — readable by any Claude instance without user-profile access. -->


---
name: image-cards-need-content
description: "Zero members have uploaded galleries, so the image-led directory starts mostly typographic — Josh accepted that; galleries are canonical from the next release and cards upgrade as people upload"
metadata: 
  node_type: memory
  type: project
  originSessionId: 850f72f6-4f13-40e9-bbc7-26ed272c9d47
  modified: 2026-08-24T09:17:34.880Z
---

Measured read-only against live Firestore on 2026-08-24 (same auth path as
`scripts/gen-proto-real-data.mjs`): **21 active profiles, 0 with an uploaded gallery,
13 with an avatar.** That probe reads **PRODUCTION** ([[dev-vs-prod-firestore-divergence]]),
and prod is still at zero galleries — but **dev has since been seeded with 16**, so the
"no images anywhere" reading below is prod-only (see the update at the end).

**The prototype's artwork is not member data.** It was hand-curated from portfolio sites
and Instagram into `src/lib/proto-images-real.json`, and the generator reads images from
that local manifest — never from a `gallery` field. So the proto community page is evidence
the image card works on *curated* data, not on real data.

**Josh's ruling (2026-08-24), which overrides the cautious reading I first gave this:**
the gallery elements are **canonical from the next release**. Ship the image-led directory
even though it starts mostly typographic; cards upgrade from typographic to image as
members upload. He did **not** take the avatar-fallback option — the gallery is the card's
image source, not `photoURL`. Do not re-litigate either point.

Consequence to keep in mind rather than argue with (now true of a PROD build only — dev
renders 16 image cards): at swap time `/community` renders ~21 typographic cards and no images, and it loses the 13 avatars the current simple card
shows. That is accepted, not overlooked.

Update 2026-08-24: the swap is **built and live on dev**, and the content gap is
plugged there — 16 members' galleries were seeded from the curated picks
(`scripts/seed-curated-galleries.mjs`). PROD still has 0 galleries; prod seeding
happens at launch, only for members who green-light their images in the review
email (`--only` guard enforces this). See [[release-b-shipped-to-dev]].

**Release ordering:** this note holds one gate of three that ride on a single prod deploy — see [[prod-release-order]] before sequencing anything.
