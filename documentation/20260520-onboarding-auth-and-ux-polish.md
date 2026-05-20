# Onboarding Auth Integration & UX Polish

**Date:** 2026-05-20  
**Files changed:** `OnboardingForm.astro`, `ProfileForm.astro`, `firestore.ts`, `translations.ts`, `Layout.astro`, `LandingHero.astro`, `Navbar.astro`, `signup.astro`

---

## 1. Auth Embedded in Onboarding (step −1)

Account creation is now part of the onboarding flow instead of a separate `/signup` page.

### UX
- Step −1 opens with the heading + a single **"Create Account"** button
- Clicking it reveals: **Email**, **Password**, **Confirm password** fields + submit
- On submit, `createUserWithEmailAndPassword` is attempted; if the email is already registered, `signInWithEmailAndPassword` is tried as a fallback (existing user resuming onboarding)
- A verification email is sent automatically for new accounts
- Password mismatch shows an inline error before any network call

### Auth guard
`requireAuth` was replaced with a one-shot `onAuthStateChanged` listener:
- Logged-in + `onboardingComplete: true` → redirect to `/community`
- Logged-in + incomplete → skip step −1, resume at last saved step
- Not logged in → show step −1

### `/signup` redirect
`signup.astro` now issues a **301 redirect to `/onboarding`**. All historical links and bookmarks are preserved. The Navbar "LOGIN" link was updated to `/login` (which was already a separate login-mode page using `AuthForm`).

---

## 2. Profile Activation Only at the Bridge

Previously, `publishPublicProfile` auto-set `active: true` the first time it wrote to `publicProfiles/{uid}`. This meant a card could appear in the community directory after just step 0.

### Change
- `publishPublicProfile` is now a **pure data sync** — it never touches the `active` field
- A new `activatePublicProfile(uid)` function sets `active: true` explicitly
- It is called only at the bridge screen (step 2): both **"Continue"** and **"Skip"** buttons trigger it before advancing

This means a user who starts the form but closes before the bridge will not appear in the community directory.

---

## 3. Profile "Active" Toggle

### ProfileForm
Added a checkbox field above `OpenToSelector`:
- **Label:** "Active" / "Aktiv"
- **Note:** "Should your community card be visible?" / "Soll deine Community-Karte sichtbar sein?"
- Reads from `publicProfiles/{uid}.active` via `getPublicProfileActive`
- Writes via `setProfileActive` on save

### Firestore helpers added (`firestore.ts`)
```typescript
activatePublicProfile(uid)        // sets active: true — called at onboarding bridge
setProfileActive(uid, active)     // called by ProfileForm on save
getPublicProfileActive(uid)       // reads active field for ProfileForm load
```

---

## 4. `wantsToContribute` Moved to Onboarding Only

The `wantsToContribute` checkbox was removed from `ProfileForm` — it belongs in the onboarding step 1 (community goals) where it has context alongside the `openTo` selector. The field is still saved to Firestore and read back when a user resumes an incomplete onboarding.

---

## 5. GSAP Headline Removed

The animated GSAP headline (`GsapTextHeadline.astro`) that cycled through "Visual → Science → Communication → Network → VSCNVSCNVSCNVSCN" was removed from the layout.

### Replacement
A static `<span>VSCNVSCNVSCNVSCN</span>` at `font-weight: 800`, `line-height: 0.95` — matching the headline's final frame. A small `ResizeObserver`-backed script in `Layout.astro` scales the font size so the text always fills the full ticker width, using the same proportional-fit calculation the original JS used.

### LandingHero
- `[data-hero-reveal]` elements are now hidden via CSS (`visibility: hidden`) on initial load to prevent a flash before GSAP runs
- The hero no longer waits for `gsap-headline-complete` — it reveals immediately on `astro:page-load`
- Reduced-motion path uses `gsap.set(..., { autoAlpha: 1, y: 0 })` (inline style override) instead of `clearProps: "all"` which would have exposed the CSS hidden state
