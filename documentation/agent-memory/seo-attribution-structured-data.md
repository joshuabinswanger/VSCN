<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/seo-attribution-structured-data.md — kept in the repo so any Claude instance can read it without Josh's user profile. Keep both copies in sync. -->

---
name: seo-attribution-structured-data
description: The "link every image to its maker's portfolio" ask was answered with JSON-LD, hreflang and dropping noreferrer, not with outbound links on tiles; MERGED TO DEV 2026-09-10 as 808dbd9, not yet on prod
metadata: 
  node_type: memory
  type: project
  originSessionId: 99132f31-9cec-467f-9123-f04cfa7645a6
  modified: 2026-09-10T11:00:20.117Z
---

Josh asked (2026-09-10) how to link each image back to the member's own portfolio for SEO and
make members aware of it. Built on branch `feat/seo-attribution` in worktree
`wt-feat-seo-attribution` (off `origin/dev` at `f8ea711`); committed as `808dbd9` and fast-forwarded onto `origin/dev` the same day. NOT on prod yet; the worktree was removed.
Design note: `documentation/20260910-seo-attribution.md`.

**What shipped in the tree:** `src/lib/seo.ts` (pure, tested in `tests/unit/seo.test.mjs`):
ProfilePage → Person (url = portfolio, sameAs = socials + VSCN page) + one ImageObject per work
(`creator` by `@id`, `creditText`, `copyrightNotice`, `mainEntityOfPage` = the work's link) on
member pages; CollectionPage → hasPart ImageObject[] on /community. `Layout.astro` gained
`ogType` and `jsonLd` props, hreflang alternates (en/de/x-default, skipped on noindex), and
`@astrojs/sitemap` got the `i18n` option. Member `<title>` is now "Name — Role, Location — VSCN".
`rel="noopener noreferrer"` → `rel="noopener"` on every member-owned outbound link (page, card,
panel, preview, lightbox); the Storage image triggers keep `noreferrer`. Two editor field-notes
(Portfolio, per-image link), both locales.

**Why:** wrapping tiles in outbound links would break [[community-click-semantics]] and add
little; the machine-readable creator→url is what Google Images actually reads. `noreferrer` had
been hiding vscn.ch from members' analytics, which was the one proof of value they could see.

**How to apply:**
- The Person `@id` is `<canonical member URL>#person`, and canonicals carry a TRAILING SLASH
  while `memberHref()` does not. Use `memberPageUrl()` in seo.ts, never `memberHref()` + site,
  or the two pages name different people. A test pins this.
- Followed links + no human approval gate (`active` is a member draft flag, not admin review)
  is a spam magnet if signups open up; the answer then is `rel="ugc"` until reviewed.
- Deliberately NOT done: portfolio host in the lightbox credit (Josh's visual call), sitemap
  `lastmod`/`<image:>`, static tag pages, 301s for retired slugs, Search Console registration.
- All `astro check` errors in the tree are pre-existing (JSX comment in attribute list on the
  member page, `Lang` casts in ProfileForm, the functions tree).
