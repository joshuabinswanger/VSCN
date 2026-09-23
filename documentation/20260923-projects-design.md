# Projects — design

**2026-09-23.** Design spec, approved section by section in conversation with Josh before
implementation. Two pull requests: **(1)** the ⓘ info tips on `/profile`, small and
independent, first; **(2)** projects, one PR because the feature is only useful whole.

Projects existed once and were withdrawn on 2026-09-01 (`95b43d2`). That version stored them
as an array on the profile document, the shape `documentation/20260903-gallery-rules-budget.md`
later showed to be expensive. Since then the gallery moved onto `images/{imageId}` records
(`documentation/20260907-works-on-the-record-design.md`); projects now follow the same pattern.

## Decisions taken (Josh, 2026-09-23)

- A project is an **optional grouping**, not the unit of the gallery. Every image still shows
  in the gallery; an image without a project behaves exactly as today.
- A project may hold **one image or many**. All of its fields are **optional**: title,
  description, link, affiliations.
- **Affiliations** are a repeatable list, like Social Media. Each entry is either a **name
  with an optional link** or a **VSCN member**.
- Crediting a member needs **no approval** — it is a credit, like a co-author line. An admin
  removes one on request.
- **Images inherit the project link.** A link set on the image itself takes precedence.
- In the editor a project **encapsulates its images**: the gallery stays one linear list and a
  project is a framed block inside it with its image rows nested.
- Moving is by **dragging**.
- The signup wizard keeps its hints **written out**; ⓘ tips are `/profile` only.
- **Not now:** a community "collapse images to projects" filter or a Projects section.

## PR 1 — ⓘ info tips on `/profile`

- One `InfoTip` component: a small ⓘ button beside the field label that toggles the hint
  open on **click/tap** (hover is not a phone gesture). The hint keeps its
  `aria-describedby` link to the field so screen readers still announce it.
- Every **static** `field-note` in `ProfileForm.astro` moves behind a tip, as do the notes in
  `BilingualField.astro`, `MemberTypeSelector.astro` and `VisualNeedsSelector.astro` **when
  rendered inside `/profile`**. Those components are shared with the wizard, so the tip is a
  prop, defaulting to the written-out note.
- **Dynamic** notes stay visible: `#gallery-status`, `#social-status`,
  `#gallery-note-unverified`, `#gallery-nudge`, and any note whose text the script sets
  (`.gallery-caption-de-note`, `.gallery-desc-de-note`, `#receive-community-emails-note`).
  They report state the member needs now.
- `OnboardingForm.astro` is untouched.

## PR 2 — projects

### Data model

```jsonc
// projects/{projectId}      projectId: client-generated uuid
{
  "ownerUid": "{uid}",                 // set at create, immutable
  "title": "…", "titleDe": "…",        // optional, ≤ 100 each
  "description": "…", "descriptionDe": "…", // optional, ≤ 600 each
  "link": "lab.example.org/ribosome",  // optional, ≤ 200, stored without scheme
  "affiliations": [                    // optional, ≤ 10 entries
    { "name": "ETH Zürich", "url": "ethz.ch" },   // name ≤ 100, url optional ≤ 200
    { "memberUid": "{uid}", "name": "Anna Meier" } // name is a snapshot for fallback
  ],
  "createdAt": timestamp, "updatedAt": timestamp
}

// images/{imageId} — one new optional field
{ "projectId": "{projectId}" }         // an image is in at most one project
```

- **No second ordering.** The profile's `gallery` array stays the one order. The editor keeps
  a project's images **contiguous** in it; a project's position is its first image's.
  Readers normalise defensively: if stored ids are not contiguous, a project renders at its
  first image's position with all its images gathered there.
