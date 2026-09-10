# Every picture names its maker — SEO attribution

**2026-09-10.** Bounded change, approved in conversation with Josh before implementation.
Branch `feat/seo-attribution`, worktree `wt-feat-seo-attribution`.

The question that started it: "SEO wise it would make sense to add a link to each image that
links back to the portfolios of one's own portfolio site. How would we best do this and make
the user aware?"

## What was already true

- The member page (`/members/<slug>`) linked the `portfolio` field as a **followed** anchor.
  No `nofollow` anywhere in the repo. So each member already had one strong backlink from
  vscn.ch, in two locales, in the sitemap.
- The per-image `link` field ("Where this image appeared") was also a followed anchor on the
  member page and in the lightbox.
- Nothing machine-readable said who made a picture: no JSON-LD, no microdata, `og:type`
  hardcoded to `website`, and no `hreflang` between the `/x` and `/de/x` twins.

## Decisions

1. **Do not wrap pictures in outbound links.** Click a thing and that thing opens
   (`documentation/agent-memory/community-click-semantics.md`). A tile that leaves the site
   breaks that, and a second identical homepage link on the community page is worth almost
   nothing beside the member page's.
2. **The link back is structured data.** One `ImageObject` per work whose `creator` is a
   `Person` whose `url` is the member's own site (`href(portfolio)`), falling back to the
   VSCN page. `sameAs` carries the linkable socials plus the VSCN page. `creditText` and
   `copyrightNotice` are the member's name — what Google Images prints beside a result.
   `mainEntityOfPage` on an image is the work's own `link`, when there is one.
   - Member page: `ProfilePage` → `mainEntity: Person` (nested, per Google's ProfilePage
     guidance), then the images referencing the person by `@id` (`<pageUrl>#person`).
   - Community page: `CollectionPage` → `hasPart: ImageObject[]`, each creator a compact
     Person with the **same `@id`** as the member page's node, so the two pages agree.
   - `contentUrl` is the stored Storage original on both pages — the same file the tile's
     anchor points at. The member page adds `thumbnailUrl` (the on-site rendition).
3. **Members' outbound links send a referrer.** `rel="noopener noreferrer"` became
   `rel="noopener"` on every surface that links a member's site (member page, card,
   disclosure panel, editor preview, lightbox). `noreferrer` never affected ranking; it
   stripped the Referer header, so a member's analytics never showed vscn.ch sending anyone.
   The referrer is the one proof a member gets that being listed here does something. The
   Storage image triggers keep `noreferrer` — Firebase does not need to know.
4. **hreflang.** `Layout.astro` emits `<link rel="alternate" hreflang="en|de|x-default">`
   for every indexable page, computed from the canonical path (so an alias page's alternates
   point at the current URL, like its canonical). `@astrojs/sitemap` gets the `i18n` option,
   which emits `xhtml:link` alternates only for URLs that exist in both locales.
5. **Member `<title>` carries role and location.** "Ada — Scientific illustrator, Zurich,
   Switzerland — VSCN" instead of "Ada — VSCN". Nobody searches a stranger's name.
6. **`og:type` is `profile`** on member pages (new `ogType` Layout prop).
7. **The editor says why the fields matter.** A `field-note` under Portfolio (there was
   none) and one under each image's "Where this image appeared", both locales. "Search
   engines follow" rather than "followed link" — the meaning without the jargon.

## Not done, on purpose

- **Lightbox credit showing the portfolio host** beside the name. Cheap, but it is a visual
  decision on a surface Josh has tuned by hand; flagged for him rather than drawn blind.
- **`lastmod` and `<image:>` in the sitemap.** Needs per-page data in `serialize`; after
  this lands, not with it.
- **Static tag landing pages.** The long-tail play once there are enough tagged works.
- **301s for retired slugs.** Hosting-config redirects generated from the slugs table; the
  meta-refresh alias pages are tolerated for now.
- **Search Console / Bing Webmaster registration.** Off-repo; Josh's.

## The spam caveat

Nothing human approves a profile before it is published: `active` is a member-controlled
draft flag (`firestore.rules`, "Absent means public"). A directory that hands out followed
backlinks to anyone who passes signup is a known spam magnet. Today the community is
invite-scale and the signup notification email (2026-09-10) makes a junk account visible;
flipping it to draft removes it at the next build. If signups open up, `rel="ugc"` until a
profile has been looked at is the standard answer.

## Where

- `src/lib/seo.ts` — pure functions; shapes pinned by `tests/unit/seo.test.mjs`.
- `src/layouts/Layout.astro` — `ogType`, `jsonLd` props; alternates; the `<script
  type="application/ld+json">` via `jsonLdScript()` (escapes `<`, `>`, `&` so member text
  cannot close the element).
- `src/pages/[...lang]/members/[slug].astro`, `src/pages/[...lang]/community.astro`,
  `astro.config.mjs`, `src/components/{MemberCard,ProfileViewPreview}.astro`,
  `src/components/community/MemberDetailPanel.astro`, `src/lib/lightboxText.ts`,
  `src/i18n/translations.ts`, `src/components/ProfileForm.astro`.
