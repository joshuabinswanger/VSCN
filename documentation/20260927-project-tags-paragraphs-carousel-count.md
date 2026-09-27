# Project tags, project paragraphs, the carousel count (2026-09-27)

Three requests from Josh on the same day, shipped together because they meet in
the same two files (`MemberProject.astro`, `profile.css`).

## 1. Project tags ("add project tags")

- **Stored** as `projects/{id}.tags`: a list of registry labels, at most 7, each
  1–50 characters. `validProject()` lists `tags` in its `hasOnly` and reuses
  `validImageTags()`, so a project can say no more about itself than one of its
  pictures can. **Budget:** `validProject` runs once per project document, never
  inside `validGallery`, so the seven unrolled checks do not come out of the
  profile save's allowance (`documentation/20260903-gallery-rules-budget.md`).
- **Threaded through:** `projectFields()` / `toProfileProject()` (trim, drop
  empties and case-insensitive repeats, cap), `EDITABLE` in `projectStore.ts`
  (the rules test runs `saveProjects()` against the emulator with a tags
  fixture), the exporter's `projectKeys` allowlist, the editor's project block
  (the work row's `<tag-selector>` fold, cloned per block), the preview, and
  `MemberProject.astro`.
- **Drawn** as the profile's own tags: bare `.tagchip` links. They go to the
  **Grid** (`communityWorkTagHref`), not the spread, because of the next point.
- **They feed the Community Grid** (Josh's pick): `inheritedTags()` gives each
  work its own tags plus its project's, the way `inheritedSiteLink()` gives it
  the project's link. The wall's tiles, the dropdown and `worksByTag` all read
  the work's `tags`, so a project-only tag shows up in the dropdown and finds
  every work in the project. The spread still filters by member tags.
- **No functions change.** The rebuild fingerprint hashes whole project
  documents, so a tags-only edit already queues a publish.

## 2. Paragraphs in a project description

`.mprof__project-desc` was the one description renderer without
`white-space: pre-line`. A work's description (`.mprof__desc`), the bio and the
lightbox already had it. The text is still set as text (Astro escapes it, the
preview uses `textContent`), so `<b>` prints as `<b>`. Community cards do not
show project descriptions, and the lightbox shows only the project's title.

## 3. The carousel's count

The gallery card's tiny dots (PR #121) did not say "there are more". Three
mockups were built on the real member page (a count on the picture; a count
beside the dots with chevrons always out; a ‹ n / total › pager). Josh picked
the first:

- `"2 / 7"` in a small paper tag on the current picture's top right corner
  (placed by the measured `--frame-r`), filled by `projectCarousel.ts`. It
  replaces the dots. A project with one work has no carousel, so no count.
- On a touch screen (`hover: none`) the edge chevrons are out from the start.
  On desktop they still come out on hover or focus.

## Prod release

Rules before Hosting, as always. The merge workflow deploys them ahead of
Hosting, so nothing is by hand. **No functions** need deploying for this
change.
