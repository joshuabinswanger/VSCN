# Dev Environment & Staging Setup

**Date:** 2026-05-26  
**Files changed:** `.firebaserc`, `.env.development`, `package.json`, `scripts/sync-prod-to-dev.mjs`, `.github/workflows/firebase-hosting-staging.yml`

---

## 1. Firebase Dev Project

A second Firebase project (`vscn-dev-f4b60`) was created to serve as an isolated development/staging environment, keeping all test data separate from production.

### `.firebaserc`

Added a `dev` alias pointing to the new project:

```json
{
  "projects": {
    "default": "vscn-39508",
    "dev": "vscn-dev-f4b60"
  }
}
```

### `.env.development`

Created with all dev Firebase config variables (`PUBLIC_FIREBASE_*`) and a `FIREBASE_SERVICE_ACCOUNT` key containing the dev project's Admin SDK service account JSON (single-line, single-quoted). This file is gitignored and must not be committed.

---

## 2. Prod-to-Dev Database Sync Script

**`scripts/sync-prod-to-dev.mjs`** — A one-shot Node.js script that clones the production Firestore state into the dev database.

### What it does

1. Reads `FIREBASE_SERVICE_ACCOUNT` from both `.env` (prod) and `.env.development` (dev).
2. Initialises two independent `firebase-admin` app instances.
3. For each synced collection: **clears** all existing dev docs, then batch-writes all prod docs.

### Collections synced

`tags`, `openTo`, `users`, `publicProfiles`, `onboardingRequests`

### Usage

```bash
node scripts/sync-prod-to-dev.mjs
```

Run this whenever you want the dev database to mirror the latest production state. The script is safe to run repeatedly — it always clears dev first to ensure an exact match.

---

## 3. Staging GitHub Actions Workflow

**`.github/workflows/firebase-hosting-staging.yml`** — Automatically builds and deploys to the dev Firebase Hosting project.

### Trigger

```yaml
on:
  workflow_dispatch: # manual trigger only
```

The `push` trigger was intentionally removed. Deploys only happen when you explicitly run `npm run deploy:dev` or trigger the workflow manually via the GitHub Actions UI. Pushing to `dev` will **not** auto-deploy.

### Build environment

The workflow passes all `DEV_FIREBASE_*` secrets as environment variables during `npm run build`, and uses `FIREBASE_SERVICE_ACCOUNT_VSCN_DEV` for both the build-time Admin SDK and the hosting deploy step.

### Required GitHub secrets

| Secret                              | Description                        |
| ----------------------------------- | ---------------------------------- |
| `DEV_FIREBASE_API_KEY`              | Dev project API key                |
| `DEV_FIREBASE_AUTH_DOMAIN`          | Dev auth domain                    |
| `DEV_FIREBASE_PROJECT_ID`           | `vscn-dev-f4b60`                   |
| `DEV_FIREBASE_STORAGE_BUCKET`       | Dev storage bucket                 |
| `DEV_FIREBASE_MESSAGING_SENDER_ID`  | Dev sender ID                      |
| `DEV_FIREBASE_APP_ID`               | Dev app ID                         |
| `DEV_FIREBASE_MEASUREMENT_ID`       | Dev measurement ID                 |
| `FIREBASE_SERVICE_ACCOUNT_VSCN_DEV` | Dev Admin SDK service account JSON |

All secrets are configured in the repository. The `DEV_FIREBASE_API_KEY` secret was added on 2026-05-26 to complete the set.

---

## 4. `deploy:dev` npm Script

Added to `package.json` for quick manual deploys without a git push:

```json
"deploy:dev": "astro build --mode development && firebase deploy -P dev --only hosting"
```

This builds the site using `.env.development` variables (`--mode development`) and deploys directly to the dev Firebase Hosting project.

---

## 5. `dev` Git Branch

A `dev` branch was created from `main` and pushed to GitHub. This branch is the ongoing development branch. The GitHub Actions staging workflow deploys automatically whenever changes are pushed to it.

---

## Dev Workflow Summary

| Action | Command |
|---|---|
| Local development | `npm run dev` |
| Deploy to dev site | `npm run deploy:dev` |
| Sync prod data → dev DB | `node scripts/sync-prod-to-dev.mjs` |
| Deploy to production | Merge `dev` → `main` on GitHub |

**Dev site URLs:**

- https://vscn-dev-f4b60.web.app
- https://vscn-dev-f4b60.firebaseapp.com
