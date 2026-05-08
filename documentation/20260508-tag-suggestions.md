# Tag Suggestions and Profile Tag Picker

> Last updated: 2026-05-08

## Summary

The profile tag system was expanded from a small general-purpose seed list into a larger vocabulary for visual science work. The profile form now lets members reveal tag suggestions under the Tags field and add them by clicking suggestion chips.

## Seed Tags

Updated:

- `scripts/seed-tags.mjs`

The seed list now includes:

- Core practices: illustration, animation, data visualization, science communication, journalism, design, writing, research, education, consulting.
- Design and communication areas: exhibition design, information design, editorial design, user experience, design research.
- Illustration formats: scientific illustration, medical illustration, dental illustration, botanical illustration, zoological illustration, archaeological illustration, technical illustration, infographics, visual abstracts, graphical abstracts, explainer graphics, process diagrams, anatomical diagrams, surgical illustration, patient education, museum graphics, maps, cartography, icons, storyboards, motion graphics.
- Subject fields: natural sciences, life sciences, biology, botany, zoology, ecology, evolution, microbiology, neuroscience, human anatomy, medicine, dentistry, public health, veterinary medicine, archaeology, anthropology, paleontology, geology, earth sciences, environmental science, climate science, physics, chemistry, astronomy, engineering, architecture.

The script was run after the update, and the tags were seeded successfully to Firestore.

## Profile Form UI

Updated:

- `src/components/ProfileForm.astro`

The Tags field keeps the text input and native datalist autocomplete, but now also includes a revealable suggestion panel:

- The panel is hidden by default.
- A `Show tag suggestions` button reveals the available seeded tags.
- The button updates `aria-expanded` and toggles to `Hide tag suggestions` when open.
- Suggestion chips exclude tags that are already selected.
- Clicking a suggestion adds it through the existing `getOrCreateTag` flow.
- Removing a selected tag makes it available in the suggestion panel again.

## Layout

Suggestion chips are displayed as a grid:

- Desktop: 3 columns.
- Mobile: 2 columns.

The mobile choice keeps longer scientific labels readable while still making the list compact.

## Verification

Checks run after the UI update:

- `npx astro check`
- `npm run build`

The first build attempt hit sandbox-limited Firebase access while fetching community members at build time. The build was rerun with Firebase access approved and completed successfully with 7 pages built.
