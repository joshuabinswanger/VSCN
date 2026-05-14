# Documentation: Dynamic 'Open To' Registry (May 2026)

This document outlines the transition of the "Open To" (I'm here to...) selection system from a hardcoded list to a dynamic, database-driven registry.

## Overview

The "Open To" system was refactored to allow for code-free updates to the available options. This ensures consistency across the Onboarding and Profile pages and supports easy localization.

## 1. Database Schema Updates

### `openTo` Collection
A new collection was created to store the available options:
- **`id` (document ID)**: A unique identifier for the option (e.g., `"offering"`).
- **`label_en` (string)**: The English label (e.g., `"Offer services"`).
- **`label_de` (string)**: The German label (e.g., `"Dienste anbieten"`).
- **`active` (boolean)**: Controls visibility in the UI.
- **`order` (number)**: Determines the display order of the buttons.

### User Profile (`users` and `publicProfiles` collections)
The `openTo` field in the user profile remains a list of strings (`string[]`). These strings correspond to either the `id` of a preset option or a custom string entered by the user.

## 2. Security Rules (`firestore.rules`)

The security rules were updated to:
- Allow public read access to the `openTo` collection.
- Generalize the `openTo` validation in `validPublicFields`. It now allows any list of strings (up to 5 items), removing the hardcoded check for specific keys.

## 3. UI Refactor (`OpenToSelector.astro`)

The `OpenToSelector` component was updated to:
- **Fetch Dynamic Options**: On initialization, it calls `getOpenToOptions()` to retrieve the registry from Firestore.
- **Dynamic Rendering**: Buttons are rendered based on the fetched data and the current page language (`data-lang` attribute).
- **State Management**: It handles both preset IDs and custom strings, maintaining the "selected" state across page reloads via the user profile.

## 4. Utility Functions (`src/lib/firestore.ts`)

- **`OpenToDoc` interface**: Defined the structure for the registry documents.
- **`getOpenToOptions()`**: Fetches and sorts the active options from the `openTo` collection.

## 5. Seed Script (`scripts/seed-open-to.mjs`)

A new seed script was created to initialize the registry. It populates the database with the initial three options:
- `offering`
- `seeking`
- `networking`

## Deployment Notes

- **Security Rules**: Deployed using `firebase deploy --only firestore:rules`.
- **Hosting**: Deployed after running `npm run build`.
- **Data Initialization**: The registry was populated by running `node scripts/seed-open-to.mjs`.
