# i18n Routing & Profile Logic Refactor — 2026-05-15

This document details the major architectural refactor performed to eliminate redundancy in localized pages and centralize core business logic.

## 1. Global Dynamic Routing (`[...lang]`)

Previously, internationalization (i18n) was handled by duplicating page files across `src/pages/` and `src/pages/de/`. This led to maintenance overhead and potential "logic drift" between versions.

### The New Pattern
All top-level pages have been moved into a catch-all dynamic directory: `src/pages/[...lang]/`.

- **Root URLs:** Visiting `/onboarding` sets `lang` to `undefined`, defaulting to `"en"`.
- **Localized URLs:** Visiting `/de/onboarding` sets `lang` to `"de"`.

### Implementation Detail
Each page now exports a `getStaticPaths` function:

```typescript
export function getStaticPaths() {
  return [
    { params: { lang: undefined } }, // English (Root)
    { params: { lang: "de" } },      // German
  ];
}
```

This single source of truth ensures that layout changes, SEO updates, and component props are identical across all supported languages.

---

## 2. Centralized Profile Logic (`src/lib/profile.ts`)

Logic for updating user profiles, handling avatar uploads (including resizing and validation), and triggering community rebuilds was previously duplicated in `OnboardingForm.astro` and `ProfileForm.astro`.

### New Utility Library
A new library `src/lib/profile.ts` was created to encapsulate these operations.

- **`handleProfileUpdate`**: A unified function that:
  1. Validates the bio.
  2. Processes and uploads a new avatar (if provided).
  3. Syncs data to Firebase Auth (`displayName`, `photoURL`).
  4. Syncs data to Firestore (`users` and `publicProfiles` collections).
- **`triggerRebuild`**: Centralized logic for dispatching the GitHub Actions workflow to rebuild the static community grid.

### Impact
- **Maintenance:** Bug fixes in the upload or save flow only need to be applied in one file.
- **Code Volume:** Reduced the script blocks in `OnboardingForm.astro` and `ProfileForm.astro` by over 400 lines combined.

---

## 3. Maintenance & Cleanup

- **Deleted:** The entire `src/pages/de/` directory and redundant root-level `.astro` files.
- **Linting:** Performed a global lint check to remove unused imports (`updateUserProfile`, `uploadAvatar`, etc.) that were superseded by the new library.
- **Backup:** All changes were verified and pushed to the `main` branch on GitHub.
