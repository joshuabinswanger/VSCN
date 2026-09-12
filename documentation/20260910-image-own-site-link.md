# The picture's two links — the member's own page, and where it appeared

**2026-09-10.** Bounded change, approved in conversation with Josh before implementation.
Branch `feat/image-own-link`, worktree `wt-feat-image-own-link`. Follows
`documentation/20260910-seo-attribution.md`, and fixes something that note introduced.

The question that started it, on reading the editor note the SEO pass had just added:
"the image link should be additional no? or we should be able to add muitiple..."

## What was wrong

`link` — "Where this image appeared" — had been asked to carry two different things. The
SEO note added that morning made it explicit, telling members the field was for "your own
project page, or the publication". One field, two meanings, and neither reader could tell
them apart:

- **A person** sees one bare host under the picture. "nature.com" and "adalovelace.ch" are
  the same shape; nothing says which is the paper and which is the maker's own site.
- **A search engine** got `mainEntityOfPage` pointed at whichever the member happened to
  type. The deep link back into the member's own site — the whole point of the SEO pass —
  was indistinguishable from a link off to a publisher.

## What was chosen

**Two named fields, not a repeatable list of links.** The list was the other option Josh
raised, and it loses exactly what makes the fields worth having: a row of undifferentiated
hosts under a picture is not readable, and structured data cannot assign roles to it either.
If a piece ever needs several publication links, `link` can become repeatable on its own
later; the own-site field stays single, because a member has one page about one piece.

`siteLink` on the image record: optional, scheme-less, ≤ 200, exactly like `link`. Same
fixed-`https://` editor treatment, same "only length is judged" rule (`workLink()` in
`src/lib/links.ts` still decides linkability on the read path).

## What it changed

1. **The record.** `siteLink` added to `validImage`'s key allowlist in `firestore.rules`
   with a 200-char cap, mirrored in `functions/src/types.ts`, `GalleryRecord`,
   `GalleryItem`, `ProfileWork`, and both write paths (`updateImageText`,
   `saveGalleryRecords`). No migration: the field is optional and was born on the record,
   so there is no legacy array fallback for it, unlike `link`.
2. **Every surface prints both, own page first.** Member page figcaption, PhotoSwipe text
   block (member page and community wall, via `data-pswp-site-link`), and the editor's
   Preview tab. One wrapping row (`.mprof__caption-links`, `.pswp__vscn-text-links`) so a
   stretched anchor cannot draw an underline across the column. Both are bare hosts; the
   `title` says which is which.
3. **Structured data got its roles back.** In `imageNode()`, `mainEntityOfPage` is now the
   member's own page for the piece — the page the image is the main entity *of* — and the
   publication moved to `isPartOf` as a nested `WebPage`. Pinned in
   `tests/unit/seo.test.mjs`, including that both keys are absent when neither is filled.
4. **The editor says what each field is for.** Two rows, two notes, both locales. The
   "Where this image appeared" note no longer mentions the member's own site. The new note
   calls the own-site link the strongest link back the directory can give them.

## The deployment order

`validImage` uses `hasOnly`, so an unlisted key does not fail its own check — it fails the
**whole write**, silently, with nothing in the console (see
`documentation/agent-memory/firestore-rules-hasonly-gotcha.md`). The ruleset must be live
on an environment before the editor there can save any gallery row. Deployed to dev with
`firebase deploy -P dev --only firestore:rules` as part of this change; prod needs the same
before this reaches it.

## Not done

- **A repeatable publication list.** One `link` is still one link. If a piece appears in two
  places, the second has nowhere to go. Deliberate — see above.
- **Placeholder derived from the member's own portfolio host.** The `siteLink` placeholder
  is the static `yoursite.ch/projects/…`; it could be their real host, but the "(optional)"
  suffix lives in the translation and building it from two halves is a worse trade than a
  clear static example.
