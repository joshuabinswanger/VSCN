<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/signup-is-the-wizards-first-step.md — kept in sync so any Claude instance can read it without the user profile. -->

---
name: signup-is-the-wizards-first-step
description: There is no separate signup page — /signup 301s to /onboarding whose step -1 IS the signup form; the login page's second copy of account creation was deleted 2026-09-07
metadata:
  type: project
---

The file names mislead. `src/pages/[...lang]/signup.astro` contains only a 301
to `/onboarding`. The signup form is `data-step="-1"` inside
`OnboardingForm.astro` — "Create your account", a Create Account button that
reveals email + two password fields, and on success the same page advances to
step 0 without a navigation. So signup does come before onboarding; it is one
route with signup at the front, not two routes.

`/signup` is the canonical entry point: the hero, info page, community grid,
members index, the auth-action page and both guards in `src/lib/auth.ts` all
point at it. Never repoint those at `/onboarding` — the redirect is the seam
that lets the flow be restructured without touching seven call sites.

**Until 2026-09-07 there were TWO account-creation implementations.**
`AuthForm.astro` (the login page) had a "Sign Up" mode toggle that flipped the
form in place into a full second signup: its own
`createUserWithEmailAndPassword`, its own verification mail, its own redirect.
They disagreed — only AuthForm's wrote `users/{uid}.createdAt` — so members
came out in two shapes depending on which door they used. `c16ebaf` deleted
AuthForm's signup mode, moved the `createdAt` write into the wizard, and gave
the wizard's signup step an "Already have an account? Log in" link. That link's
absence is the likely reason the toggle existed at all.

**How to apply:** AuthForm is login + password-reset ONLY. Account creation
lives in exactly one place. If you need to change signup, it is
OnboardingForm's step -1 and nothing else.

**Two English leaks lived in the same copy:** `auth.alreadyHave` and
`auth.noAccount` were empty strings in BOTH locales, so the component ran a
`|| "Don't have an account? "` fallback — hardcoded English on /de.
`tests/unit/authCopy.test.mjs` now fails on any empty auth string, on key drift
between en and de, and on a duplicate key (a stale empty entry hid under a good
one here; `astro check` does flag ts 1117 but it lands among ~54 pre-existing
errors where a new one is invisible).

SHIPPED TO PROD 2026-09-07 as merge commit `e3c8cf9` (PR #3). Verified live on
both vscn.ch and vscn-39508.web.app: `/signup` lands on the wizard, the old
standalone form is gone, and the German login page answers in German. The
"prod still serves the old world" caveat this note used to carry is CLOSED.

Related: [[deploy-dev-needs-development-mode]], [[firestore-rules-hasonly-gotcha]].
