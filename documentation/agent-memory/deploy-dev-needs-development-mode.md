<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/deploy-dev-needs-development-mode.md — kept in the repo so any Claude instance can read it without the user profile. -->

---
name: deploy-dev-needs-development-mode
description: "Deploying dev with a plain `npm run build` silently strips ALL artwork from /community — the dev site must be built with `npm run deploy:dev` (astro build --mode development)."
metadata:
  type: project
---

`npm run deploy:dev` is `astro build --mode development && firebase deploy -P dev
--only hosting`. The `--mode development` is load-bearing: it makes Astro read
`.env.development` (project `vscn-dev-f4b60`) instead of `.env` (project
`vscn-39508`, prod).

**Why:** member profiles are synced across both projects but the **galleries
are not** — dev has artwork prod lacks. Build the dev site against prod's
Firestore and every member comes back with zero works, so `hasArtwork` is false
for all of them and the whole directory silently renders as tag cards: 22 tag
cards, 0 image cards, no `<img>` at all. Nothing errors, and the page looks
plausible.

**How to apply:** never `npm run build && firebase deploy -P dev` by hand — it
deploys an artwork-less dev site. Use `npm run deploy:dev`. To verify a dev
build before deploying, count the cards:
`grep -c 'class="ccard"' dist/community/index.html` should be 16, not 0.

Related: [[dev-vs-prod-firestore-divergence]], [[image-cards-need-content]].
