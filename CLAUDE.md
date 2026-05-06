# VSCN — Codebase Notes

## Stack

- **Framework:** Astro (static site, no SSR)
- **Hosting:** Firebase Hosting (deployed via GitHub Actions on push to `main`)
- **Auth:** Firebase Authentication (email/password, email verification required)
- **Database:** Firestore (two collections: `users`, `publicProfiles`)
- **Storage:** Firebase Storage (user avatars)
- **App Check:** reCAPTCHA v3

## Firestore data model

### `users/{uid}` — private

Full user record. Only readable by the owner. Contains sensitive fields.

| Field         | Type       | Notes                              |
|---------------|------------|------------------------------------|
| `displayName` | string     | ≤ 100 chars                        |
| `photoURL`    | string     | Firebase Storage URL or empty      |
| `role`        | string     | ≤ 100 chars                        |
| `bio`         | string     | ≤ 35 words, ≤ 500 chars            |
| `portfolio`   | string     | URL, ≤ 200 chars                   |
| `socialMedia` | string     | URL, ≤ 200 chars                   |
| `openTo`      | string[]   | subset of `["offering","seeking","networking"]` |
| `phone`       | string     | ≤ 40 chars — never published       |
| `email`       | string     | must match auth token email        |
| `createdAt`   | timestamp  | optional                           |
| `updatedAt`   | timestamp  | optional                           |

### `publicProfiles/{uid}` — public read

Subset of `users`, written by `toPublicProfile()` in `src/lib/firestore.ts`. Never contains `phone` or `email`. Used by the community page at build time via `getMembers()`.

Fields: `displayName`, `photoURL`, `role`, `bio`, `portfolio`, `socialMedia`, `openTo`, `createdAt`, `updatedAt`.

## Firestore security rules

Rules live in `firestore.rules` and must be deployed manually after changes:

```
npx firebase-tools@latest deploy --only firestore:rules
```

Key functions:
- `validPublicProfile(data)` — validates `publicProfiles` writes; enforces the allowed key list
- `validPrivateUser(data, auth)` — validates `users` writes; same key list + phone/email
- `validPublicFields(data)` — shared field-level validation (lengths, URL patterns, word counts)

**When adding a new field to `UserDoc`, you must:**
1. Add it to `UserDoc` interface in `src/lib/firestore.ts`
2. Add it to `toPublicProfile()` if it should appear on community cards
3. Add the key to `allowedKeys` in both `validPublicProfile` and `validPrivateUser` in `firestore.rules`
4. Add field validation inside `validPublicFields`
5. Deploy the updated rules

## Community page rebuild

The community page (`/community`) is statically built — it reads `publicProfiles` from Firestore at build time. After a user saves their profile, the client triggers a GitHub Actions `workflow_dispatch` to rebuild and redeploy the site.

The trigger is in `ProfileForm.astro` and uses three `PUBLIC_` env vars baked into the client bundle at build time:

| Env var                      | Purpose                          |
|------------------------------|----------------------------------|
| `PUBLIC_GITHUB_REBUILD_TOKEN` | Fine-grained PAT — needs **Actions: Write** permission on the repo |
| `PUBLIC_GITHUB_OWNER`        | GitHub username / org            |
| `PUBLIC_GITHUB_REPO`         | Repo name                        |

The dispatch targets `.github/workflows/firebase-hosting-merge.yml`. If the trigger fails, the error is logged to the browser console (`console.error`).

**Common reasons the rebuild doesn't fire:**
- The PAT has expired or lacks `Actions: Write` scope
- The env vars weren't present when the site was last built (they're baked in at build time, not read at runtime)
- The workflow file was renamed

## Profile form fields

All fields live in `src/components/ProfileForm.astro`.

| Field        | ID             | Saved to Firestore | Public |
|--------------|----------------|--------------------|--------|
| Display name | `name`         | `displayName`      | yes    |
| Role         | `role`         | `role`             | yes    |
| About you    | `bio`          | `bio`              | yes    |
| Portfolio    | `portfolio`    | `portfolio`        | yes    |
| Social media | `social-media` | `socialMedia`      | yes    |
| I'm here to… | `open-to` (checkboxes) | `openTo` | yes  |
| Phone        | `phone`        | `phone`            | no     |