- **Link inheritance fills the `siteLink` slot** (the piece on the member's own site), not
  `link` (where it was published). Displayed site link = image `siteLink` ‖ project `link` ‖
  none. One pure helper, used by the member page, the lightbox and `src/lib/seo.ts`.
- **Ownership is judged on read, not in rules.** An image's `projectId` pointing at someone
  else's project is ignored by the join, the same way `galleryRecords.ts` ignores foreign
  images. This keeps a `get()` out of every image write.
- **A member credit** renders as a link to `/members/<slug>` only while that member is public;
  otherwise the stored `name` shows as plain text.
- **Untitled** projects still group their images; they get no heading and no "Part of …" line.
  A project with no images is not rendered.

### Rules (`firestore.rules`)

- `match /projects/{projectId}`: owner-only `create`/`update`/`delete`
  (`accountWritable(uid)` like images); `ownerUid` and `createdAt` immutable on update;
  `read` for the owner and admins. The build reads with the Admin SDK.
- `validProject(data)`: `hasOnly` over the fields above, length caps, and each
  `affiliations` element checked by a per-index unroll up to 10 (`validAffiliation`: exactly
  one of the two shapes). One document per write, so the budget is comfortable.
- `validImage`: `projectId` joins the `hasOnly` list (string, ≤ 64, same pattern as
  `validGalleryId`), and the update rule's `affectedKeys().hasOnly([...])` gains it.
  **This is the hasOnly trap** (`firestore-rules-hasonly-gotcha`): rules must be live before
  a client that writes `projectId`.

### Functions

- **Account deletion** (`functions/src/purge.ts` / `lifecycle.ts`) deletes the member's
  `projects` alongside their images. Deletion is immediate on both environments.
- **Replace a work's image** (`authorizeImageUpload` with `replaces`) copies `projectId` onto
  the new record together with the text fields, or a replaced picture would leave its project.
- **No sweeper for empty projects.** Removal commits without Save, so a project can be empty
  for a while; the build skips it and the editor's next Save deletes it.

### Editor (`/profile`, Gallery tab)

```
┌ Gallery ─────────────────────────────────────┐
│ ⠿ image row  (no project)                    │
│ ┏ ⠿ PROJECT: Cryo-EM of the ribosome     ⋯ ┓ │
│ ┃  Title · Description · Link  ⓘ            ┃ │
│ ┃  Affiliations  [ETH Zürich ↗] [@Anna M.] + ┃ │
│ ┃  ⠿ image row                          ⋯   ┃ │
│ ┃  ⠿ image row                          ⋯   ┃ │
│ ┃  [+ Add images to this project]            ┃ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│ ⠿ image row  (no project)                    │
│ [+ New project]   [drop zone / Add images]   │
└──────────────────────────────────────────────┘
```

- **Project block:** Title and Description through `BilingualField` (EN/DE), Link, and
  Affiliations as repeatable rows like Social Media (+ Add / ✕). Each affiliation row has a
  Name | Member switch: Name = name + optional link; Member = type-ahead over
  `publicProfiles` storing `memberUid` + `name`.
- **Dragging** with **SortableJS** (new dependency; touch-capable, nested lists, cross-list
  moves). A grip handle ⠿ on every image row and project header, so inputs inside rows keep
  working. Image rows drag between the loose list and any project frame, or within one.
  A project header drags the whole block; a project cannot be dropped into a project. On
  touch a drag starts after a short press on the handle, so scrolling never picks one up.
- **Keyboard / screen-reader fallback** in each row's ⋯ menu: *Move up*, *Move down*,
  *Move to project → …*, *Remove from project* (lands directly below the block). The visible
  ▲▼ buttons go; the existing focus-restoration after a move is kept for the menu actions.
- **+ Add images to this project** uploads straight into that block; the general drop zone
  adds loose images at the end. **+ New project** adds an empty block at the end.
  **Delete project** (⋯ on the header) ungroups; images stay.
- **Saving.** Project fields follow Save, like captions. Upload and removal keep committing
  immediately. Save writes, in order: (1) project documents, (2) image records with
  `projectId` through `saveGalleryRecords`, (3) the profile's `gallery` order, (4) deletes
  projects left without images. A refused project write is a Save error naming the project,
  never a console warning.
- **Preview tab** renders the real member page with its grouping.
- The 8-image cap is unchanged.

### Display

- **Member page** mirrors the editor's linear order: a project block is a heading (title,
  ↗ link) with description and affiliations, then its images; loose images between blocks.
- **Lightbox** still pages the member's whole gallery. The caption area gains
  **"Part of *Project title*"** (linked when the project has a link) and the affiliations; the
  site link shows the inherited project link when the image has none.
- **Community** (Gallery, Grid, Index): tiles and cards unchanged; lightbox and card captions
  gain the "Part of" line.
- **Structured data** (`src/lib/seo.ts`): a project is a `CreativeWork` with `hasPart` its
  images; each image's `isPartOf` gains the project beside its publication. Affiliations map
  to `Organization` (with `url`) or `Person` (the member's profile `@id`, trailing-slash
  canonical).
- **Build:** `membersBuild` reads live projects once beside the gallery records; the pure join
  attaches projects to members, skipping foreign and empty ones. A project save already
  queues a rebuild through the profile-save path.

### Admin and scripts

- The admin console shows a member's projects (it shows every field a member holds).
- `scripts/check-integrity.mjs` reports projects whose owner is gone and images whose
  `projectId` names a missing or foreign project.

### Release order

- **Dev:** functions deployed by hand before the merge; merging runs CI, which deploys rules
  ahead of Hosting.
- **Prod:** rules and functions first, then the site. Josh runs the prod steps; they are
  classifier-blocked for an agent.

### Testing

- **Rules:** every valid project shape; each affiliation shape and a mixed/invalid one;
  11 affiliations refused; another member cannot create/update/delete my project; `ownerUid`
  immutable; `projectId` accepted on an image and an unknown image field still refused.
- **Unit:** contiguity normaliser; link inheritance; the join skipping foreign and empty
  projects; member credit renders as link vs plain name.
- **Functions:** `tsc`; deletion removes projects; replacement carries `projectId`.
- **Browser on dev:** build a project, drag in/out/within, drag a block, Save, reload; phone
  width. **Josh's iPhone pass** for real touch dragging.

## Out of scope

Community "collapse to projects" filter or Projects section; notifying credited members or
letting them remove themselves; raising the 8-image cap.
