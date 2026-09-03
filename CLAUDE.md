# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # astro dev — serves on 127.0.0.1:4321
npm run build        # astro build — static output to dist/
npm run preview      # serve dist/
npm run lint         # eslint src
npm run format       # prettier --write src
npm run deploy:dev   # build in development mode + firebase deploy -P dev --only hosting
npm run test:rules   # firestore.rules + storage.rules against the emulator (needs Java)
```

There is **no test framework** for src/ and none should be added casually. The ONE exception is `tests/rules/` — rules tests on the emulator via `@firebase/rules-unit-testing` + `node --test`, because a rules mistake fails silently (see the hasOnly trap below) and nothing else catches it. Verification is `npm run lint`, `npm run build`, and browser inspection.

`npm run lint` is **clean — 0 warnings, 0 errors** (zeroed 2026-09-03: the unused `t` in seven page frontmatters and the one `no-explicit-any` in `firebase.ts`). So **any** warning you see is yours, and that is the point of having zeroed it. Do not let a new one settle in as a baseline.

`npm run format` is a **trap, not a check**: `npx prettier --check src` currently flags nearly every file, so running the documented command rewrites the repo and buries whatever you were doing in an unreviewable diff. Leave it alone unless you are deliberately doing the one mechanical reformat commit — that decision is Josh's and has not been made.

`npm run build` is the strongest available gate: it type-checks and renders all 20 pages.

## Architecture

### The dual data path — read this before touching anything data-related

The same Firestore data is reached two completely different ways, and confusing them is the most likely source of a wasted afternoon:

- **Runtime, in the browser** — the client SDK in [src/lib/firebase.ts](src/lib/firebase.ts) (Auth, Firestore, Storage, App Check). Everything a signed-in user does — onboarding, profile edits, gallery uploads — goes through here via [src/lib/firestore.ts](src/lib/firestore.ts) and is governed by [firestore.rules](firestore.rules).
- **Build time, in Node** — `firebase-admin` is imported *directly inside* [src/pages/[...lang]/community.astro](src/pages/[...lang]/community.astro), using the `FIREBASE_SERVICE_ACCOUNT` env var, to fetch the member list.

**Consequence:** the public community directory is a **static snapshot**. A user editing their profile sees nothing change on the public page until the site is rebuilt — the README notes that profile updates fire GitHub Action dispatches to trigger that rebuild. Any feature that shows member data publicly inherits this staleness and must decide whether to accept it or hydrate client-side.

**Which snapshot am I looking at:** every page stamps its build into `<head>` — `curl -s https://<host>/community | grep 'name="build-'` gives the commit and the build time, with a `-dirty` suffix when the build came from an edited tree (`src/lib/buildInfo.ts`). Reach for it before diagnosing missing or wrong member data on a deployed site; a stale snapshot and a data bug look identical otherwise.

**Failure mode to know:** `community.astro` wraps its admin fetch in `try/catch` and logs to the console, so a missing or invalid `FIREBASE_SERVICE_ACCOUNT` produces an **empty member grid, not an error**. "No members" and "no credentials" look identical. This bites hardest in a fresh git worktree, because `.env*` is gitignored and does not come along.

### Two-collection profile model

- `users/{uid}` — private, the full `UserDoc` including `phone` and `email`.
- `publicProfiles/{uid}` — public, typed `Omit<UserDoc, "phone" | "email"> & { active?: boolean }`.

`toPublicProfile()` in [src/lib/firestore.ts](src/lib/firestore.ts) projects private to public field by field, and `publishPublicProfile()` writes it. **Adding a field to `UserDoc` is never enough** — you must also add it to `toPublicProfile()`, to `validPublicProfile`'s `allowedKeys` in `firestore.rules`, and to `validPrivateUser`'s.

**The `hasOnly` trap:** the rules validate with `data.keys().hasOnly(allowedKeys)`. A field missing from that list causes the **entire write to be rejected**, and the failure surfaces nowhere useful — no error naming the field, in the client or the console. If a write silently stops working after you add a field, this is why.

Member types are a closed set: `MEMBER_TYPES = ["creator", "scientist", "both", "organization"]`.

**Images are records.** `images/{imageId}` is the source of truth for every avatar and gallery image (`ownerUid`, `kind`, `storagePath`, status). The `gallery` array on both profile docs is a display projection carrying each item's `imageId`; `photoImageId` points at the avatar's record. Uploads go record → bytes → `live` (`src/lib/images.ts`), which is what makes a Storage object without a record impossible; removal MARKS the record (`pendingDeletion`) and the `sweepImages` function deletes bytes and record together. Storage layout is `users/{uid}/{avatar|gallery}/{imageId}.webp` — one prefix per account. Never parse a download URL back into a path; derive URLs from `storagePath`.

