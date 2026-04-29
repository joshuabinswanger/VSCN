# VSCN — Project Documentation

> Last updated: 2026-04-20

---

## Overview

VSCN is a community website built with **Astro** (static site framework) and **Firebase** as the backend-as-a-service. It is currently run locally via `npm run dev` and will be deployed to either Cloudflare or Firebase Hosting.

---

## Tech Stack

| Layer            | Technology                      |
| ---------------- | ------------------------------- |
| Framework        | [Astro](https://astro.build) v6 |
| Language         | TypeScript                      |
| Backend / Auth   | Firebase (Spark free plan)      |
| Database         | Firestore                       |
| File Storage     | Firebase Storage                |
| Analytics        | Firebase Analytics              |
| Package Manager  | npm                             |
| Node requirement | >= 22.12.0                      |

---

## Project Structure

```
VSCN/
├── documentation/           # This folder
│   └── project-overview.md
├── public/
│   ├── favicon.ico
│   └── favicon.svg
├── src/
│   ├── layouts/
│   │   └── Layout.astro     # Shared page shell (nav, head, styles)
│   ├── lib/
│   │   └── firebase.ts      # Firebase init — exports auth, db, storage
│   └── pages/
│       ├── index.astro      # Landing page
│       ├── community.astro  # Community feed (reads Firestore posts)
│       ├── info.astro       # About / rules / contact page
│       ├── signup.astro     # Sign up + log in (togglable form)
│       └── profile.astro    # Edit profile (auth-gated)
├── .env                     # Firebase config keys (never commit this)
├── .env.example             # Safe template for .env (commit this)
├── cors.json                # CORS config applied to Firebase Storage bucket
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

---

## Pages

### `/` — Landing Page

[src/pages/index.astro](../src/pages/index.astro)

Simple hero with a "Join Now" button linking to `/signup` and a "Learn More" button linking to `/info`. No Firebase calls.

---

### `/community` — Community Feed

[src/pages/community.astro](../src/pages/community.astro)

Reads the `posts` collection from Firestore on page load. Queries the 20 most recent posts ordered by `createdAt` descending. Renders each post with author name and body text. No login required to view.

**Firestore collection:** `posts`

```
posts/{postId}
  author:    string
  body:      string
  authorId:  string   (uid — used for ownership rules)
  createdAt: timestamp
```

---

### `/info` — Info Page

[src/pages/info.astro](../src/pages/info.astro)

Static page. Contains placeholder sections for: what the community is, community rules, and a contact email. Edit this file directly to fill in your own content.

---

### `/signup` — Sign Up / Log In

[src/pages/signup.astro](../src/pages/signup.astro)

Single form that toggles between **Sign Up** and **Log In** mode via a link.

**Sign Up flow:**

1. Creates a Firebase Auth account (`createUserWithEmailAndPassword`)
2. If an avatar image was selected, uploads it to Firebase Storage at `avatars/{uid}.{ext}` and gets back a download URL
3. Sets `displayName` and `photoURL` on the Firebase Auth user profile
4. Writes a user document to Firestore `users/{uid}` with `displayName`, `photoURL`, `bio`, `email`, `createdAt`
5. Redirects to `/community`

**Log In flow:**

1. Signs in via `signInWithEmailAndPassword`
2. Redirects to `/community`

Fields: Display Name, Profile Image (file upload), Bio, Email, Password.

---

### `/profile` — Edit Profile

[src/pages/profile.astro](../src/pages/profile.astro)

Auth-gated — redirects to `/signup` if not logged in.

On load: reads `users/{uid}` from Firestore and pre-fills the form with current values.

**Save flow:**

1. If a new image file was selected, uploads it to Storage (same path as signup: `avatars/{uid}.{ext}`, overwrites previous)
2. Updates Firebase Auth profile (`updateProfile`)
3. Merges changes into `users/{uid}` in Firestore (uses `{ merge: true }` so only provided fields are overwritten)

Fields: Display Name, Profile Image, Bio.

---

## Navigation (`Layout.astro`)

[src/layouts/Layout.astro](../src/layouts/Layout.astro)

The nav is rendered on every page via the shared layout. It uses `onAuthStateChanged` to reactively show/hide links:

| State      | Visible links                     |
| ---------- | --------------------------------- |
| Logged out | Community, Info, Sign Up          |
| Logged in  | Community, Info, Profile, Log Out |

Log Out calls `signOut(auth)` and redirects to `/`.

---

## Firebase Setup

### Project

- **Project ID:** `vscn-39508`
- **Auth domain:** `vscn-39508.firebaseapp.com`
- **Storage bucket:** `vscn-39508.firebasestorage.app`

### Services enabled

- Authentication (Email/Password)
- Firestore
- Storage
- Analytics

### Environment variables

Stored in `.env` (never committed). All prefixed with `PUBLIC_` so Astro exposes them to the browser bundle.

```
PUBLIC_FIREBASE_API_KEY
PUBLIC_FIREBASE_AUTH_DOMAIN
PUBLIC_FIREBASE_PROJECT_ID
PUBLIC_FIREBASE_STORAGE_BUCKET
PUBLIC_FIREBASE_MESSAGING_SENDER_ID
PUBLIC_FIREBASE_APP_ID
PUBLIC_FIREBASE_MEASUREMENT_ID
```

See [.env.example](../.env.example) for the template.

---

## Firebase Rules

### Firestore

Go to: **Firebase Console → Firestore → Rules**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null
                            && request.auth.uid == resource.data.authorId;
    }

    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Storage

Go to: **Firebase Console → Storage → Rules**

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{fileName} {
      allow read: if true;
      allow write: if request.auth != null
                   && fileName.matches(request.auth.uid + '.*');
    }
  }
}
```

**Key point:** Firebase Storage rules do NOT support dot-separated wildcards like `{uid}.{ext}`. Match on `{fileName}` and validate ownership with `.matches()` instead.

---

## CORS (Firebase Storage)

Firebase Storage blocks browser uploads by default. CORS must be configured once per bucket using the Google Cloud CLI.

The config file is at [cors.json](../cors.json). It allows requests from `localhost:4321` (dev) and the Firebase Hosting URLs.

**Apply CORS** (run once, or again if you add a new domain):

```powershell
gcloud auth login
gcloud config set project vscn-39508
gcloud storage buckets update gs://vscn-39508.firebasestorage.app --cors-file=cors.json
```

> `gsutil` is deprecated — use `gcloud storage` instead.

---

## Firebase SDK (`src/lib/firebase.ts`)

[src/lib/firebase.ts](../src/lib/firebase.ts)

Central init file. Avoids double-initialization on Astro hot reloads using `getApps().length === 0` guard.

Exports:

- `auth` — Firebase Auth instance
- `db` — Firestore instance
- `storage` — Firebase Storage instance
- `analytics` — lazy, browser-only (SSR safe)

---

## Running Locally

```bash
npm run dev        # starts dev server at http://localhost:4321
npm run build      # production build
npm run preview    # preview the production build locally
```

---

## Known Issues / Gotchas

- **Astro `<script type="module">`** bypasses Vite processing — bare imports like `firebase/auth` will break in the browser. Always use plain `<script>` tags so Astro/Vite bundles them correctly.
- **Storage CORS** must be manually configured via `gcloud` CLI. It is not configurable in the Firebase Console UI.
- **Firebase Storage rules** do not support `{userId}.{ext}` style wildcards with dots. Use `{fileName}` + `.matches()`.
- **Firestore** started in locked/test mode — rules must be explicitly published before any reads/writes will work.
- When adding a **new allowed origin** to CORS (e.g. your production domain), update `cors.json` and re-run the `gcloud storage buckets update` command.
