# Landing and Info Copy Updates - 2026-05-16

This note documents the recent landing-page and info-page copy/styling updates.

## Landing Page

- `LandingHero.astro` now renders the primary landing sentence from `hero.statement.connect`.
- The phrase `Visual Science Communication Network` is detected inside that translated sentence and wrapped in a dedicated `<strong class="landing-hero__network-name">`.
- The rest of the landing sentence stays regular weight, while the network name is bold.
- The landing hero uses matching type sizes for the primary and purpose statements, with both set to `20px` on mobile.
- The hero height is content-driven rather than viewport-driven, avoiding an unnecessary scrollbar.
- The CTA is a single button using `hero.cta.join` for logged-out users and `hero.cta.community` for logged-in users.

## Info Page

- `InfoPage.astro` now renders only the current info translation keys:
  - `info.intro`
  - `info.p2`
  - `info.h2.building`
  - `info.li.1` through `info.li.4`
  - `info.h2.started`
  - `info.p4`
  - `info.contact`
- Removed extra info-page paragraphs that were not present in the final translation structure.
- The final reach-out sentence and email are rendered inline:
  - English: `...feel free to reach out: info@vscn.ch`
  - German: `...melde dich gerne: info@vscn.ch`
- The `Contact` / `Kontakt` label is no longer shown before the email.

## Verification

- `npm run lint` passes with the existing unused `t` warnings in localized route files.
- `npm run build` passes.