**An unverified account gets one image per kind.** Neither ruleset can count, so the cap is a *namespace*: an unverified member may only address the id `{uid}-{kind}` (`slotImageId` in `src/lib/images.ts`), which derives exactly one object, and a re-upload overwrites it instead of adding one. The name is written out literally in three places — `images` create in `firestore.rules`, the `filename` clause in `storage.rules`, and `slotImageId` — and they must agree. Both rulesets keep accepting the slot *after* verification on purpose, as a safety net. **The client picks the id from the ID TOKEN'S `email_verified` claim, never from `user.emailVerified`** (`hasVerifiedClaim` in `src/lib/auth.ts`): the cached account record flips to true on the first page load after verification, while the token — the only thing the rulesets can read — keeps saying false for up to an hour. Choosing on the record put just-verified members on the uuid path that their own token could not authorise, so uploads failed with a bare `permission-denied`. Any new gate that decides what to *write* from verification state must ask for the claim. Slot uploads also carry a short `cacheControl`, because one URL serves every replacement.

**Lifecycle is server-side.** `users.status`, `purgeAfter`, `deletionRequestedAt` and `email` are written only by Cloud Functions (`functions/src/`); rules keep them in the client allowlist purely so merged writes pass `hasOnly`, and pin them unchanged. Account deletion is `requestAccountDeletion` (30-day grace, `active: false` hides the member immediately, `purgeExpiredAccounts` finishes it). Slugs live in `slugs/`, owned by `onPublicProfileWritten`; the build reads them and must never write them. The `admin` custom claim (`scripts/set-admin.mjs`) gates `/admin` and the `admin*` callables; admins read through rules and write only through callables, logged to `adminActions`. Design: `documentation/20260902-firebase-entity-restructuring-design.md`.

### Routing and i18n

English and German are served from a **single set of files** under `src/pages/[...lang]/`. There is no `src/pages/de/` — that duplication was deliberately removed (see [documentation/20260515-i18n-routing-and-logic-refactor.md](documentation/20260515-i18n-routing-and-logic-refactor.md)).

Every page in that directory needs:

```js
export function getStaticPaths() {
  return [{ params: { lang: undefined } }, { params: { lang: "de" } }];
}
```

`prefixDefaultLocale: false`, so English is at `/`, German at `/de/`. Strings come from `ui` in [src/i18n/translations.ts](src/i18n/translations.ts) via `useTranslations(lang)`, which falls back `ui[lang][key] ?? ui.en[key] ?? key` — a missing German string renders the English one, silently. Add both locales when adding a key.

### Styling

All design tokens live at the top of [src/styles/global.css](src/styles/global.css): `--color-dark`, `--color-bg` (`#fcfbfa`), `--color-border`, `--color-muted`, `--radius-xs` … `--radius-xl`, `--shell-max`, and `--font-size-base` (13px mobile / 15px desktop, set on `html`, so `rem` units scale with the breakpoint automatically).

`--shell-max` (900px) is the header's measure, and it is a **three-way contract**: the `VSCNVSCN` brand ticker in `Layout.astro`, `.nav-links` in `Navbar.astro` and `main` in `global.css` all size to it, which is what keeps the title, the nav links and the content on the same two vertical edges.

**Do not widen `--shell-max`.** `fitBrandName()` sizes the title to fill that measure, so widening it scales the title up with it — at `min(94vw, 1800px)` the title went from production's ~73px to 120–149px, which was rejected twice. A page that wants wide content uses `Layout`'s `contentWide` prop, which widens `main` **only** (to `min(94vw, 1600px)` on desktop) and leaves the header at 900px; the accepted consequence is that wide content starts outside the header's left edge rather than under it. `/community` is the page using it. `wide` (1200px on `main`) is unaffected by either.

Two things inside `fitBrandName()` look redundant and are not. The ticker's 15px inline padding is load-bearing — the function subtracts it, so removing one without the other either clips the last glyph or breaks the alignment. And it measures with `width: max-content` because `.brand-name` is a block: a block's `scrollWidth` never reports less than its own box, so measuring directly makes the ratio come out 1 on any measure the text does not already overflow — a silent no-op, not an error. The `Math.min` capping the result at `8rem` is what keeps the fit shrink-only.

Use tokens; raw hex values are treated as defects in review. [src/pages/styleguide.astro](src/pages/styleguide.astro) renders them all.

Breakpoints are **only** these two custom-media aliases, resolved by `@csstools/postcss-global-data` + `postcss-custom-media` and usable inside scoped Astro `<style>` blocks:

```css
@media (--bp-mobile)  { }  /* width <= 767px */
@media (--bp-desktop) { }  /* 767px < width  */
```

