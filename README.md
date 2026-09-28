# VSCN — Visual Science Communication Network

A platform for visual science communicators to connect, showcase their work, and find collaborators. Built with Astro, Firebase, and GSAP.

## 🚀 Features
- **Member Directory:** A searchable grid of professionals in visual science communication.
- **Onboarding Flow:** A multi-step process for new users to set up their profiles.
- **Profile Management:** Users can update their skills (tags), portfolio links, and bio.
- **Multilingual Support:** Full English (default) and German (`/de`) support via a custom i18n system.
- **Dynamic Headline:** Interactive GSAP-powered ticker/headline on the landing page.
- **Automated Rebuilds:** Updates to profiles trigger GitHub Action dispatches to refresh the static community grid.

## 🛠 Tech Stack
- **Frontend:** [Astro](https://astro.build/) (v7)
- **Styling:** Vanilla CSS with PostCSS (Custom Media, Global Data)
- **Animations:** [GSAP](https://gsap.com/)
- **Backend/DB:** [Firebase](https://firebase.google.com/) (Auth, Firestore, Storage)
- **Localization:** Custom i18n utility in `src/i18n/`

## 📁 Project Structure
- `src/components/`: Reusable UI components (MemberCard, TagSelector, etc.)
- `src/layouts/`: Main page layout and global styles.
- `src/lib/`: Firebase configuration and core logic (Auth, Firestore, Storage).
- `src/pages/`: File-based routing (including German overrides in `/de`).
- `scripts/`: Maintenance scripts for seeding data and migrations.
- `documentation/`: Detailed decision logs and technical updates.

## 🏁 Getting Started

1. **Install Dependencies:**
   ```bash
   npm ci
   ```

2. **Environment Variables:**
   Create a `.env` file based on `.env.example` with your Firebase and GitHub API credentials.

3. **Development Server:**
   ```bash
   npm run dev
   ```

4. **Building for Production:**
   ```bash
   npm run build
   ```

## 🧹 Maintenance
- **Linting:** `npm run lint`
- **Formatting:** `npm run format`

## Verification and publishing

Install backend dependencies with `npm --prefix functions ci`, then run `npm run verify`.
This runs lint, Astro type checking, unit tests, backend compilation, and serialized
Firestore/Storage emulator tests (Java 21 or later). `npm run build` is a separate
rendering check and needs configured Firebase data or a directory snapshot.

CI verifies the code, exports public directory data, renders on a separate runner
without service-account credentials, and deploys the resulting artifact. A queued
publication is acknowledged only after Hosting deployment succeeds. The Hosting workflows
deploy the Firestore and Storage rules before Hosting, but never Functions: deploy those by
hand when changing backend behavior.

See [the audit remediation notes](documentation/codebase-audit-20260915/remediation.md)
for verification results and rollout requirements.
