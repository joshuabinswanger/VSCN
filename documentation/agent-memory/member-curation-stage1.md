<!-- Mirrors the ~/.claude memory file member-curation-stage1.md so any Claude instance can read it without user-profile access. -->

---
name: member-curation-stage1
description: "All three stages of the real-data community page are built: curation, real data, typographic + expandable cards. The desktop tag rail clipping is the one thing left open."
metadata:
  type: project
---

As of 2026-08-21, **all three stages are built**; Josh approved the curation. Stage 1: `D:\SynoDrive\VSCN\Design\member-curation\` has **one folder per member (23)**,
each with a `links.md` (source URL, direct image URL, reasoning, rejected alternatives).
**16 of 23 have 3 curated images each; every image was opened and visually verified.**
Nothing is committed anywhere; the folder is outside the repo.

**Stage 2 is built and verified** (lint 9 warnings/0 errors = the documented baseline;
`npm run build` renders all 20 pages; browser-checked at 1440 and 390):
- `src/lib/proto-data-real.ts` — GENERATED, 21 active members (`active === false`
  excludes Andy + Amy). Regenerate with `scripts/gen-proto-real-data.mjs` (reads
  Firestore live + the image manifest).
- `scripts/prep-proto-real-images.mjs` — downscales the curated picks to 1200px WebP q82
  into `public/proto/img/real/<slug>/`. **This matters: `public/` is not processed by
  Astro, so the originals would have shipped at 35 MB. Post-resize it is 5.0 MB.**
- `src/lib/proto-images-real.json` — the generated manifest; its width/height feed the
  card's frame `aspect-ratio`, so it must always match the files on disk.
- `src/pages/proto/community.astro` now imports the real data. `PROTO_MEMBERS` in
  proto-data.ts is untouched, so reverting is a one-line import swap.
- Exports: `PROTO_REAL_MEMBERS` (all 21), `PROTO_REAL_WITH_IMAGES` (16),
  `PROTO_REAL_TEXT_ONLY` (5). Stage 2 also had a `RAIL_TAG_LIMIT` + `toProtoMember()`
  adapter; **Stage 3 removed both** — the rail cap belongs to the card, not the data, and
  the cards now take `ProtoCardMember` directly. Do not look for them.

**Stage 3 is built and verified** (lint at baseline, build renders 20 pages, checked at
1440 and 390 with **every disclosure panel forced open** — zero element overflows its card,
no horizontal scroll at either width):
- `src/components/proto/ProtoTextCard.astro` — the typographic variant. Same anatomy as the
  image card (name band, bordered frame, caption, disclosure) so an artwork-less member holds
  the **identical grid slot** instead of being demoted. The frame composes from whatever the
  profile actually has, richest first: `tags` → `bio` → `role`. Real members land as
  tags×2 (Anna Bürgisser 7, Esther Schönenberger 3), bio×2 (Gabriela G., Karin S.),
  role×1 (Tara). Box ratio cycles through 4 values by index, because a row of uniform
  squares among varied photographs reads as a rendering fault.
- `src/components/proto/ProtoDetailPanel.astro` — the expandable panel, shared by both cards.
  **Native `<details>`, zero JS**: ClientRouter is site-wide, so a scripted disclosure would
  need an `astro:page-load` / `astro:before-swap` pair and leak state across navigations if
  it got that wrong. The element also brings keyboard and screen-reader behaviour for free.
- `hasDisclosableDetail()` in proto-data.ts is shared by the panel (render at all?) and the
  text card (would my caption band be empty?) so the rule is not written twice.
- `ProtoGrid` picks the card per member on `images.length`, and the GSAP scale selector is now
  `".pcard, .ptcard"` — without that the text cards would sit at full size while every
  neighbour grew into place.

Data-shape lessons baked into the panel:
- `portfolio` is stored **without a scheme** ("quaint.ch"), so hrefs need `https://` prefixing.
- `socialMedia` is **free text, not a URL**: bare handles ("compostdiv4"), comma-joined
  handle+URL pairs (Karin S.), and real URLs all occur. Only single link-shaped values are
  linkified; the rest render as plain text. Long ones need `overflow-wrap: anywhere` or they
  overrun the lane on mobile.
- Gregor Forster's malformed `https://.instagram.com/...` is rendered **as stored** and will
  visibly fail. That is deliberate — the view layer should not silently repair their data.
- ikonaut's `openTo` contains the real typo `coolaborate`, shown verbatim.

## Still open: the tag rail (the only thing Stage 3 did NOT settle)

Measured on the live page, not inferred. **Desktop (1440px): 8 of the 16 cards silently
cut 1–2 of their 3 tags.** Frames are 127–253px tall where the rail needs 228–339px;
`.pcard__tags` has `max-height:100%; overflow:hidden`, so the excess is clipped mid-glyph.
Trigger is **image aspect ratio** — landscape artwork gives a short frame — so it is
independent of viewport width above the breakpoint, and cannot be fixed by widening.
Cause: real tags run 18–23 chars ("Scientific Illustration", "Science Communication")
against the mock's ~9 ("molecular").

