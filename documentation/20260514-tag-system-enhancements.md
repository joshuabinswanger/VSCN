# Documentation: Tag System Enhancements (May 2026)

This document outlines the changes made to the tag management system, including database schema updates, UI refactoring, and security rule modifications.

## Overview

The tag system was enhanced to support dynamic categorization and administrative control over tag visibility. The hardcoded curated lists in the frontend were replaced with a database-driven approach.

## 1. Database Schema Updates

The `tags` collection in Firestore now includes the following fields:

- **`active` (boolean)**: Controls whether a tag appears in the `TagSelector` suggestions.
- **`group` (string)**: Categorizes the tag into predefined groups. Current supported values: `"disciplines"`, `"topics"`, and `"other"`.
- **`updatedAt` (timestamp)**: Tracks when the tag was last modified.

The `TagDoc` interface in `src/lib/firestore.ts` was updated to reflect these changes.

## 2. Security Rules (`firestore.rules`)

The security rules were updated to:
- Allow `update` operations on the `tags` collection for authenticated and email-verified users.
- Add validation for the new `active`, `group`, and `updatedAt` fields within the `validTag` function.

## 3. UI Refactor (`TagSelector.astro`)

The `TagSelector` component was significantly refactored:
- **Dynamic Suggestions**: It now fetches all active tags from Firestore and groups them dynamically based on their `group` field.
- **Removed Hardcoding**: The `CURATED_TAG_GROUPS` constant was removed in favor of the database-driven approach.
- **Group Support**: The component renders groups for "Disciplines", "Topics", and "Other".
- **Auto-complete**: The auto-complete logic now works with the full set of tags retrieved from the registry.

## 4. Utility Functions (`src/lib/firestore.ts`)

New functions were added to support management:
- `getTags()`: Now filters for `active !== false`.
- `updateTagStatus(slug, active)`: Toggles the active status of a tag.
- `updateTagGroup(slug, group)`: Updates the group categorization for a tag.

## 5. Seed Script (`scripts/seed-tags.mjs`)

The seed script was updated to:
- Include the `active: true` flag for all tags.
- Assign each tag to either the `"disciplines"` or `"topics"` group based on its label.

## Deployment Notes

- **Security Rules**: Deployed using `firebase deploy --only firestore:rules`.
- **Hosting**: Deployed after running `npm run build`.
- **Data Migration**: Existing tags were updated by running the `seed-tags.mjs` script.
