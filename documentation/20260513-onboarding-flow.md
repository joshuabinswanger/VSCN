# Multi-Step Onboarding Flow

> Last updated: 2026-05-13

---

## Overview

New members previously landed on the full profile editor immediately after signup — a dense form that caused drop-off. This session replaced that with a guided multi-step onboarding that collects the minimum useful info first, then optionally deepens the profile. A new "community goals" field was added to capture what members are looking for.

Email verification is intentionally **not** a barrier to completing onboarding or saving profile data. A soft reminder banner is shown, but the user is never blocked.

---

## Flow

```
/signup  (email + password)
   ↓
/onboarding
   Step 0 — Name, Role, Website, Social Media, Phone
   Step 1 — Community goals (checkboxes + free text)
   Step 2 — Bridge: "Basic profile complete! Want to add more?"
   Step 3 — Tags
   Step 4 — Bio + Avatar
   ↓
/community
```

Steps 3 and 4 each have a "Skip for now" link that goes directly to `/community` without saving. The bridge (step 2) has two CTAs: Continue or Skip to community. A progress counter ("1 / 4") is shown for steps 0, 1, 3, 4 — the bridge has no counter.

On revisit, if `onboardingComplete: true` is in the user's document, `/onboarding` immediately redirects to `/community`.

---

## New Files

| File | Purpose |
|---|---|
| [`src/components/OnboardingForm.astro`](../src/components/OnboardingForm.astro) | Multi-step form component |
| [`src/pages/onboarding.astro`](../src/pages/onboarding.astro) | English page wrapper |
| [`src/pages/de/onboarding.astro`](../src/pages/de/onboarding.astro) | German page wrapper |

---

## Data Model Changes

`src/lib/firestore.ts` — two new optional fields on `UserDoc`:

```ts
communityGoals?: string[];    // what the user wants from the community
onboardingComplete?: boolean; // skip /onboarding on revisit
```

`communityGoals` preset values:

| Value | Label |
|---|---|
| `"networking"` | Networking |
| `"portfolio"` | Portfolio showcase |
| `"events"` | Events |
| `"scivis-info"` | Information about science visualization |

The user may also type a custom goal, which is appended to the array as a free string.

`communityGoals` is stored only in the private `users` collection, not published to `publicProfiles`.

---

## Firestore Rules Changes

`firestore.rules` was updated for two reasons.

### 1. Removed `email_verified` from `publicProfiles`

The rule previously blocked any write to `publicProfiles` for users who had not verified their email. This was removed so unverified users can complete onboarding and have a public profile.

```js
// Before
allow create, update: if request.auth != null
                      && request.auth.uid == uid
                      && request.auth.token.email_verified == true  // removed
                      && validPublicProfile(request.resource.data);

// After
allow create, update: if request.auth != null
                      && request.auth.uid == uid
                      && validPublicProfile(request.resource.data);
```

### 2. Added `communityGoals` and `onboardingComplete` to `validPrivateUser`

The `allowedKeys` list in `validPrivateUser` is exhaustive — any key in the document not on the list causes the entire write to be rejected. After onboarding writes `communityGoals` and `onboardingComplete` into the `users` document, all subsequent profile saves (from the profile editor) would fail because those fields were not listed. Both fields were added with appropriate type validation.

```js
let allowedKeys = [..., 'communityGoals', 'onboardingComplete', ...];

// added validation lines:
&& (!('communityGoals' in data) || data.communityGoals is list)
&& (!('onboardingComplete' in data) || data.onboardingComplete is bool)
```

---

## OnboardingForm Architecture

### Auth guard and pre-fill

The form is guarded by `requireAuth` (not `requireVerifiedAuth`). On load it calls `getUser(uid)` wrapped in `try/catch` — if the read fails due to a permission error (e.g. during a rules deploy window), the form still renders with empty fields rather than showing an error. If the user already has data, fields are pre-filled.

### Save strategy

Saves on steps 0, 1, and 3 are **best-effort**: wrapped in `.catch(() => {})` so the form always advances to the next step even if the Firestore write fails. This prevents a transient permissions issue from blocking a user mid-flow.

The final step (step 4) saves synchronously before redirecting, and sets `onboardingComplete: true`.

### Tag system

Step 3 (tags) reuses the same tag registry pattern as `ProfileForm`: fetches `publicTags` from Firestore, shows the user's existing tags as chips, and supports autocomplete for adding new ones.

### Avatar upload

Step 4 reuses the same Firebase Storage upload pattern as `ProfileForm`: uploads to `avatars/{uid}`, gets a download URL, saves it as `photoURL`.

---

## AuthForm Change

Post-signup redirect changed from `/verify-email` to `/onboarding`. An intermediate fix had temporarily pointed to `/verify-email`; this was reverted once the decision was made that email verification is not a requirement.

---

## i18n

New key group `onboarding.*` added to both `en` and `de` in `src/i18n/translations.ts`. Covers step titles, field labels, goal option labels, bridge copy, navigation buttons (Next, Finish, Skip), and saving/error states.

---

## Navbar Language Toggle

The language toggle at the bottom-right of every page was updated from a single label ("DE" or "EN") to "EN / DE" — the current language shown bold and dark, the target language shown muted and darkening on hover.

### Implementation note: Astro scoped styles and `innerHTML`

The toggle element uses `transition:persist`, meaning the DOM node is kept across client-side navigations and its content is updated via `innerHTML` in JS. Spans injected via `innerHTML` do not carry Astro's scoped `data-astro-cid-*` attribute.

The initial attempt used a dual-class approach (`lang-opt` + `lang-opt--active`) with `:global()` wrappers in the scoped CSS. This caused a specificity tie: both rules had equal weight, making the winner depend on CSS declaration order — unreliable across Astro builds.

**Fix:** two mutually exclusive classes — `lang-cur` (current language: dark, bold) and `lang-tgt` (target language: muted, darkens on hover) — so no element ever has both classes and there is no specificity conflict.

```css
.lang-toggle :global(.lang-cur)  { color: var(--color-dark);  font-weight: 600; }
.lang-toggle :global(.lang-tgt)  { color: var(--color-muted); font-weight: 400; transition: color 0.15s; }
.lang-toggle:hover :global(.lang-tgt) { color: var(--color-dark); }
```