**Mobile (390px) is clean** — the rail flips to a horizontal wrapped row there
(`writing-mode: horizontal-tb`), 0 tags spill past the frame, no h-scroll. This inverts
the assumption in [[community-prototype-state]], which recorded mobile as the problem
case; with real data the problem is desktop-only.

Stage 3 **mitigates but does not fix** this: the rail is capped at 3 tags in
ProtoMemberCard (`RAIL_TAGS`, a card-layout concern, deliberately not in the data) and the
disclosure panel lists **every** tag, so no tag is actually unreachable — but the rail still
clips mid-glyph on those 8 cards. Left alone on purpose: Josh has twice declined to make the
call, and it is a design decision, not a defect to guess at. Note the old recommendation on
record ("two tags on mobile, cap length ~10 chars") no longer matches the evidence — mobile
is fine, and truncating "Scientific Illustration" to 10 chars is unreadable. A real fix needs
either build-time fitting per image ratio or dropping the vertical rail on landscape cards;
**pure CSS cannot hide a partially-visible flex item**, so `overflow: hidden` can only ever
clip mid-box.

## Where the images came from

- **11 members** curated from their own portfolio sites.
- **5 members curated from Instagram** via Claude in Chrome on Josh's logged-in browser
  (Liliane Gschwend, Lisa Cuthbertson, Lisa Sophia Sommer, Selina Bachmann, Jasmin).
  Instagram serves 1440px originals — **higher quality than most portfolio-site thumbnails**.
- **7 have no images and never will without asking them**: Anna Bürgisser, Esther
  Schönenberger, Karin S., Tara, Gabriela G., plus inactive Andy and Amy Badertscher.

## Facts about the real data that shaped the design

- 26 `users` docs but only 23 real members: the 3 extras are junk signups (two nameless,
  one "fjhxx", all ~2026-05-19, zero profile data). Every publicProfile has a matching user.
- 13 have portfolio URLs; **zero galleries uploaded**; no `memberType` set on anyone.
- 2 `onboardingRequests` (Stefan Scherrer, Esther Schönenberger) are existing members, not extras.

## Profile-data fixes worth making

- **Lisa Cuthbertson's IG bio links lisacuthbertson.com** — a real portfolio site absent from her VSCN profile.
- **Gregor Forster's socialMedia is malformed**: `https://.instagram.com/gregor.forster/`.
- **Jasmin's "compostdiv4" resolved** to https://www.instagram.com/compostdiv4/ — she is Jasmin Dolle, ZHdK, BirdLife client work. Distinct from Jasmin Peter.
- **Gabriela G.'s scenecraftz.com is DNS-dead**; **Karin S.'s "portfolio" is a ZHdK staff bio** (she heads the BA Knowledge Visualization).

## Gotchas that cost time

- Instagram's **long share-code URLs are not stable** — two served a different post on a
  later visit, which silently produced three mislabeled files. Always screenshot-verify
  before downloading, and open the file afterwards.
- Instagram images render late; a `computer{screenshot}` call forces compositing and makes
  the `img` grabbable when JS alone reports none.
- Chrome's multiple-download guard silently blocks files 7+ per site; Josh cleared it once via
  the address-bar icon.
- Michael Stünzi and Daniel Röttele co-credit several infographics (infografik.ch); picks were
  kept disjoint to avoid duplicate images on the page.
- Quaint's site assets already include a VSCN.png — they display the network badge on their
  team page next to their AEIMS membership.

## Other Stage 2 findings

- **The 16s crossfade does not survive real artwork.** Every card peaks at 0.5–1.0 opacity
  (measured), so nothing is broken, but with 3 slots and long dissolves roughly half the
  frames sit near-transparent at any instant. Flat high-contrast mock SVGs tolerated that;
  real illustration on the near-white `--color-bg` reads as an empty card. Screenshots of
  the page look half-blank unless timed. Worth shortening the dissolve or raising the
  floor — Josh's call, not changed.
- **Janina Hess's images are only 800px** on the long edge (Squarespace served them small);
  every other member is 1013–1200px. Soft at 2x DPR — ask her for files.
- **Caption lines come from the real bio**, first sentence or a 95-char word-boundary trim
  (`caption()` in the generator). 8 of 21 members have an empty bio, so their second
  caption line is blank by design rather than invented.
- A dev server on :4321 was already running (PID 32652); deleting `dist/` and
  `.astro/data-store.json` under it caused an EPERM rename and stale-dep 504s. Harmless,
  but clear `dist` only when no server holds it.
- The in-app browser pane does not composite in this environment, so `computer{screenshot}`
  always times out there. Claude in Chrome screenshots fine; the in-app pane is still good
  for JS measurement and is the only one whose viewport actually resizes.
