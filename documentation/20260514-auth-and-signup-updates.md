# Documentation: Authentication Flow and Signup Enhancements (May 2026)

This document details the improvements made to the authentication user experience and the addition of targeted "Sign Up" call-to-actions across the site.

## 1. Authentication Flow Improvements

### Dedicated Login Pages
To resolve inconsistencies where the "LOGIN" link led to a registration form, dedicated login pages were created:
- `/login` (English)
- `/de/login` (German)

These pages utilize the `AuthForm` component in `login` mode.

### `AuthForm` Component Refactor (`src/components/AuthForm.astro`)
The `AuthForm` component was updated to support two primary modes via the `initialMode` prop:
- **`signup`** (Default): Displays registration fields and "Sign Up" titles.
- **`login`**: Displays the password reset link ("Forgot?") and "Log In" titles.

The component's client-side script was also refactored to handle dynamic updates to the title, submit button text, and toggle links without requiring a page reload when switching between modes.

### Simplified Wording
Per user feedback, the authentication UI was simplified to be more direct:
- Removed conversational prefixes like "Already have an account?" or "Don't have an account?".
- Toggle links were simplified to just **"Sign Up"** or **"Log In"**.
- This change was applied globally across both English and German translations.

## 2. Global Signup Call-to-Actions (CTAs)

To increase member growth, guest-specific signup buttons were added to key pages.

### Info Page (`src/components/InfoPage.astro`)
Added a "Sign Up" button at the bottom of the informational content.

### Community Page (`src/components/CommunityGrid.astro`)
Added a "Sign Up" button at the bottom of the member directory grid.

### Guest-Only Logic
Both CTAs are powered by a client-side script using `onAuthStateChanged` from Firebase Auth. The buttons are hidden by default (`display: none`) and only revealed if the user is confirmed to be logged out. If a user signs in, the buttons automatically disappear.

## 3. Navigation Updates

The `Navbar` component was updated to ensure the "LOGIN" link points to the new `/login` route instead of the registration-focused `/signup` route.

## Summary of Files Changed

- `src/components/AuthForm.astro`: Added mode support and simplified logic.
- `src/pages/login.astro` & `src/pages/de/login.astro`: New dedicated routes.
- `src/components/Navbar.astro`: Updated login links.
- `src/components/InfoPage.astro`: Added guest-only CTA.
- `src/components/CommunityGrid.astro`: Added guest-only CTA.
- `src/i18n/translations.ts`: Simplified auth and CTA labels.
