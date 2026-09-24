> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/image-tags-seeded-on-dev.md` memory file; keep the two in sync.

---
name: image-tags-seeded-on-dev
description: dev's 44 curated works now carry real subject tags from a hand map; LIVE on dev — the Grid dropdown went from 1 option to 31
metadata:
  type: project
---

`scripts/seed-image-tags.mjs` (branch `feat/seed-image-tags`, worktree
`wt-seed-image-tags`, off `origin/dev` @ 82bfdcb — UNCOMMITTED) wrote
`images/{id}.tags` on dev's 44 curated gallery works on 2026-09-08.

**Why:** with no image tags anywhere, the Grid's dropdown hides every option
whose `worksByTag` is 0, so it offered exactly one entry — "All tags" — and read
as broken. Step 2 of [[works-on-the-record-restructure]] could not be looked at.
After seeding: Grid offers 31 tags, Spread 27, and 8 labels (Architecture,
Biology, Dentistry, Earth Sciences, Engineering, Neuroscience, Public Health,
Veterinary Medicine) reach the list ONLY through a picture — which is the union
the dropdown is meant to build, and is otherwise untestable on dev.

**How to apply:** these tags are NOT placeholders, unlike
[[image-descriptions-long-and-short]]'s captions. A tag is what the picture is
about, chosen from the fixed 43-label registry, and the curation filenames name
the subject outright — so the map in the script is real and dev's wall filters
like the real thing. The script refuses to CREATE a registry label (that is
`seed-tags.mjs`'s job) and refuses prod. `--clear --write` only removes a set
that still matches the map, so **clear with the old build before editing an
entry**, or the old tags are stranded.

DEPLOYED AND WALKED on dev 2026-09-08 (rules first — `firestore.rules` was
already up to date there, so the merge at 82bfdcb had shipped them; then
hosting). `?pattern=grid&tag=paleontology` on the live site brings the wall down
to the crocodile skull and the palaeo vignettes. The wall's `data-tags` and all
three dropdown counts are build-stamped, so a re-seed is invisible until the
next `npm run deploy:dev` ([[verification-publishes-without-rebuild]]).

Still open: Joshua Binswanger's 3 own uploads have no `provenance.source`, so
they stay untagged and the map has no way to reach them.
