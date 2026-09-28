# Profile editor revamp: fewer i's, no dragging, an honest preview (2026-09-25)

Josh's feedback on `/profile`, four items. This note records what changed and
why, and the parts of `20260923-projects-design.md` it supersedes.

## 1. Info tips: six kept

"Review where you actually need to place 'i'; in profile they are all kind of
unnecessary." Each note was checked against one question: does it tell a member
something they could not work out from the label, the control or the preview?

Kept:

| Field | Why it stays |
| --- | --- |
| Gallery (cover note) | The first image sets the card's shape in the directory. Nothing else says the order does anything. |
| About you, EN and DE panes | The 35-word cap is enforced at Save, for both languages. Without the note, the first time a member hears of it is a refused save. |
| Caption | The caption is also the image's alt text. That changes what a member should write. |
| Project website | Images without their own link inherit this one. Invisible otherwise. |
| Phone | It is private: never on the community page, used only for the chat group. A member deciding whether to share a number needs to know that. |
| Your language | One setting governs both the site and the emails, and the EN/DE switch changes it too. |

Removed: member type, role (EN and DE), languages, portfolio, social, visual
needs, tags, projects, video link, description, the German caption and
description, both per-image links, Active and "I'd like to help". Each one
repeated its label, explained a fallback anyone would assume (the German
twins), or stated a cap the control already enforces with its own message
(tags). Visual needs keeps its 8-item cap without a note. The chips simply stop
adding, which is rare enough at 8 to leave.

The signup wizard is untouched. `MemberTypeSelector` and `VisualNeedsSelector`
take `note={false}` instead of `tip`, and `BilingualField`'s `noteDe` became
optional. The wizard passes neither, so its notes stay written out.

## 2. Works and projects: arrows and a dropdown, not dragging

This supersedes the drag-to-arrange half of the projects design (PR #82 and the
drag fix in PR #83). "A gallery this small doesn't need it."

- SortableJS is gone: the dependency, the grip column, the three
  `sortable-*` states and the pointer-geometry code (`placeImageOverBlock`,
  `pointerY`). The ⋯ menu that was dragging's keyboard fallback went too.
- **↑/↓ are back** on every work row and every project header. They reuse the
  pure moves in `src/lib/projectEditor.ts` unchanged: `moveImage` keeps a row
  inside its container, `moveProject` moves a whole block. At an edge the
  arrow is disabled, not hidden, so the row does not jump.
- **The project is a native `<select>`** in each row, "None" for a loose work.
  Choosing a project calls `moveToProject`, which puts the work at the end of
  that block. Choosing None calls `removeFromProject`, which lands it directly
  below the block. The written shape is unchanged: `projectId` on the gallery
  item, stored at Save. So `firestore.rules` needs nothing. The select is
  hidden while the member has no projects, because a dropdown with one option
  offers no choice.
- **Add images / Add video / Add project** share one row at equal size. The two
  kinds of work wear the same solid outline. The project, which is a container
  rather than a work, gets a dashed outline and a +. "Add video" now opens the
  link field instead of the field standing open under the drop zone.
- Dropping *files* onto the gallery still uploads them. That is uploading, not
  arranging.

## 3. "Your language" sits directly after Phone

## 4. The Preview tab renders at the real sizes

Two invented containers, one for each preview:

- **The page.** `.profile-form` is a 560px column, and the preview lived inside
  it. The real `/members/<slug>` sits straight in `<main>` at 870px, so the
  preview drew the whole page at two-thirds of its width. On the Preview tab
  the form now drops its cap (`.profile-form.is-previewing`). The tabs and
  banners keep the column's width and centre, so the tab row does not move.
- **The card.** `.ccard--preview` was capped at a flat 22rem (286px at 1280).
  The real card is as wide as its slot. The preview now states the spread's
  slot: 9 of 24 columns (`CommunityGrid`'s `--cgrid-col` arithmetic) and 26
  rows of 1.5rem, the middle of what the table deals. After that, the card's
  own width formula runs exactly as it does on `/community`. Mobile keeps the
  full-width rule from 2026-09-08.

Measured edge to edge, same viewport, real page vs preview:

| Viewport | Real | Preview |
| --- | --- | --- |
| 1280, page `.mprof` | x 205, 870 wide | x 205, 870 wide |
| 1280, card (square art, 26-row slot) | 429 wide | 429 wide |
| 390, page | x 15, 360 wide | x 15, 360 wide |
| 390, card | x 15, 360 wide | x 15, 360 wide |