**Archivo** (self-hosted variable font, weights 100–900) is the typeface for everything. **Space Mono is registered in [astro.config.mjs](astro.config.mjs) and referenced nowhere in `src`** — dead config that still ships a font. `.font-mono` in `global.css` is aliased to Archivo, so it is not a mono class despite the name.

### Layout and scrolling — the non-obvious one

[src/layouts/Layout.astro](src/layouts/Layout.astro) puts `body { overflow: hidden; height: 100dvh }` and makes **`.page-wrap` the scroll container, not the document**. Anything scroll-related must target `.page-wrap`:

- `window.scrollY` and window scroll listeners will not work.
- GSAP ScrollTrigger must be passed `scroller: ".page-wrap"` explicitly.
- CSS `animation-timeline: view()` resolves against it as the nearest scrollport.

The large repeating `VSCNVSCNVSCN` band is `.brand-ticker`, rendered *outside* `.page-wrap` with `transition:persist`, so it is fixed above the scrolling region on every page.

### Astro specifics worth knowing

`ClientRouter` (view transitions) is active site-wide. Client scripts must initialise on `astro:page-load` — not `DOMContentLoaded`, which fires once — and tear down on `astro:before-swap` or state leaks across navigations. The motion layer in [src/components/CommunityGrid.astro](src/components/CommunityGrid.astro) is the precedent, epoch guard included.

Two scoping facts, both verified against built CSS in this repo:

- **`@keyframes` are NOT scoped.** Animation names in component `<style>` blocks are global; collisions across components are real.
- **Astro's scope attribute ADDS specificity.** It appends `[data-astro-cid-…]` to *every* compound selector and does **not** wrap it in `:where()`. So `.a .b` is served at (0,4,0), not (0,2,0). This matters whenever you need one rule to beat another — particularly inside `@media` blocks, which contribute no specificity of their own.

Remote images (Firebase Storage) are optimised at build time with `getImage` from `astro:assets`; the allowed hosts are in `astro.config.mjs` under `image.remotePatterns`.

## Environment

`.env`, `.env.development` and `.env.production` are **gitignored** — see [.env.example](.env.example). Two kinds of variable:

- `PUBLIC_FIREBASE_*` — client SDK config, plus `PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY` for App Check.
- `FIREBASE_SERVICE_ACCOUNT` — a JSON service account read at **build time** by `community.astro`.

App Check uses reCAPTCHA Enterprise. In dev, `firebase.ts` sets `FIREBASE_APPCHECK_DEBUG_TOKEN = true`, which prints a debug token to the browser console; register it in Firebase Console → App Check → Manage debug tokens or authenticated calls fail locally.

## Deployment

Three GitHub Actions in `.github/workflows/` handle Firebase Hosting: merge, pull-request preview, and staging. Auto-deploy on push to `dev` was deliberately disabled (commit `3e8e2fc`) — dev deploys are manual via `npm run deploy:dev`.

Branches: `main` is production, `dev` is integration. Work on a feature branch. Two features once sat interleaved in one dirty working tree for two months and could no longer be split into separate commits — hence `3fcc0ba`, which had to land both at once.

## Conventions

`documentation/` holds dated technical notes (`YYYYMMDD-topic.md`) recording decisions and their reasoning — check it before re-litigating a design choice. `documentation/agent-memory/` mirrors the user's `~/.claude` memory notes so they travel with the repo; those files **are tracked**, and an edit to either copy belongs in both.

One note in `documentation/` is load-bearing rather than historical: [documentation/20260831-webkit-details-display-contents-crash.md](documentation/20260831-webkit-details-display-contents-crash.md). Giving `::details-content` a scroll-container `overflow` (`hidden` or `auto`) while its `<details>` is `display: contents` **segfaults the WebContent process on iOS**, so the page cannot be opened at all — no console error, nothing in the network tab. Fixed in WebKit trunk, in no shipped iOS as of 26.6. The community cards work around it with a real box on `.pdisc` and `overflow: clip` on the pseudo; read that note before simplifying either.

The community visual prototype **graduated and was deleted** (2026-08-24): its card language lives on in `src/components/community/`, and its history and decisions are in [documentation/20260820-community-prototype-plan.md](documentation/20260820-community-prototype-plan.md) and [documentation/20260824-image-card-directory-design.md](documentation/20260824-image-card-directory-design.md). The one surviving `/proto` page is [src/pages/proto/profile-preview.astro](src/pages/proto/profile-preview.astro), a no-auth harness for the profile editor's preview renderer — `noindex`, sitemap-excluded, kept because `/profile` cannot be seen without credentials. The curated member images used for gallery seeding live in `scripts/assets/curated-galleries/` (see `scripts/seed-curated-galleries.mjs`).

## Tooling notes

The in-app browser pane opens with a **0 × 0 viewport** in this environment. Call `resize_window` with explicit dimensions immediately after opening it, or every measurement returns `0` and a perfectly good layout looks broken.
