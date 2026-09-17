> Mirror of the `~/.claude/projects/D--SynoDrive-VSCN/memory/image-has-two-links.md` memory file, kept in the repo so it travels with the code.

---
name: image-has-two-links
description: "The per-image link split into two named fields — the member's own project page (siteLink) and the publication (link); MERGED TO DEV 2026-09-10 as 5bc1211, dev rules deployed, prod rules NOT"
metadata: 
  node_type: memory
  type: project
  originSessionId: 99132f31-9cec-467f-9123-f04cfa7645a6
  modified: 2026-09-10T15:49:35.692Z
---

Josh, reading the editor note the SEO pass had just shipped (2026-09-10): "the image link
should be additional no? or we should be able to add muitiple...". He picked the two-named-
fields option over a repeatable list. Built on `feat/image-own-link` in worktree
`wt-feat-image-own-link`, committed `5bc1211`, fast-forwarded onto `origin/dev` the same day.
Design note: `documentation/20260910-image-own-site-link.md`. Follows and partly corrects
[[seo-attribution-structured-data]].

**What shipped:** `siteLink` on the image record — optional, scheme-less, ≤ 200, the same
shape and length-only rule as `link`. `link` now means the publication ONLY; `siteLink` is
the member's own project page for the piece. Both print under the picture and in the
lightbox, own page first, as bare hosts on one wrapping row, with the `title` saying which is
which. In `imageNode()` (src/lib/seo.ts) `mainEntityOfPage` is now `siteLink` and the
publication moved to `isPartOf` as a nested WebPage.

**Why:** one field carried two meanings and the SEO note said so out loud, so neither a
reader nor a search engine could tell a portfolio from a publisher. A repeatable list was the
other option and loses exactly that — undifferentiated hosts, no roles for the structured
data.

**How to apply:**
- **SHIPPED TO PROD 2026-09-12 as `730f950`** (PR #23), and the prod ruleset went FIRST —
  `firebase deploy --project vscn-39508 --only firestore:rules`. That order was the whole
  risk: without it every gallery save carrying a `siteLink` fails silently, see
  [[firestore-rules-hasonly-gotcha]]. Both environments now hold the `siteLink` ruleset.
- No migration and no legacy array fallback for `siteLink`: it was born on the record, unlike
  `link`, which `orderedGalleryItems()` still reads from the legacy element.
- If a piece ever needs several publication links, make `link` repeatable — `siteLink` stays
  single, because a member has one page about one piece.
