<!-- Mirrors ~/.claude/projects/D--SynoDrive-VSCN/memory/dev-vs-prod-firestore-divergence.md — readable by any Claude instance without user-profile access. -->
---
name: dev-vs-prod-firestore-divergence
description: "npm run dev and npm run build read DIFFERENT Firebase projects, so member pages that 404 locally exist fine in a build — not a routing bug"
metadata: 
  node_type: memory
  type: project
  originSessionId: 850f72f6-4f13-40e9-bbc7-26ed272c9d47
  modified: 2026-08-24T09:35:26.374Z
---

Discovered 2026-08-24 while member profile pages 404'd in dev but built fine.

`.env` points at **`vscn-39508`** (production). `.env.development` points at
**`vscn-dev-f4b60`**. Astro loads `.env` + `.env.development` for `astro dev`, and `.env` +
`.env.production` (which does not exist) for `astro build`. So:

- **`npm run dev` reads the DEV Firebase project.**
- **`npm run build` reads PRODUCTION.**

Measured consequence: production has 21 active members; only **14 of those 21 exist in the
dev project**. Missing from dev: esther-schoenenberger, gregor-forster, jasmin, jasmin-peter,
lisa-sophia-sommer, michael-stuenzi, wong-chi-lui.

**How to apply:** a member page 404ing on `localhost:4321` is not evidence of a routing bug
— check whether that member exists in the dev project first. Any build-time-data page
(`/community`, `/members/<slug>`) shows a different directory in dev than in a build, and
slug numbering could differ too, since dedup depends on which names are present. When
verifying member-data work, say which environment the check ran against; "it 404s locally"
and "the route is broken" are different claims.

Any read-only probe script that parses `.env` directly (as
`scripts/gen-proto-real-data.mjs` does) reads **production**, regardless of dev/build mode.
So the "21 active, 0 galleries, 13 avatars" figures in [[image-cards-need-content]] are
production truth.

Related trap already in `CLAUDE.md`: a missing/invalid `FIREBASE_SERVICE_ACCOUNT` yields an
**empty** member list rather than an error, so "no members" and "no credentials" look
identical.

Update 2026-08-24: `scripts/sync-profiles-prod-to-dev.mjs --write` copied all 23
prod publicProfiles into dev, so the missing-members gap is closed. The divergence
now runs the OTHER way: dev has 16 seeded galleries that prod lacks, so `npm run
dev` shows image cards while a production build shows an all-typographic
directory. That asymmetry is deliberate (member review happens on dev) and ends
when approved galleries are seeded into prod at launch.
