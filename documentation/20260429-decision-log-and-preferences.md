# VSCN Decision Log and Preferences

> Last updated: 2026-04-29

This document records the reasoning behind recent implementation choices, plus the product and styling preferences that should guide future work on VSCN.

## Project Direction

VSCN is an early-stage community directory for people who want to make science visual, accessible, and appealing. The site should feel useful immediately: less like a marketing page, more like a working community tool.

The current core experience is:

- Visitors can learn what VSCN is.
- People can sign up and verify their email.
- Verified members can edit their private profile.
- The community page displays public member cards from Firestore.
- Sensitive fields, especially phone numbers and email addresses, stay out of the public directory.

## User Preferences

Prefer direct implementation over long theoretical answers. When the request is clear, make the change and verify it.

Keep the UI minimal, clean, and functional. Avoid overly decorative layouts, nested cards, huge marketing sections, or unnecessary explanation text in the interface.

The site should work well on mobile first, but desktop must not feel like a stretched mobile layout. Community cards should be readable and should not cut off names.

Use simple global utilities for repeated UI, especially buttons. The current preferred button concepts are:

- `btn-solid`: primary action, dark filled button, white text.
- `btn-outline`: secondary action, bordered button.

Keep community member cards compact. Bio text should be discoverable without making the grid feel broken. Current behavior:

- Desktop: bio appears as a tooltip-like panel on card hover/focus.
- Mobile: bio remains expandable by arrow.

Do not show phone numbers on the community grid. They are private and only used for creating a future chat group.

## Firebase Data Model

The app intentionally separates private user data from public directory data.

### Private User Document

Collection: `users/{uid}`

Purpose: owner-only profile data.

May contain:

- display name
- role
- bio
- portfolio
- avatar URL
- email
- phone number
- timestamps

Access rule:

- Only the signed-in owner can read/write their own private document.

### Public Profile Document

Collection: `publicProfiles/{uid}`

Purpose: public community directory card data.

May contain:

- display name
- role
- bio
- portfolio
- avatar URL
- timestamps

Must not contain:

- phone number
- email address

Access rule:

- Anyone can read public profiles.
- Only the verified owner can create/update their own public profile.

Reasoning: the community page can stay public and easy to browse without exposing sensitive contact details.

## Auth and Verification

Signup creates the Firebase Auth user, writes the private `users/{uid}` document, sends the verification email, then redirects to `/verify-email`.

Public profile publishing requires a verified email. After verification, the app refreshes the Firebase ID token before writing the public profile. This matters because Firebase rules read `request.auth.token.email_verified`, and that value can be stale until the token is refreshed.

The auth redirect logic should not interrupt signup while the verification email is still being sent. The signup form uses an `isSubmitting` guard for this.

## Validation Decisions

The bio limit is 35 words.

This is enforced in two places:

- Client-side in `src/lib/validation.ts`.
- Firestore-side in `firestore.rules`.

Keep these in sync. The rule and the TypeScript constant both include comments pointing to each other.

Avatar uploads are validated client-side for file type and size. Storage rules also restrict avatar paths so users can only write their own avatar file.

## Community Grid Decisions

Community members are loaded from Firestore on the client. Static member cards were removed so the directory reflects real data.

The grid should use:

- 3 columns on wider desktop.
- 2 columns around tablet/smaller desktop widths.
- 1 column on mobile.
- A minimum card width around 330px where possible.

Cards should avoid changing width when bio content appears. Desktop hover bio is positioned as a panel below the card with shadow so it reads like a tooltip.

## Styling Decisions

Global CSS owns shared tokens and reusable classes. Component CSS should stay close to the component when the styling is specific to that component.

Custom media queries are supported through PostCSS:

- `src/styles/breakpoints.css`
- `postcss.config.mjs`

Use these breakpoints where they make the CSS clearer, but plain local media queries are fine for one-off component thresholds such as the community grid's 1050px switch.

The background noise effect uses the local asset:

- `src/assets/noise-transparent.png`

Reasoning: avoid HTTP-only third-party texture URLs and keep the visual asset under project control.

## Deployment and Config Cleanup

The project uses Firebase Hosting Classic with `dist` as the hosting output.

Removed as redundant/stale:

- `apphosting.yaml`
- tracked `functions/*` files
- old Astro Vite config that externalized `firebase-admin`

The root `firebase-admin` dependency remains because local admin scripts use it:

- `scripts/seed-members.mjs`
- `scripts/migrate-public-profiles.mjs`
- `scripts/export-phone-numbers.mjs`

## Admin Scripts

The admin scripts require a Firebase service account environment variable. They are for trusted local/admin use only and must not be exposed in client code.

Current script purposes:

- `seed-members.mjs`: creates or deletes test members.
- `migrate-public-profiles.mjs`: copies safe public fields from `users` to `publicProfiles`.
- `export-phone-numbers.mjs`: lets the owner access private phone numbers for chat group setup.

## Verification Checklist

After meaningful code changes, run:

```bash
npm run lint
npm run build
```

The build may need network access because Astro fetches font files during the build. If the build fails with `CannotFetchFontFile`, rerun with network access rather than assuming the app code is broken.

## Things To Be Careful About

Do not put phone or email fields into `publicProfiles`.

Do not loosen Firestore rules just to make a client error disappear. First check whether the user is verified and whether the ID token has been refreshed.

Do not reintroduce static community member data.

Do not bring back the stale Cloud Functions rebuild workflow unless there is a real backend feature that needs it.

Do not remove `firebase-admin` from root dependencies while the admin scripts still exist.

