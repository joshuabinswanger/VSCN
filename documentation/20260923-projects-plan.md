# Projects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members group gallery images into optional projects (title, description, link, affiliations — all optional), shown as framed blocks in the editor's linear gallery, moved by dragging, and rendered together on the member page with a "Part of …" line in every lightbox.

**Architecture:** A new owner-only `projects/{projectId}` collection plus one optional `projectId` on `images/{imageId}`. The profile's `gallery` id array stays the single order; readers gather a project's images at its first image (`contiguousOrder`). All grouping, link-inheritance, localisation and affiliation logic lives in ONE pure module, `src/lib/projects.ts`, shared by the build (`memberView.ts`), the member page, the editor preview, the lightbox and `seo.ts`.

**Tech Stack:** Astro 7, Firebase (Firestore rules, client SDK 12, Admin SDK in functions and the exporter), Node 25 `node --test` with native TS stripping for unit tests, the Firestore emulator for rules/functions tests, SortableJS (new) for dragging.

**Spec:** `documentation/20260923-projects-design.md` (approved 2026-09-23). Read it first; this plan argues from it.

## Global Constraints

- Branch `feat/projects`, worktree `D:\SynoDrive\VSCN\wt-feat-projects`, cut from `origin/dev` at `f3711d0`. PR targets `dev`.
- Caps (rules and client constants must agree): title/titleDe ≤ 100, description/descriptionDe ≤ 600, link ≤ 200, affiliations ≤ 10, affiliation name 1–100, affiliation url ≤ 200, memberUid 1–128, projectId / image.projectId 1–64.
- Links are stored WITHOUT scheme; rendered through `workLink()` / `href()` in `src/lib/links.ts`.
- An image is in at most one project. The gallery cap stays 8.
- Displayed site link = image `siteLink` ‖ project `link` ‖ none — one helper, `inheritedSiteLink()`.
- Titles and descriptions fall back BOTH ways (German page shows English when German is empty and vice versa), like `profileRole()`/`profileBio()`.
- A member credit links to the member only while that member is in the built directory; otherwise the stored `name` shows as plain text.
- **hasOnly trap:** rules that know `projectId` and `projects` must be live before any client writes them. Rules ship with the dev merge (CI deploys rules before Hosting); functions are deployed by hand BEFORE the merge.
- Gates: `npm run lint` 0; `npx astro check` ≤ 25 errors (pre-existing baseline), none in touched lines; `npm run test:unit` all pass; `npm run test:rules` all pass (needs port 8080 free; it builds functions first); `cd functions && npx tsc --noEmit` 0 (run `cd functions && npm install` once in a fresh worktree).
- Comment style: this codebase explains WHY in dated block comments above non-obvious code (see `galleryRecords.ts`). New modules get a header comment in that style; do not narrate the obvious.
- If an instruction here turns out wrong against the real code, measure and say so rather than comply; if a gate cannot be run, report that rather than substituting a weaker check.

## File structure

| File | Responsibility |
|---|---|
| `firestore.rules` | `projects` match block, `validProject`, `validAffiliations`, `validAffiliation`; `projectId` on images |
| `tests/rules/firestore.test.mjs` | rules tests for the above |
| `src/lib/projects.ts` (new) | PURE: types, caps, `toProfileProject`, `ownProjects`, `contiguousOrder`, `groupWorks`, `inheritedSiteLink`, `projectTitle`, `projectDescription`, `resolveMemberCredits`, `affiliationHref`, `projectSlideData`, `projectFields`, `editorBlocks`, `emptyProjectIds` |
| `tests/unit/projects.test.mjs` (new) | unit tests for `projects.ts` |
| `src/lib/galleryRecords.ts`, `src/lib/gallery.ts`, `src/lib/images.ts` | `projectId` through the join, the item and the record write |
| `src/lib/galleryQueue.ts` | an upload may target a project |
| `src/lib/projectStore.ts` (new) | client Firestore I/O for projects (load, save, delete, member lookups) |
| `functions/src/types.ts`, `uploads.ts`, `purge.ts`, `adminOps.ts` | `projectId` on ImageDoc; replacement carries it; purge deletes projects; admin graph lists them |
| `src/lib/adminApi.ts`, `src/lib/admin/memberDetail.ts` | admin console Projects section |
| `scripts/export-site-data.mjs`, `src/lib/membersBuild.ts`, `src/lib/memberView.ts`, `src/lib/profileView.ts` | projects into the snapshot and the view model |
| `src/pages/[...lang]/members/[slug].astro`, `src/styles/profile.css`, `src/components/ProfileViewPreview.astro`, `src/lib/profilePreview.ts` | member page + preview render project blocks |
| `src/lib/lightboxText.ts`, `src/components/CommunityGrid.astro`, `src/components/community/CommunityImageCard.astro`, `src/components/community/CommunityWorkCard.astro` | "Part of" line in the lightbox |
| `src/lib/seo.ts`, `tests/unit/seo.test.mjs` | project nodes in the member page's JSON-LD |
| `src/components/ProfileForm.astro`, `package.json` | the editor: project blocks, dragging, ⋯ menu, Save order |
| `src/i18n/translations.ts` | every new string, en + de |
| `scripts/check-integrity.mjs` | project integrity checks |

---

### Task 1: Rules for projects and `images.projectId`

**Files:**
- Modify: `firestore.rules` — images `allow update` affectedKeys list (~line 135-137); `validImage` hasOnly list and a new clause (~385-431); new `match /projects/{projectId}` inside `match /databases/...` right after the `images` block (~line 141); new top-level functions after `validImageTag` (~line 448)
- Modify: `tests/rules/firestore.test.mjs` — change the key in the existing test "images: an unlisted key is rejected (hasOnly)" (~258) and append new tests at the end

**Interfaces:**
- Produces: the stored shapes every later task writes — `projects/{id}` = `{ownerUid, title?, titleDe?, description?, descriptionDe?, link?, affiliations?: ({name, url?} | {memberUid, name})[], createdAt, updatedAt}`; `images/{id}.projectId?: string`.

- [ ] **Step 1: Write the failing tests**

In `tests/rules/firestore.test.mjs`, the existing test at ~258 uses `projectId` as its "unlisted key" — it will soon be listed. Change that one line to use a key that stays unlisted:
```js
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1", { notAField: "p" })));
```
Append at the end of the file:
```js
// ── PROJECTS (2026-09-23, documentation/20260923-projects-design.md) ─────────
function projectDoc(uid, overrides = {}) {
  return { ownerUid: uid, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

test("projects: the owner creates, edits and deletes their own; all fields optional", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("projects/p1").set(projectDoc(OWNER)));
  await assertSucceeds(db.doc("projects/p1").update({
    title: "Cryo-EM of the ribosome", titleDe: "Kryo-EM des Ribosoms",
    description: "x".repeat(600), descriptionDe: "y".repeat(600),
    link: "lab.example.org/ribosome",
    affiliations: [{ name: "ETH Zürich", url: "ethz.ch" }, { name: "Lab" }, { memberUid: OTHER, name: "Anna Meier" }],
    updatedAt: new Date(),
  }));
  await assertSucceeds(db.doc("projects/p1").get());
  await assertSucceeds(db.collection("projects").where("ownerUid", "==", OWNER).get());
  await assertSucceeds(db.doc("projects/p1").delete());
});

test("projects: caps hold — title, description, link, affiliation count and each entry", async () => {
  await seed(env, "projects/p1", projectDoc(OWNER));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  const up = (fields) => db.doc("projects/p1").update({ ...fields, updatedAt: new Date() });
  await assertFails(up({ title: "x".repeat(101) }));
  await assertFails(up({ titleDe: "x".repeat(101) }));
  await assertFails(up({ description: "x".repeat(601) }));
  await assertFails(up({ descriptionDe: "x".repeat(601) }));
  await assertFails(up({ link: "x".repeat(201) }));
  await assertSucceeds(up({ affiliations: Array.from({ length: 10 }, (_, i) => ({ name: `Org ${i}` })) }));
  await assertFails(up({ affiliations: Array.from({ length: 11 }, (_, i) => ({ name: `Org ${i}` })) }));
  await assertFails(up({ affiliations: [{ name: "" }] }));
  await assertFails(up({ affiliations: [{ name: "x".repeat(101) }] }));
  await assertFails(up({ affiliations: [{ name: "Org", url: "x".repeat(201) }] }));
  await assertFails(up({ affiliations: [{ url: "ethz.ch" }] }));
  await assertFails(up({ affiliations: [{ memberUid: OTHER, name: "Anna", url: "x.ch" }] }));
  await assertFails(up({ affiliations: [{ name: "Org", role: "partner" }] }));
  await assertFails(up({ affiliations: "ETH" }));
  await assertFails(up({ unknownField: true }));
});

test("projects: another member can neither read, create for, edit nor delete my project", async () => {
  await seed(env, "projects/p1", projectDoc(OWNER));
  const other = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(other.doc("projects/p1").get());
  await assertFails(other.doc("projects/p2").set(projectDoc(OWNER)));
  await assertFails(other.doc("projects/p1").update({ title: "mine now", updatedAt: new Date() }));
  await assertFails(other.doc("projects/p1").delete());
  await assertFails(env.unauthenticatedContext().firestore().doc("projects/p1").get());
});

test("projects: ownerUid and createdAt are immutable; admins read", async () => {
  await seed(env, "projects/p1", projectDoc(OWNER, { createdAt: new Date(1_700_000_000_000) }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("projects/p1").update({ ownerUid: OTHER, updatedAt: new Date() }));
  await assertFails(db.doc("projects/p1").update({ createdAt: new Date(), updatedAt: new Date() }));
  const admin = env.authenticatedContext(ADMIN, verified(ADMIN, { admin: true })).firestore();
  await assertSucceeds(admin.doc("projects/p1").get());
});

test("projects: a deletion tombstone blocks project writes", async () => {
  await seed(env, "projects/p1", projectDoc(OWNER));
  await seed(env, `deletions/${OWNER}`, { uid: OWNER });
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("projects/p2").set(projectDoc(OWNER)));
  await assertFails(db.doc("projects/p1").update({ title: "t", updatedAt: new Date() }));
  await assertFails(db.doc("projects/p1").delete());
});

test("images: a work names at most one project — projectId is a short string", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").update({ projectId: "3f2c9a1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b", updatedAt: new Date() }));
  await assertSucceeds(db.doc("images/img-1").update({ projectId: deleteField(), updatedAt: new Date() }));
  await assertFails(db.doc("images/img-1").update({ projectId: "x".repeat(65), updatedAt: new Date() }));
  await assertFails(db.doc("images/img-1").update({ projectId: "", updatedAt: new Date() }));
  await assertFails(db.doc("images/img-1").update({ projectId: ["p1"], updatedAt: new Date() }));
});
```
`deleteField` is already imported at the top of the file and the existing moderation tests pass it to the compat `update()` (~line 48), so the sentinel works here.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm run test:rules`
Expected: the new `projects:` tests and `images: a work names at most one project` FAIL (permission denied on the success cases); everything else passes.

- [ ] **Step 3: Implement the rules**

(a) images `allow update` — add `'projectId'` to the affectedKeys list:
```
                    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
                         'caption', 'captionDe', 'description', 'descriptionDe', 'descriptionShort',
                         'link', 'siteLink', 'tags', 'projectId', 'status', 'updatedAt'])
```
(b) `validImage` — add `'projectId'` to the hasOnly list (after `'tags'`), and a clause after the `tags` clause:
```
    // WHICH OF THE MEMBER'S PROJECTS THIS WORK BELONGS TO (2026-09-23,
    // documentation/20260923-projects-design.md). One id, so an image is in at
    // most one project. Whether the project exists and is the same member's is
    // the READER's question (ownProjects in src/lib/projects.ts), exactly as
    // for a gallery id: a get() here would cost a read on every image save.
    && (!('projectId' in data) || (data.projectId is string && data.projectId.size() > 0 && data.projectId.size() <= 64))
```
(c) the match block, right after the closing brace of `match /images/{imageId}`:
```
    match /projects/{projectId} {
      // A MEMBER'S GROUPING OF THEIR OWN WORKS (2026-09-23,
      // documentation/20260923-projects-design.md). Owner-only: the build
      // reads through the Admin SDK and nothing public reads here. The member
      // may delete — unlike an image there are no bytes behind a project for
      // a sweeper to clear.
      allow read: if isAdmin()
                  || (request.auth != null && resource.data.ownerUid == request.auth.uid);

      allow create: if request.auth != null
                    && request.resource.data.ownerUid == request.auth.uid
                    && accountWritable(request.auth.uid)
                    && projectId.size() <= 64
                    && validProject(request.resource.data);

      allow update: if request.auth != null
                    && resource.data.ownerUid == request.auth.uid
                    && accountWritable(request.auth.uid)
                    && request.resource.data.ownerUid == resource.data.ownerUid
                    && request.resource.data.createdAt == resource.data.createdAt
                    && validProject(request.resource.data);

      allow delete: if request.auth != null
                    && resource.data.ownerUid == request.auth.uid
                    && accountWritable(request.auth.uid);
    }
```
(d) top-level functions after `validImageTag`:
```
// Keep in sync with the MAX_PROJECT_* / MAX_AFFILIATION* constants in
// src/lib/projects.ts. One document per write, so the per-entry unroll below
// costs ten short checks once — not the eight-times-per-save shape
// documentation/20260903-gallery-rules-budget.md warns about.
function validProject(data) {
  return data.keys().hasOnly(['ownerUid', 'title', 'titleDe', 'description', 'descriptionDe',
                              'link', 'affiliations', 'createdAt', 'updatedAt'])
    && data.ownerUid is string
    && (!('title' in data) || (data.title is string && data.title.size() <= 100))
    && (!('titleDe' in data) || (data.titleDe is string && data.titleDe.size() <= 100))
    && (!('description' in data) || (data.description is string && data.description.size() <= 600))
    && (!('descriptionDe' in data) || (data.descriptionDe is string && data.descriptionDe.size() <= 600))
    && (!('link' in data) || (data.link is string && data.link.size() <= 200))
    && (!('affiliations' in data) || validAffiliations(data.affiliations))
    && data.createdAt is timestamp
    && data.updatedAt is timestamp;
}

function validAffiliations(value) {
  return value is list && value.size() <= 10
    && (value.size() < 1 || validAffiliation(value[0]))
    && (value.size() < 2 || validAffiliation(value[1]))
    && (value.size() < 3 || validAffiliation(value[2]))
    && (value.size() < 4 || validAffiliation(value[3]))
    && (value.size() < 5 || validAffiliation(value[4]))
    && (value.size() < 6 || validAffiliation(value[5]))
    && (value.size() < 7 || validAffiliation(value[6]))
    && (value.size() < 8 || validAffiliation(value[7]))
    && (value.size() < 9 || validAffiliation(value[8]))
    && (value.size() < 10 || validAffiliation(value[9]));
}

// EXACTLY ONE OF TWO SHAPES: a name with an optional link, or a VSCN member
// credited by uid with their name kept as the fallback text. A member credit
// carries no url — its link is the member's page, derived at build time.
function validAffiliation(a) {
  return a is map
    && a.name is string && a.name.size() > 0 && a.name.size() <= 100
    && ((a.keys().hasOnly(['name', 'url'])
          && (!('url' in a) || (a.url is string && a.url.size() <= 200)))
        || (a.keys().hasOnly(['memberUid', 'name'])
          && a.memberUid is string && a.memberUid.size() > 0 && a.memberUid.size() <= 128));
}
```
Note: `{ name }` alone satisfies the first branch; `{ memberUid, name }` the second; a missing `name` fails at `a.name is string`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run test:rules`
Expected: all rules and functions tests PASS, including the existing "a FULL gallery saves — eight maximal records" budget test.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/firestore.test.mjs
git commit -m "feat(rules): projects collection and images.projectId"
```

---

### Task 2: The pure projects module

**Files:**
- Create: `src/lib/projects.ts`
- Create: `tests/unit/projects.test.mjs`

**Interfaces:**
- Consumes: `workLink`, `memberHref` from `src/lib/links.ts`; `Lang` type from `src/i18n/utils`.
- Produces (exact names and types — later tasks import these):
```ts
export const MAX_PROJECT_TITLE = 100, MAX_PROJECT_DESCRIPTION = 600, MAX_PROJECT_LINK = 200,
  MAX_AFFILIATIONS = 10, MAX_AFFILIATION_NAME = 100, MAX_AFFILIATION_URL = 200;
export type AffiliationRecord = { name: string; url?: string } | { memberUid: string; name: string };
export interface ProjectRecord { projectId: string; ownerUid: string; title?: string; titleDe?: string;
  description?: string; descriptionDe?: string; link?: string; affiliations?: AffiliationRecord[] }
export interface ProjectAffiliation { name: string; href?: string; memberUid?: string; memberSlug?: string }
export interface ProfileProject { id: string; title?: string; titleDe?: string; description?: string;
  descriptionDe?: string; link?: string; affiliations: ProjectAffiliation[] }
export interface WorkSection<W> { project?: ProfileProject; works: W[] }
export type EditorBlock = { kind: "image"; index: number } | { kind: "project"; projectId: string; indices: number[] };
export interface ProjectFields { title?: string; titleDe?: string; description?: string; descriptionDe?: string;
  link?: string; affiliations?: AffiliationRecord[] }
export function toProfileProject(rec: ProjectRecord): ProfileProject;
export function ownProjects(uid: string, records: readonly ProjectRecord[]): ProfileProject[];
export function contiguousOrder<T>(items: readonly T[], key: (item: T) => string | undefined): T[];
export function groupWorks<W extends { projectId?: string }>(works: readonly W[], projects: readonly ProfileProject[]): WorkSection<W>[];
export function inheritedSiteLink(own: string | undefined, project: { link?: string } | undefined): string | undefined;
export function projectTitle(p: { title?: string; titleDe?: string }, lang: Lang): string | undefined;
export function projectDescription(p: { description?: string; descriptionDe?: string }, lang: Lang): string | undefined;
export function resolveMemberCredits(p: ProfileProject, slugByUid: ReadonlyMap<string, string>): ProfileProject;
export function affiliationHref(a: ProjectAffiliation, lang: string): string | undefined;
export function projectSlideData(p: ProfileProject | undefined, lang: Lang): { project?: string; projectLink?: string; affiliations?: string };
export function projectFields(p: ProjectFields): ProjectFields;
export function editorBlocks(gallery: readonly { projectId?: string }[], projects: readonly { projectId: string }[]): EditorBlock[];
export function emptyProjectIds(gallery: readonly { projectId?: string }[], projects: readonly { projectId: string }[]): string[];
```

- [ ] **Step 1: Write the failing tests**

`tests/unit/projects.test.mjs`:
```js
// The one module every surface asks about projects: the build, the member
// page, the editor preview, the lightbox and the structured data. Pure, so
// each rule is pinned here once rather than per renderer.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toProfileProject, ownProjects, contiguousOrder, groupWorks, inheritedSiteLink,
  projectTitle, projectDescription, resolveMemberCredits, affiliationHref,
  projectSlideData, projectFields, editorBlocks, emptyProjectIds,
} from "../../src/lib/projects.ts";

const UID = "owner-uid-000001";
const rec = (projectId, extra = {}) => ({ projectId, ownerUid: UID, ...extra });

test("toProfileProject trims, links through workLink, and splits the two affiliation shapes", () => {
  const p = toProfileProject(rec("p1", {
    title: "  Ribosome  ", description: "", link: "lab.example.org/r",
    affiliations: [
      { name: "ETH Zürich", url: "ethz.ch" },
      { name: "Plain Org" },
      { name: "Not a link", url: "nolink" },
      { memberUid: "anna-uid", name: "Anna Meier" },
      { name: "   " },
    ],
  }));
  assert.equal(p.id, "p1");
  assert.equal(p.title, "Ribosome");
  assert.equal("description" in p, false);
  assert.equal(p.link, "https://lab.example.org/r");
  assert.deepEqual(p.affiliations, [
    { name: "ETH Zürich", href: "https://ethz.ch" },
    { name: "Plain Org" },
    { name: "Not a link" },
    { name: "Anna Meier", memberUid: "anna-uid" },
  ]);
});

test("ownProjects ignores someone else's project", () => {
  const out = ownProjects(UID, [rec("mine"), { projectId: "theirs", ownerUid: "other" }]);
  assert.deepEqual(out.map((p) => p.id), ["mine"]);
});

test("contiguousOrder gathers each group at its first member and keeps loose items in place", () => {
  const items = ["a:p", "b", "c:q", "d:p", "e", "f:q"].map((s) => ({ id: s[0], g: s.split(":")[1] }));
  const out = contiguousOrder(items, (i) => i.g);
  assert.deepEqual(out.map((i) => i.id), ["a", "d", "b", "c", "f", "e"]);
});

test("groupWorks: loose runs, project blocks, unknown projects read as loose", () => {
  const works = [
    { id: 1 }, { id: 2, projectId: "p" }, { id: 3, projectId: "p" },
    { id: 4, projectId: "ghost" }, { id: 5 },
  ];
  const sections = groupWorks(works, [toProfileProject(rec("p", { title: "P" }))]);
  assert.deepEqual(sections.map((s) => [s.project?.id ?? null, s.works.map((w) => w.id)]), [
    [null, [1]], ["p", [2, 3]], [null, [4, 5]],
  ]);
});

test("groupWorks gathers a non-contiguous project at its first image", () => {
  const works = [{ id: 1, projectId: "p" }, { id: 2 }, { id: 3, projectId: "p" }];
  const sections = groupWorks(works, [toProfileProject(rec("p"))]);
  assert.deepEqual(sections.map((s) => [s.project?.id ?? null, s.works.map((w) => w.id)]), [
    ["p", [1, 3]], [null, [2]],
  ]);
});

test("inheritedSiteLink: the image's own link wins, else the project's, else none", () => {
  assert.equal(inheritedSiteLink("https://me.ch/w", { link: "https://lab.org" }), "https://me.ch/w");
  assert.equal(inheritedSiteLink(undefined, { link: "https://lab.org" }), "https://lab.org");
  assert.equal(inheritedSiteLink(undefined, undefined), undefined);
});

test("title and description fall back both ways", () => {
  assert.equal(projectTitle({ title: "EN" }, "de"), "EN");
  assert.equal(projectTitle({ titleDe: "DE" }, "en"), "DE");
  assert.equal(projectTitle({ title: "EN", titleDe: "DE" }, "de"), "DE");
  assert.equal(projectTitle({}, "en"), undefined);
  assert.equal(projectDescription({ description: "d" }, "de"), "d");
});

test("member credits link only while the member is in the directory", () => {
  const p = toProfileProject(rec("p", { affiliations: [{ memberUid: "anna", name: "Anna" }, { memberUid: "gone", name: "Gone" }] }));
  const resolved = resolveMemberCredits(p, new Map([["anna", "anna-meier"]]));
  assert.equal(affiliationHref(resolved.affiliations[0], "en"), "/members/anna-meier");
  assert.equal(affiliationHref(resolved.affiliations[0], "de"), "/de/members/anna-meier");
  assert.equal(affiliationHref(resolved.affiliations[1], "en"), undefined);
});

test("projectSlideData: title, link and affiliations for a lightbox trigger", () => {
  const p = resolveMemberCredits(toProfileProject(rec("p", {
    title: "P", titleDe: "P-de", link: "lab.org",
    affiliations: [{ name: "ETH", url: "ethz.ch" }, { memberUid: "anna", name: "Anna" }],
  })), new Map([["anna", "anna-meier"]]));
  assert.deepEqual(projectSlideData(p, "de"), {
    project: "P-de",
    projectLink: "https://lab.org",
    affiliations: JSON.stringify([{ name: "ETH", href: "https://ethz.ch" }, { name: "Anna", href: "/de/members/anna-meier" }]),
  });
  assert.deepEqual(projectSlideData(undefined, "en"), {});
  assert.deepEqual(projectSlideData(toProfileProject(rec("p")), "en"), {});
});

test("projectFields trims, drops empties, strips schemes and caps affiliations", () => {
  const out = projectFields({
    title: "  T ", titleDe: "", description: " ", link: " https://lab.org/x ",
    affiliations: [
      { name: " ETH ", url: "https://ethz.ch" }, { name: "", url: "x.ch" }, { name: "Plain", url: " " },
      { memberUid: "anna", name: " Anna " },
      ...Array.from({ length: 12 }, (_, i) => ({ name: `Org ${i}` })),
    ],
  });
  assert.equal(out.title, "T");
  assert.equal("titleDe" in out, false);
  assert.equal("description" in out, false);
  assert.equal(out.link, "lab.org/x");
  assert.equal(out.affiliations.length, 10);
  assert.deepEqual(out.affiliations.slice(0, 3), [
    { name: "ETH", url: "ethz.ch" }, { name: "Plain" }, { memberUid: "anna", name: "Anna" },
  ]);
  assert.equal("affiliations" in projectFields({ affiliations: [{ name: "" }] }), false);
});

test("editorBlocks: loose rows, project blocks in gallery order, empty projects last", () => {
  const gallery = [{}, { projectId: "p" }, { projectId: "p" }, { projectId: "ghost" }, {}];
  const blocks = editorBlocks(gallery, [{ projectId: "p" }, { projectId: "empty" }]);
  assert.deepEqual(blocks, [
    { kind: "image", index: 0 },
    { kind: "project", projectId: "p", indices: [1, 2] },
    { kind: "image", index: 3 },
    { kind: "image", index: 4 },
    { kind: "project", projectId: "empty", indices: [] },
  ]);
  assert.deepEqual(emptyProjectIds(gallery, [{ projectId: "p" }, { projectId: "empty" }]), ["empty"]);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test tests/unit/projects.test.mjs`
Expected: FAIL — cannot find module `src/lib/projects.ts`.

- [ ] **Step 3: Implement**

`src/lib/projects.ts`:
```ts
// PROJECTS — A MEMBER'S OPTIONAL GROUPING OF THEIR OWN WORKS (2026-09-23,
// documentation/20260923-projects-design.md).
//
// The second life of the feature. The first (withdrawn 2026-09-01, 95b43d2)
// kept projects as an array on the profile document; this one follows the
// works-on-the-record shape instead: one projects/{projectId} document per
// project, one optional `projectId` on each image record, and the profile's
// `gallery` id list still the ONLY order. A project sits where its first image
// sits; contiguousOrder() is what makes that true even for stored ids that
// are not adjacent.
//
// PURE, like galleryRecords.ts: no firebase import. The build, the member
// page, the editor, its preview, the lightbox and seo.ts all ask this module,
// so every rule about projects is written here once and unit-tested without
// an emulator.
import type { Lang } from "../i18n/utils";
import { memberHref, workLink } from "./links.ts";

// Keep in sync with validProject() / validAffiliation() in firestore.rules.
export const MAX_PROJECT_TITLE = 100;
export const MAX_PROJECT_DESCRIPTION = 600;
export const MAX_PROJECT_LINK = 200;
export const MAX_AFFILIATIONS = 10;
export const MAX_AFFILIATION_NAME = 100;
export const MAX_AFFILIATION_URL = 200;

/** One stored affiliation: a name with an optional scheme-less link, or a member credit. */
export type AffiliationRecord = { name: string; url?: string } | { memberUid: string; name: string };

/** A projects/{projectId} document with its id attached. */
export interface ProjectRecord {
  projectId: string;
  ownerUid: string;
  title?: string;
  titleDe?: string;
  description?: string;
  descriptionDe?: string;
  link?: string;
  affiliations?: AffiliationRecord[];
}

/** An affiliation as renderers see it. */
export interface ProjectAffiliation {
  name: string;
  /** Absolute external href (through workLink), for a name entry that had a linkable url. */
  href?: string;
  /** Present on a member credit. */
  memberUid?: string;
  /** Set by resolveMemberCredits(), and only while that member is in the directory. */
  memberSlug?: string;
}

/** A project as the view model carries it: texts raw in both locales, links absolute. */
export interface ProfileProject {
  id: string;
  title?: string;
  titleDe?: string;
  description?: string;
  descriptionDe?: string;
  /** Absolute href, through workLink(). */
  link?: string;
  affiliations: ProjectAffiliation[];
}

export interface WorkSection<W> {
  /** Absent for a run of works that belong to no project. */
  project?: ProfileProject;
  works: W[];
}

export type EditorBlock =
  | { kind: "image"; index: number }
  | { kind: "project"; projectId: string; indices: number[] };

/** The member-editable fields of a project, as written to Firestore. */
export interface ProjectFields {
  title?: string;
  titleDe?: string;
  description?: string;
  descriptionDe?: string;
  link?: string;
  affiliations?: AffiliationRecord[];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stripScheme(value: string): string {
  return value.replace(/^https?:\/\//i, "");
}

export function toProfileProject(rec: ProjectRecord): ProfileProject {
  const p: ProfileProject = { id: rec.projectId, affiliations: [] };
  const title = text(rec.title);
  const titleDe = text(rec.titleDe);
  const description = text(rec.description);
  const descriptionDe = text(rec.descriptionDe);
  const link = workLink(rec.link);
  if (title) p.title = title;
  if (titleDe) p.titleDe = titleDe;
  if (description) p.description = description;
  if (descriptionDe) p.descriptionDe = descriptionDe;
  if (link) p.link = link;
  for (const a of Array.isArray(rec.affiliations) ? rec.affiliations : []) {
    const name = text(a?.name);
    if (!name) continue;
    if ("memberUid" in a && text(a.memberUid)) {
      p.affiliations.push({ name, memberUid: a.memberUid });
    } else {
      const href = workLink((a as { url?: string }).url);
      p.affiliations.push(href ? { name, href } : { name });
    }
  }
  return p;
}

/**
 * The member's own projects. Someone else's id on an image is ignored here the
 * same way orderedGalleryItems() ignores someone else's image: the rules only
 * judge shape, the reader judges ownership.
 */
export function ownProjects(uid: string, records: readonly ProjectRecord[]): ProfileProject[] {
  return records.filter((r) => r.ownerUid === uid).map(toProfileProject);
}

/**
 * Gathers every item of a group at the position of its first item; items with
 * no group keep their place. The editor keeps a project's images adjacent, but
 * a Save that failed halfway, or a reorder persisted before the membership was
 * saved, can store them apart — readers must not scatter a project for that.
 */
export function contiguousOrder<T>(items: readonly T[], key: (item: T) => string | undefined): T[] {
  const out: T[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (k === undefined) {
      out.push(item);
      continue;
    }
    if (placed.has(k)) continue;
    placed.add(k);
    out.push(...items.filter((other) => key(other) === k));
  }
  return out;
}

/** The works in display order, cut into project blocks and runs of loose works. */
export function groupWorks<W extends { projectId?: string }>(
  works: readonly W[],
  projects: readonly ProfileProject[],
): WorkSection<W>[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const key = (w: W) => (w.projectId && byId.has(w.projectId) ? w.projectId : undefined);
  const sections: WorkSection<W>[] = [];
  for (const work of contiguousOrder(works, key)) {
    const id = key(work);
    const last = sections.at(-1);
    if (last && last.project?.id === id) last.works.push(work);
    else sections.push({ project: id ? byId.get(id) : undefined, works: [work] });
  }
  return sections;
}

/**
 * THE LINK A WORK SHOWS AS "THIS PIECE ON THE MAKER'S SITE" (2026-09-23, Josh:
 * "images inherit it. if there is a link in the image tab it takes
 * precedent"). The project's link fills the siteLink slot — the member's own
 * page — never `link`, which is where the picture was published.
 */
export function inheritedSiteLink(own: string | undefined, project: { link?: string } | undefined): string | undefined {
  return own ?? project?.link;
}

/** Both ways, like profileRole(): a German-only title still shows on the English page. */
export function projectTitle(p: { title?: string; titleDe?: string }, lang: Lang): string | undefined {
  return lang === "de" ? (p.titleDe ?? p.title) : (p.title ?? p.titleDe);
}

export function projectDescription(p: { description?: string; descriptionDe?: string }, lang: Lang): string | undefined {
  return lang === "de" ? (p.descriptionDe ?? p.description) : (p.description ?? p.descriptionDe);
}

/**
 * Member credits get a slug only while the member is in the directory. A
 * credit to a member who hid their profile or left stays their stored name,
 * as plain text — never a link to a page that no longer exists.
 */
export function resolveMemberCredits(p: ProfileProject, slugByUid: ReadonlyMap<string, string>): ProfileProject {
  return {
    ...p,
    affiliations: p.affiliations.map((a) => {
      const slug = a.memberUid ? slugByUid.get(a.memberUid) : undefined;
      return slug ? { ...a, memberSlug: slug } : a;
    }),
  };
}

export function affiliationHref(a: ProjectAffiliation, lang: string): string | undefined {
  return a.memberSlug ? memberHref(lang, a.memberSlug) : a.href;
}

/**
 * What a lightbox trigger carries about its project, as data-pswp-* values.
 * Strings only, because they travel as attributes: the lightbox script is a
 * module that renders from the trigger's dataset (see lightboxText.ts).
 */
export function projectSlideData(
  p: ProfileProject | undefined,
  lang: Lang,
): { project?: string; projectLink?: string; affiliations?: string } {
  if (!p) return {};
  const out: { project?: string; projectLink?: string; affiliations?: string } = {};
  const title = projectTitle(p, lang);
  if (title) {
    out.project = title;
    if (p.link) out.projectLink = p.link;
  }
  if (p.affiliations.length) {
    out.affiliations = JSON.stringify(
      p.affiliations.map((a) => {
        const href = affiliationHref(a, lang);
        return href ? { name: a.name, href } : { name: a.name };
      }),
    );
  }
  return out;
}

/** What Save writes: trimmed, empties dropped, schemes stripped, affiliations capped. */
export function projectFields(p: ProjectFields): ProjectFields {
  const out: ProjectFields = {};
  const title = text(p.title);
  const titleDe = text(p.titleDe);
  const description = text(p.description);
  const descriptionDe = text(p.descriptionDe);
  const link = text(p.link);
  if (title) out.title = title.slice(0, MAX_PROJECT_TITLE);
  if (titleDe) out.titleDe = titleDe.slice(0, MAX_PROJECT_TITLE);
  if (description) out.description = description.slice(0, MAX_PROJECT_DESCRIPTION);
  if (descriptionDe) out.descriptionDe = descriptionDe.slice(0, MAX_PROJECT_DESCRIPTION);
  if (link) out.link = stripScheme(link).slice(0, MAX_PROJECT_LINK);
  const affiliations: AffiliationRecord[] = [];
  for (const a of p.affiliations ?? []) {
    const name = text(a.name)?.slice(0, MAX_AFFILIATION_NAME);
    if (!name) continue;
    if ("memberUid" in a && text(a.memberUid)) {
      affiliations.push({ memberUid: a.memberUid, name });
    } else {
      const url = text((a as { url?: string }).url);
      affiliations.push(url ? { name, url: stripScheme(url).slice(0, MAX_AFFILIATION_URL) } : { name });
    }
  }
  if (affiliations.length) out.affiliations = affiliations.slice(0, MAX_AFFILIATIONS);
  return out;
}

/**
 * The editor's linear list: loose image rows and project blocks in gallery
 * order, then projects that hold no image yet — a new, empty block waits at
 * the end until something is dragged into it. An image naming an unknown
 * project is a loose row.
 */
export function editorBlocks(
  gallery: readonly { projectId?: string }[],
  projects: readonly { projectId: string }[],
): EditorBlock[] {
  const known = new Set(projects.map((p) => p.projectId));
  const blocks: EditorBlock[] = [];
  const blockOf = new Map<string, { kind: "project"; projectId: string; indices: number[] }>();
  gallery.forEach((item, index) => {
    const id = item.projectId && known.has(item.projectId) ? item.projectId : undefined;
    if (!id) {
      blocks.push({ kind: "image", index });
      return;
    }
    const existing = blockOf.get(id);
    if (existing) {
      existing.indices.push(index);
      return;
    }
    const block = { kind: "project" as const, projectId: id, indices: [index] };
    blockOf.set(id, block);
    blocks.push(block);
  });
  for (const p of projects) {
    if (!blockOf.has(p.projectId)) blocks.push({ kind: "project", projectId: p.projectId, indices: [] });
  }
  return blocks;
}

/** Projects no gallery image names — Save deletes these last. */
export function emptyProjectIds(
  gallery: readonly { projectId?: string }[],
  projects: readonly { projectId: string }[],
): string[] {
  const used = new Set(gallery.map((g) => g.projectId).filter(Boolean));
  return projects.map((p) => p.projectId).filter((id) => !used.has(id));
}
```

- [ ] **Step 4: Run to see it pass**

Run: `node --test tests/unit/projects.test.mjs && npm run test:unit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects.ts tests/unit/projects.test.mjs
git commit -m "feat(projects): the pure module every surface asks about projects"
```

---

### Task 3: `projectId` through the gallery join, the record write and the upload queue

**Files:**
- Modify: `src/lib/galleryRecords.ts` (`GalleryRecord` ~line 18; `orderedGalleryItems` item build ~line 120)
- Modify: `src/lib/gallery.ts` (`GalleryItem` — add field after `tags`; `saveGalleryRecords` ~line 430)
- Modify: `src/lib/images.ts` (`updateImageText` signature and body)
- Modify: `src/lib/galleryQueue.ts` (`GalleryTask`, `GalleryQueue.add`, the completion at ~line 259)
- Test: `tests/unit/galleryRecords.test.mjs`, `tests/unit/galleryQueue.test.mjs`

**Interfaces:**
- Produces: `GalleryRecord.projectId?: string`; `GalleryItem.projectId?: string`; `updateImageText(imageId, { …, projectId?: string })` writes `projectId` or `deleteField()`; `GalleryQueue.add(files: File[], target?: { projectId: string }): AddOutcome`; `GalleryTask.projectId?: string`; an uploaded item carries its task's `projectId`.

- [ ] **Step 1: Failing tests**

Append to `tests/unit/galleryRecords.test.mjs`:
```js
test("the record's projectId rides onto the item; absent stays absent", () => {
  const items = orderedGalleryItems(UID, ["a", "b"], [record("a", { projectId: "p1" }), record("b")], BUCKET);
  assert.equal(items[0].projectId, "p1");
  assert.equal("projectId" in items[1], false);
});
```
Read `tests/unit/galleryQueue.test.mjs` first to see how it builds a queue (it loads the module with `loadTs` and fakes the pipeline). Add a test in the same style:
```js
test("an upload aimed at a project arrives carrying that project", async () => {
  // Build the queue exactly as the neighbouring tests do; capture onUploaded.
  // queue.add([file], { projectId: "p1" }) → after the fake upload resolves,
  // the item passed to onUploaded has projectId "p1".
  // queue.add([file]) → the item has no projectId key.
});
```
Fill the body using the file's own helpers (names differ per file; do not invent them — copy from the nearest existing `add` test).

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/unit/galleryRecords.test.mjs tests/unit/galleryQueue.test.mjs`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement**

`galleryRecords.ts` — in `GalleryRecord` after `tags?: string[];`:
```ts
  /** The member's project this work belongs to, if any (2026-09-23). Ownership is judged by ownProjects() in projects.ts. */
  projectId?: string;
```
and in `orderedGalleryItems`, after the `tags` line:
```ts
    const projectId = str(rec.projectId);
    if (projectId) item.projectId = projectId;
```
`gallery.ts` — in `GalleryItem` after `tags?`:
```ts
  /**
   * WHICH PROJECT THIS WORK IS IN (2026-09-23, documentation/20260923-projects-design.md).
   * At most one. Written onto the record at Save with the other words; the
   * gallery array stays ids only, and the editor keeps a project's images
   * adjacent in it.
   */
  projectId?: string;
```
and in `saveGalleryRecords` add `projectId: item.projectId,` to the object passed to `updateImageText`.

`images.ts` — add `projectId?: string;` to `updateImageText`'s `text` parameter type, and in the `updateDoc` payload after `tags`:
```ts
    projectId: text.projectId ? text.projectId : deleteField(),
```

`galleryQueue.ts` — `GalleryTask` gains:
```ts
  /** The project an addition was dropped into, carried onto the uploaded item (2026-09-23). */
  readonly projectId?: string;
```
`GalleryQueue.add` becomes `add(files: File[], target?: { projectId: string }): AddOutcome;` (update its doc comment: "`target` puts every accepted file into that project"). In the implementation's `add(files)` (~291) accept `target` and set `projectId: target?.projectId` on each task it creates (only when defined — keep the key absent otherwise). At the completion (~259):
```ts
      if (task.replaces) options.onReplaced(item, task.replaces);
      else options.onUploaded(task.projectId ? { ...item, projectId: task.projectId } : item);
```

- [ ] **Step 4: Run to see them pass**

Run: `npm run test:unit && npx astro check`
Expected: unit all PASS; check ≤ 25. `ProfileForm.astro` still calls `galleryQueue.add(files)` — still valid.

- [ ] **Step 5: Commit**

```bash
git add src/lib/galleryRecords.ts src/lib/gallery.ts src/lib/images.ts src/lib/galleryQueue.ts tests/unit/galleryRecords.test.mjs tests/unit/galleryQueue.test.mjs
git commit -m "feat(projects): projectId through the join, the record write and the upload queue"
```

---

### Task 4: Functions — replacement keeps the project, purge deletes projects, admin graph lists them

**Files:**
- Modify: `functions/src/types.ts` (`ImageDoc` ~line 27)
- Modify: `functions/src/uploads.ts:18` (`WORK_TEXT_FIELDS`)
- Modify: `functions/src/purge.ts` (the `docsDeleted` step)
- Modify: `functions/src/adminOps.ts` (`memberGraph` ~150-184)
- Modify: `src/lib/adminApi.ts` (`MemberGraph` ~28)
- Modify: `src/lib/admin/memberDetail.ts` (a section after Images ~line 350, and its place in the returned layout)
- Modify: `src/pages/proto/admin-preview.astro` — its synthetic records are typed `MemberGraph` with no casts (repo CLAUDE.md), so they need a `projects` array: give one member a sample project (title, one name affiliation, one member credit) and one image a matching `projectId`, so the Projects section can be looked at without the admin claim
- Test: `tests/functions/security.test.cjs`

**Interfaces:**
- Produces: `MemberGraph.projects: AdminProject[]` where `export interface AdminProject { projectId: string; [key: string]: unknown }` in `src/lib/adminApi.ts`.

- [ ] **Step 1: Failing tests**

In `tests/functions/security.test.cjs`, in the replacement test (~364): add `projectId: 'p1'` to the seeded old record's fields, add `projectId: created.projectId` to the left object of the `deepEqual` and `projectId: 'p1'` to the right. Append:
```js
test('purge deletes the member\'s projects and leaves everyone else\'s', async () => {
  const { scheduleDeletion } = require('../../functions/lib/lifecycle.js');
  const { purgeAccount } = require('../../functions/lib/purge.js');
  await db.doc('users/member').set({ displayName: 'Member' });
  await db.doc('publicProfiles/member').set({ displayName: 'Member', active: true });
  await db.doc('projects/mine').set({ ownerUid: 'member', title: 'Mine' });
  await db.doc('projects/theirs').set({ ownerUid: 'other', title: 'Theirs' });
  await scheduleDeletion('member', 'member', Timestamp.now());
  mock.method(adminModule.adminAuth, 'updateUser', async () => ({}));
  mock.method(adminModule.adminAuth, 'deleteUser', async () => {});
  mock.method(adminModule, 'getBucket', () => ({ deleteFiles: async () => {}, getFiles: async () => [[]] }));
  await purgeAccount('member');
  assert.equal((await db.doc('projects/mine').get()).exists, false);
  assert.equal((await db.doc('projects/theirs').get()).exists, true);
});

test('the admin member graph lists the member\'s projects', async () => {
  const { memberGraph } = require('../../functions/lib/adminOps.js');
  mock.method(adminModule.adminAuth, 'getUser', async () => { throw Object.assign(new Error('x'), { code: 'auth/user-not-found' }); });
  await db.doc('projects/mine').set({ ownerUid: 'member', title: 'Mine' });
  await db.doc('projects/theirs').set({ ownerUid: 'other', title: 'Theirs' });
  const graph = await memberGraph('member');
  assert.deepEqual(graph.projects.map((p) => [p.projectId, p.title]), [['mine', 'Mine']]);
});
```
If `memberGraph` is not exported, export it (it is declared `export async function` at ~150 — check).

- [ ] **Step 2: Run to see them fail**

Run: `npm run test:rules`
Expected: the replacement test fails on `projectId`; the two new tests fail.

- [ ] **Step 3: Implement**

`types.ts` `ImageDoc`, after `tags?`:
```ts
  /** The member's project this work is in (2026-09-23). Carried over by a replacement; nothing else server-side reads it. */
  projectId?: string;
```
`uploads.ts:18`:
```ts
const WORK_TEXT_FIELDS = ["caption", "captionDe", "description", "descriptionDe", "link", "siteLink", "tags", "projectId"] as const;
```
(If the neighbouring comment explains the list, add: projectId rides along so a replaced picture stays in its project.)

`purge.ts`, in the `docsDeleted` step, beside the `slugs`/`permits` queries:
```ts
      const projects = await db.collection("projects").where("ownerUid", "==", uid).get();
```
and add `...projects.docs.map((d) => d.ref),` to the `deleteRefs([...])` list.

`adminOps.ts` `memberGraph`: add `db.collection("projects").where("ownerUid", "==", uid).get()` to the `Promise.all` (name it `projects`) and to the returned object:
```ts
    projects: projects.docs.map((d) => ({ projectId: d.id, ...d.data() })),
```
`adminApi.ts`: add the `AdminProject` interface and `projects: AdminProject[];` to `MemberGraph`.

`memberDetail.ts`: after the Images section, add a Projects section built with the same helpers the file already uses (`section`, `el`, `otherRows`/`docRows` — read their signatures at ~123-150 first). One block per project: its title (or "Untitled project"), its id in `muted small`, then every field via `otherRows(p, Object.keys(p).filter((k) => k !== "projectId"), deps)`, and a count of the member's images naming it (`g.images.filter((i) => i.projectId === p.projectId).length`). Empty list → `el("p", { class: "muted" }, "No projects.")`. Insert the section into the layout right after `imagesSec`.

- [ ] **Step 4: Run to see them pass**

Run: `cd functions && npx tsc --noEmit && cd .. && npm run test:rules && npx astro check`
Expected: tsc 0; all PASS; check ≤ 25 (a new error in `admin-preview.astro` means its synthetic graph is missing `projects`). Open `/proto/admin-preview` in the dev server and look at the Projects section.

- [ ] **Step 5: Commit**

```bash
git add functions/src/types.ts functions/src/uploads.ts functions/src/purge.ts functions/src/adminOps.ts src/lib/adminApi.ts src/lib/admin/memberDetail.ts src/pages/proto/admin-preview.astro tests/functions/security.test.cjs
git commit -m "feat(projects): replacement keeps the project, purge deletes projects, admin sees them"
```

---

### Task 5: Client project store

**Files:**
- Create: `src/lib/projectStore.ts`

**Interfaces:**
- Consumes: `ProjectRecord`, `ProjectFields`, `projectFields` from `projects.ts`; `db` from `./firebase.ts`.
- Produces:
```ts
export async function loadProjects(uid: string): Promise<ProjectRecord[]>;
export interface ProjectSaveFailure { projectId: string; error: unknown }
export async function saveProjects(uid: string, projects: readonly (ProjectFields & { projectId: string })[], storedIds: ReadonlySet<string>): Promise<ProjectSaveFailure[]>;
export async function deleteProjects(ids: readonly string[]): Promise<ProjectSaveFailure[]>;
export interface MemberOption { uid: string; name: string }
export async function loadMemberOptions(): Promise<MemberOption[]>;
export async function memberSlugs(uids: readonly string[]): Promise<Map<string, string>>;
```

No unit test (Firestore I/O; the rules tests in Task 1 pin what it may write, and Task 10's browser walk exercises it). Keep the module thin so there is nothing in it worth a fake.

- [ ] **Step 1: Implement**

```ts
// Firestore I/O for projects — the thin, untested edge of
// documentation/20260923-projects-design.md. Every decision about WHAT is
// written is made by projectFields() in the pure module; this file only
// decides create vs update and turns an absent field into deleteField().
import {
  collection, deleteDoc, deleteField, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "./firebase.ts";
import { projectFields, type ProjectFields, type ProjectRecord } from "./projects.ts";
import { isProfileVisible } from "./profileVisibility.ts";

const EDITABLE = ["title", "titleDe", "description", "descriptionDe", "link", "affiliations"] as const;

export async function loadProjects(uid: string): Promise<ProjectRecord[]> {
  const snap = await getDocs(query(collection(db, "projects"), where("ownerUid", "==", uid)));
  return snap.docs.map((d) => ({ projectId: d.id, ...(d.data() as Omit<ProjectRecord, "projectId">) }));
}

export interface ProjectSaveFailure {
  projectId: string;
  error: unknown;
}

/**
 * Creates the new ones, updates the stored ones. allSettled, like
 * saveGalleryRecords(): one refused project must not stop the rest, and each
 * refusal comes back so Save can name it instead of printing "Changes saved".
 */
export async function saveProjects(
  uid: string,
  projects: readonly (ProjectFields & { projectId: string })[],
  storedIds: ReadonlySet<string>,
): Promise<ProjectSaveFailure[]> {
  const results = await Promise.allSettled(
    projects.map((p) => {
      const fields = projectFields(p);
      const ref = doc(db, "projects", p.projectId);
      if (!storedIds.has(p.projectId)) {
        return setDoc(ref, { ownerUid: uid, ...fields, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
      for (const key of EDITABLE) update[key] = fields[key] ?? deleteField();
      return updateDoc(ref, update);
    }),
  );
  return results.flatMap((r, i) => (r.status === "rejected" ? [{ projectId: projects[i].projectId, error: r.reason }] : []));
}

export async function deleteProjects(ids: readonly string[]): Promise<ProjectSaveFailure[]> {
  const results = await Promise.allSettled(ids.map((id) => deleteDoc(doc(db, "projects", id))));
  return results.flatMap((r, i) => (r.status === "rejected" ? [{ projectId: ids[i], error: r.reason }] : []));
}

export interface MemberOption {
  uid: string;
  name: string;
}

/** Every visible member, for the affiliation type-ahead. publicProfiles is public read and small. */
export async function loadMemberOptions(): Promise<MemberOption[]> {
  const snap = await getDocs(collection(db, "publicProfiles"));
  return snap.docs
    .filter((d) => isProfileVisible(d.data()))
    .map((d) => ({ uid: d.id, name: String(d.data().displayName ?? "").trim() }))
    .filter((m) => m.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Current slugs for the preview's member-credit links. `in` takes at most 30 values. */
export async function memberSlugs(uids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(uids)];
  for (let i = 0; i < unique.length; i += 30) {
    const snap = await getDocs(query(collection(db, "slugs"), where("uid", "in", unique.slice(i, i + 30))));
    for (const d of snap.docs) if (d.data().current === true) out.set(String(d.data().uid), d.id);
  }
  return out;
}
```
Check `isProfileVisible`'s parameter type accepts `DocumentData` (it takes `{ active?: unknown; moderationHidden?: unknown }` — fine).

- [ ] **Step 2: Lint and check**

Run: `npm run lint && npx astro check`
Expected: 0 / ≤ 25.

- [ ] **Step 3: Commit**

```bash
git add src/lib/projectStore.ts
git commit -m "feat(projects): client store — load, save, delete, member lookups"
```

---

### Task 6: Projects into the snapshot and the view model

**Files:**
- Modify: `scripts/export-site-data.mjs` (key list ~line 29; the `Promise.all` ~33; the `snapshot` object ~43)
- Modify: `src/lib/membersBuild.ts` (`SiteSnapshot`, the validator, `fetchDirectory`)
- Modify: `src/lib/profileView.ts` (`ProfileWork`, `ProfileViewModel`)
- Modify: `src/lib/memberView.ts` (`works()`, `toMemberViewBase`, `completeness` comment untouched)
- Test: `tests/unit/memberView.test.mjs`

**Interfaces:**
- Consumes: `ownProjects`, `inheritedSiteLink`, `resolveMemberCredits`, `ProjectRecord`, `ProfileProject` (Task 2); `GalleryRecord.projectId` (Task 3).
- Produces: `ProfileWork.projectId?: string` (only when the project is the member's own and known); `ProfileViewModel.projects?: ProfileProject[]` (only projects holding ≥ 1 work, member credits resolved at build); `toMemberViewBase(uid, doc, records?, bucket?, projectRecords?: readonly ProjectRecord[])`; `SiteSnapshot.projects: ProjectRecord[]` (required).

- [ ] **Step 1: Failing tests**

Append to `tests/unit/memberView.test.mjs`:
```js
test("works carry their own project; the project's link fills an empty siteLink", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a", "b", "c"] }, [
    rec("a", { projectId: "p" }),
    rec("b", { projectId: "p", siteLink: "ada.ch/work/b" }),
    rec("c", { projectId: "theirs" }),
  ], BUCKET, [
    { projectId: "p", ownerUid: UID, title: "P", link: "lab.org/p" },
    { projectId: "theirs", ownerUid: "someone-else", title: "Not yours" },
    { projectId: "empty", ownerUid: UID, title: "No works" },
  ]);
  assert.equal(m.works[0].projectId, "p");
  assert.equal(m.works[0].siteLink, "https://lab.org/p");
  assert.equal(m.works[1].siteLink, "https://ada.ch/work/b");
  assert.equal("projectId" in m.works[2], false);
  assert.deepEqual(m.projects.map((p) => p.id), ["p"]);
});

test("no project records means no projects and unchanged works", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a"] }, [rec("a")], BUCKET);
  assert.deepEqual(m.projects, []);
  assert.equal("projectId" in m.works[0], false);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/unit/memberView.test.mjs`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement**

`profileView.ts` — `ProfileWork`, after `tags`:
```ts
  /** The member's own project this work is in, when it is one the view model also carries in `projects`. */
  projectId?: string;
```
`ProfileViewModel`, after `works`:
```ts
  /**
   * The member's projects that hold at least one of `works` (2026-09-23).
   * Optional so producers that know nothing of projects (the signup wizard's
   * preview) need not invent an empty list; renderers treat absent as none.
   */
  projects?: ProfileProject[];
```
with `import type { ProfileProject } from "./projects.ts";` at the top.

`memberView.ts`:
- import `{ inheritedSiteLink, ownProjects, type ProjectRecord }` from `./projects.ts`.
- `works()` gains a `projects: readonly ProfileProject[]` parameter; inside the `.map`, compute
```ts
    const project = g.projectId ? byProject.get(g.projectId) : undefined;
```
(with `const byProject = new Map(projects.map((p) => [p.id, p]));` before the map), set `siteLink: inheritedSiteLink(workLink(g.siteLink), project),` and add `...(project ? { projectId: project.id } : {}),`.
- `toMemberViewBase` gains `projectRecords: readonly ProjectRecord[] = []` as its fifth parameter. In the body:
```ts
  const own = ownProjects(uid, projectRecords);
  const memberWorks = works(uid, doc, records, bucket, own);
  const used = new Set(memberWorks.map((w) => w.projectId).filter(Boolean));
```
return `works: memberWorks, projects: own.filter((p) => used.has(p.id)),`.

`membersBuild.ts`:
- `SiteSnapshot` gains `projects: ProjectRecord[];` with a comment that it is required for the same reason `moderation` is.
- the validator adds `|| !Array.isArray(snapshot.projects)` beside the moderation check.
- in `fetchDirectory`, group projects by owner:
```ts
  const projectsByOwner = new Map<string, ProjectRecord[]>();
  for (const p of snapshot.projects) {
    const list = projectsByOwner.get(p.ownerUid) ?? [];
    list.push(p);
    projectsByOwner.set(p.ownerUid, list);
  }
```
pass `projectsByOwner.get(profile.id) ?? []` as the fifth argument of `toMemberViewBase`, and after `resolveSlugs(...)`:
```ts
  // Member credits link only to members who are in this build's directory.
  const slugByUid = new Map(resolved.map((m) => [m.id, m.slug]));
  const members = resolved.map((m) => ({
    ...m,
    projects: (m.projects ?? []).map((p) => resolveMemberCredits(p, slugByUid)),
  }));
```
(rename the existing `members` from `resolveSlugs` to `resolved`).

`scripts/export-site-data.mjs`:
```js
const projectKeys = ["ownerUid", "title", "titleDe", "description", "descriptionDe", "link", "affiliations"];
```
add `db.collection("projects").get()` to the `Promise.all` as `projects`, and to `snapshot`:
```js
    projects: projects.docs.filter((doc) => visible.has(doc.data().ownerUid))
      .map((doc) => ({ projectId: doc.id, ...pick(doc.data(), projectKeys) })),
```
and `projects: snapshot.projects.length` in the final `console.log` summary.

Also update `src/pages/proto/profile-preview.astro` or any other caller of `toMemberViewBase` only if TypeScript complains (the new parameter is optional).

- [ ] **Step 4: Run to see them pass**

Run: `npm run test:unit && npx astro check`
Expected: all PASS; ≤ 25.

- [ ] **Step 5: Commit**

```bash
git add scripts/export-site-data.mjs src/lib/membersBuild.ts src/lib/profileView.ts src/lib/memberView.ts tests/unit/memberView.test.mjs
git commit -m "feat(projects): into the site snapshot and the member view model"
```

---

### Task 7: Member page, editor preview and lightbox render project blocks

**Files:**
- Modify: `src/i18n/translations.ts` — `member.project.partOf` ("Part of" / "Teil von"), `member.project.with` ("With" / "Mit")
- Modify: `src/lib/lightboxText.ts` (`TriggerText`, `readTrigger`, `LightboxTextLabels`, the `vscn-text` renderer)
- Modify: `src/pages/[...lang]/members/[slug].astro` (the `works` mapping ~74-104, `lightboxStrings` ~112, the `.mprof__works` markup ~276-345, the page script's labels fallback ~375-390)
- Modify: `src/styles/profile.css` — `.mprof__project*` rules
- Modify: `src/components/ProfileViewPreview.astro` — a `project` template
- Modify: `src/lib/profilePreview.ts` — the Work block renders sections
- Modify: `src/components/CommunityGrid.astro` (~296 strings, ~2976-2990 fallback type/values, ~3170 `registerLightboxText` call)
- Modify: `src/components/community/CommunityImageCard.astro` (slides ~193 and frame link ~251), `src/components/community/CommunityWorkCard.astro` (~170)

**Interfaces:**
- Consumes: `groupWorks`, `projectTitle`, `projectDescription`, `affiliationHref`, `projectSlideData` (Task 2); `ProfileViewModel.projects`, `ProfileWork.projectId` (Task 6).
- Produces: trigger attributes `data-pswp-project`, `data-pswp-project-link`, `data-pswp-affiliations` (JSON `[{name, href?}]`); `LightboxTextLabels.partOf: string; with: string`.

- [ ] **Step 1: Lightbox text**

`lightboxText.ts`:
- `TriggerText` gains `project: string; projectLink: string; affiliations: { name: string; href?: string }[];`
- `readTrigger` adds
```ts
    project: el?.dataset.pswpProject?.trim() || "",
    projectLink: el?.dataset.pswpProjectLink?.trim() || "",
    affiliations: parseAffiliations(el?.dataset.pswpAffiliations),
```
with
```ts
/** The trigger's affiliations, tolerant of a missing or malformed attribute — a bad value shows nothing, never throws in a slide change. */
function parseAffiliations(raw: string | undefined): { name: string; href?: string }[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((a): a is { name: string; href?: string } => typeof a?.name === "string" && a.name.trim() !== "")
      : [];
  } catch {
    return [];
  }
}
```
- `LightboxTextLabels` gains `/** "Part of", before a project's title. */ partOf: string; /** "With", before a project's affiliations. */ with: string;`
- In the `vscn-text` renderer, after the links row and before `el.classList.toggle(...)`:
```ts
          // THE PROJECT THIS PICTURE IS PART OF (2026-09-23,
          // documentation/20260923-projects-design.md): its title, linked
          // when the project has a link, then who it was made with. Member
          // text, so textContent throughout.
          if (project) {
            const line = document.createElement("span");
            line.className = "pswp__vscn-text-project";
            line.append(`${labels.partOf} `);
            const name = document.createElement(projectLink ? "a" : "span");
            name.textContent = project;
            if (name instanceof HTMLAnchorElement) {
              name.href = projectLink;
              name.target = "_blank";
              name.rel = "noopener";
            }
            line.append(name);
            el.append(line);
          }
          if (affiliations.length) {
            const line = document.createElement("span");
            line.className = "pswp__vscn-text-affiliations";
            line.append(`${labels.with} `);
            affiliations.forEach((a, i) => {
              if (i > 0) line.append(" · ");
              const node = document.createElement(a.href ? "a" : "span");
              node.textContent = a.name;
              if (node instanceof HTMLAnchorElement && a.href) {
                node.href = a.href;
                // A member credit is on-site (ClientRouter picks it up); an external one opens a tab.
                if (/^https?:/i.test(a.href)) { node.target = "_blank"; node.rel = "noopener"; }
              }
              line.append(node);
            });
            el.append(line);
          }
```
destructure `project, projectLink, affiliations` from `readTrigger(...)` alongside the existing fields, and extend the `is-empty` condition with `&& !project && !affiliations.length`. Style the two new lines where the other `.pswp__vscn-text-*` rules live (grep for `pswp__vscn-text-links` in `src/styles` / components): same size and colour as the links row.

- [ ] **Step 2: Member page**

In `[slug].astro`:
- import `groupWorks, projectTitle, projectDescription, affiliationHref, projectSlideData` from `../../../lib/projects.ts`.
- in the `works` mapping add `slide: projectSlideData(member.projects?.find((p) => p.id === w.projectId), currentLang),`.
- `lightboxStrings` gains `partOf: t("member.project.partOf"), with: t("member.project.with"),` and the script's fallback object/type (~375-390) gains the same two keys with the English strings.
- after `works` is computed:
```ts
// PROJECT BLOCKS (2026-09-23): the gallery stays one list in the member's
// order; a project's images sit together under its heading, loose works in
// between. groupWorks() is the same cut the editor preview makes.
const sections = groupWorks(works, member.projects ?? []);
```
- replace the `works.map((w, i) => ( <figure …> ))` inside `.mprof__works` with a loop over `sections`. Keep the running index for `transition:name` and `loading` (compute `const i = works.indexOf(w)` inside, or carry it). Each section:
```astro
{sections.map((section) =>
  section.project ? (
    <section class="mprof__project">
      {(() => {
        const title = projectTitle(section.project!, currentLang);
        const desc = projectDescription(section.project!, currentLang);
        return (
          <>
            {title && (
              <h2 class="mprof__project-title">
                {section.project!.link
                  ? <a href={section.project!.link} target="_blank" rel="noopener">{title}</a>
                  : title}
              </h2>
            )}
            {desc && <p class="mprof__project-desc">{desc}</p>}
            {section.project!.affiliations.length > 0 && (
              <p class="mprof__project-with">
                {t("member.project.with")}{" "}
                {section.project!.affiliations.map((a, k) => (
                  <>
                    {k > 0 && " · "}
                    {affiliationHref(a, currentLang)
                      ? <a href={affiliationHref(a, currentLang)} {...(a.memberSlug ? {} : { target: "_blank", rel: "noopener" })}>{a.name}</a>
                      : <span>{a.name}</span>}
                  </>
                ))}
              </p>
            )}
          </>
        );
      })()}
      {section.works.map((w) => <WorkFigure … />)}
    </section>
  ) : (
    section.works.map((w) => <WorkFigure … />)
  ),
)}
```
Astro has no local components inside a page file — so either move the existing `<figure>` markup into a small `src/components/MemberWork.astro` taking `{ w, i, member, t-strings… }`, or repeat it through a helper. **Recommended:** extract `MemberWork.astro` (props: `work`, `index`, `memberId`, `displayName`, `workAlt: string`, `linkTitle: string`, `siteLinkTitle: string`), moving the figure markup verbatim, so the page reads as sections → works. Add the three new trigger attributes to the `<a class="mprof__work-link">`:
```astro
data-pswp-project={w.slide.project}
data-pswp-project-link={w.slide.projectLink}
data-pswp-affiliations={w.slide.affiliations}
```
The heading level: the page's section headings are `h2` (`mprof__key`); the project title is an `h2` too.

- [ ] **Step 3: Styles**

`src/styles/profile.css` (the shared stylesheet; read its header first — scoped rules would not reach the preview):
```css
/* A PROJECT BLOCK on the member page and in the editor's preview (2026-09-23).
   The works inside keep exactly the layout loose works have; the block only
   adds a heading, its words and a quiet rule above, so the gallery still reads
   as one column. */
.mprof__project {
  display: flex;
  flex-direction: column;
  gap: var(--mprof-works-gap, 1.5rem);
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.mprof__project-title {
  margin: 0;
  font-size: 1.05rem;
}

.mprof__project-title a {
  color: inherit;
}

.mprof__project-desc,
.mprof__project-with {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}
```
Match the gap to whatever `.mprof__works` uses today (read it; if it is a literal, reuse the literal rather than inventing the custom property).

- [ ] **Step 4: Editor preview**

`ProfileViewPreview.astro`: add, next to the existing `data-ppv-tpl="work"` template:
```astro
<template data-ppv-tpl="project">
  <section class="mprof__project">
    <h2 class="mprof__project-title" data-ppv-project="title"></h2>
    <p class="mprof__project-desc" data-ppv-project="desc"></p>
    <p class="mprof__project-with" data-ppv-project="with"></p>
    <div data-ppv-project="works" style="display: contents"></div>
  </section>
</template>
```
`profilePreview.ts`:
- `ProfilePreviewLabels` gains `with: string;` and a `lang: "en" | "de"` field (the editor passes its `lang`).
- In the Work block, build the figures as today into a `figureFor(w)` function, then:
```ts
    const sections = groupWorks(vm.works.filter((w) => w.url && w.width > 0 && w.height > 0), vm.projects ?? []);
    const nodes = sections.flatMap((section) => {
      const figures = section.works.map(figureFor).filter((n): n is HTMLElement => n !== null);
      if (!section.project) return figures;
      const block = clone("project");
      if (!block) return figures;
      const slot = (name: string) => block.querySelector<HTMLElement>(`[data-ppv-project="${name}"]`);
      const title = projectTitle(section.project, labels.lang) ?? "";
      const titleEl = slot("title");
      if (titleEl) {
        titleEl.replaceChildren();
        if (title && section.project.link) {
          const a = document.createElement("a");
          a.href = section.project.link; a.target = "_blank"; a.rel = "noopener"; a.textContent = title;
          titleEl.append(a);
        } else titleEl.textContent = title;
        titleEl.hidden = !title;
      }
      const desc = projectDescription(section.project, labels.lang) ?? "";
      const descEl = slot("desc");
      if (descEl) { descEl.textContent = desc; descEl.hidden = !desc; }
      const withEl = slot("with");
      if (withEl) {
        withEl.replaceChildren();
        const list = section.project.affiliations;
        if (list.length) {
          withEl.append(`${labels.with} `);
          list.forEach((a, k) => {
            if (k > 0) withEl.append(" · ");
            const href = affiliationHref(a, labels.lang);
            const node = document.createElement(href ? "a" : "span");
            node.textContent = a.name;
            if (node instanceof HTMLAnchorElement && href) node.href = href;
            withEl.append(node);
          });
        }
        withEl.hidden = list.length === 0;
      }
      slot("works")?.replaceChildren(...figures);
      return [block];
    });
    works.replaceChildren(...nodes);
    show(works, nodes.length > 0);
    show(empty, nodes.length === 0);
```
Import `groupWorks, projectTitle, projectDescription, affiliationHref` from `./projects.ts`. Update the caller in `ProfileForm.astro` (`renderProfilePreview(..., labels)`) to pass `with` and `lang` — the full editor wiring is Task 10, but the labels must compile now: add `with: s["member.project.with"]` (or however that file builds its preview labels — read it) and `lang`.

- [ ] **Step 5: Community cards and grid**

`CommunityImageCard.astro` and `CommunityWorkCard.astro`: wherever a slide or link gets `data-pswp-site-link`, add the three project attributes from `projectSlideData(member.projects?.find((p) => p.id === w.projectId), lang)`. Read how each file gets its `lang` (they already localise captions). `CommunityGrid.astro`: add `partOf` / `with` to its lightbox strings (~296), its fallback type and values (~2976-2990), and pass them in the `registerLightboxText(lightbox, { … })` call (~3170).

- [ ] **Step 6: Gates and a look**

Run: `npm run lint && npx astro check && npm run test:unit`
Expected: 0 / ≤ 25 / PASS.

Then build against dev data and look: `node scripts/export-site-data.mjs development` (needs the dev service account in `.env.development`; if that credential is revoked — see memory `dev-deploy-is-ci-only` — report it and verify via Task 12's dev deploy instead). With a snapshot, `npm run build:site -- --mode development` and open a built member page via `npx astro preview` in the browser pane. Dev has no projects yet, so the pages must look **exactly as before**; that is the check here. Project rendering is verified in Task 12 with a real project.

- [ ] **Step 7: Commit**

```bash
git add -A src/
git commit -m "feat(projects): member page, preview and lightbox render project blocks"
```

---

### Task 8: Structured data

**Files:**
- Modify: `src/lib/seo.ts` (`SeoWork`, `imageNode`, `memberPageJsonLd`)
- Modify: `src/pages/[...lang]/members/[slug].astro` (the `memberPageJsonLd` call ~143)
- Test: `tests/unit/seo.test.mjs`

**Interfaces:**
- Consumes: `ProfileProject`, `projectTitle`, `projectDescription`, `affiliationHref` (Task 2).
- Produces: `SeoWork.project?: SeoProject` where
```ts
export interface SeoProject {
  id: string;
  name?: string;
  description?: string;
  /** Absolute. */
  url?: string;
  affiliations: { name: string; url?: string; personUrl?: string }[];
}
```

- [ ] **Step 1: Failing test**

Append to `tests/unit/seo.test.mjs`:
```js
test("a project is one CreativeWork node; its images point at it beside their publication", () => {
  const project = {
    id: "p1", name: "Ribosome", description: "Cryo-EM", url: "https://lab.org/r",
    affiliations: [{ name: "ETH", url: "https://ethz.ch" }, { name: "Anna", personUrl: "https://vscn.ch/members/anna/" }, { name: "Plain" }],
  };
  const graph = memberPageJsonLd({
    member: { displayName: "Ada", portfolio: "", socialMedia: "" },
    works: [
      { url: "https://x/1.webp", width: 10, height: 10, link: "https://nature.com/a", project },
      { url: "https://x/2.webp", width: 10, height: 10, project },
      { url: "https://x/3.webp", width: 10, height: 10 },
    ],
    pageUrl: "https://vscn.ch/members/ada/",
    site: SITE,
    description: "d",
  })["@graph"];
  const projects = graph.filter((n) => n["@type"] === "CreativeWork");
  assert.equal(projects.length, 1);
  assert.deepEqual(projects[0], {
    "@type": "CreativeWork",
    "@id": "https://vscn.ch/members/ada/#project-p1",
    name: "Ribosome",
    description: "Cryo-EM",
    url: "https://lab.org/r",
    creator: { "@id": "https://vscn.ch/members/ada/#person" },
    contributor: [
      { "@type": "Organization", name: "ETH", url: "https://ethz.ch" },
      { "@type": "Person", "@id": "https://vscn.ch/members/anna/#person", name: "Anna" },
      { "@type": "Organization", name: "Plain" },
    ],
  });
  const images = graph.filter((n) => n["@type"] === "ImageObject");
  assert.deepEqual(images[0].isPartOf, [
    { "@type": "WebPage", url: "https://nature.com/a" },
    { "@id": "https://vscn.ch/members/ada/#project-p1" },
  ]);
  assert.deepEqual(images[1].isPartOf, { "@id": "https://vscn.ch/members/ada/#project-p1" });
  assert.equal("isPartOf" in images[2], false);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test tests/unit/seo.test.mjs`
Expected: the new test FAILS; existing ones pass.

- [ ] **Step 3: Implement**

`seo.ts`:
- add `SeoProject` (above) and `project?: SeoProject;` on `SeoWork`.
- `imageNode(work, creator, creatorName, site, projectRef?: Node)`; replace its `isPartOf` line with:
```ts
    // Publication and project, side by side (2026-09-23): the picture is part
    // of the page it appeared on AND of the member's project. One value stays
    // a plain object, so pages without projects serialise exactly as before.
    isPartOf: partOf(work.link ? { "@type": "WebPage", url: work.link } : undefined, projectRef),
```
with
```ts
function partOf(...refs: (Node | undefined)[]): Node | Node[] | undefined {
  const present = refs.filter((r): r is Node => r !== undefined);
  return present.length === 0 ? undefined : present.length === 1 ? present[0] : present;
}

function projectId(pageUrl: string, id: string): string {
  return `${pageUrl}#project-${id}`;
}

function projectNode(p: SeoProject, pageUrl: string): Node {
  return compact({
    "@type": "CreativeWork",
    "@id": projectId(pageUrl, p.id),
    name: p.name,
    description: p.description,
    url: p.url,
    creator: { "@id": personId(pageUrl) },
    contributor: p.affiliations.map((a) =>
      a.personUrl
        ? { "@type": "Person", "@id": personId(a.personUrl), name: a.name }
        : compact({ "@type": "Organization", name: a.name, url: a.url }),
    ),
  });
}
```
- `memberPageJsonLd`: collect unique projects in work order and emit their nodes after the ProfilePage, then the images with a project ref:
```ts
  const projects = [...new Map(works.flatMap((w) => (w.project ? [[w.project.id, w.project]] : []))).values()];
  …
      ...projects.map((p) => projectNode(p, pageUrl)),
      ...works.map((w) => imageNode(w, ref, member.displayName, site, w.project ? { "@id": projectId(pageUrl, w.project.id) } : undefined)),
```
`communityJsonLd` is unchanged (spec: project data on the member page only).

`[slug].astro` — in the `memberPageJsonLd({ works: works.map(...) })` mapping, add:
```ts
    project: (() => {
      const p = member.projects?.find((x) => x.id === w.projectId);
      if (!p) return undefined;
      return {
        id: p.id,
        name: projectTitle(p, currentLang),
        description: projectDescription(p, currentLang),
        url: p.link,
        affiliations: p.affiliations.map((a) =>
          a.memberSlug
            ? { name: a.name, personUrl: memberPageUrl(currentLang, a.memberSlug, Astro.site!.href) }
            : { name: a.name, url: a.href },
        ),
      };
    })(),
```
(import `memberPageUrl` from `seo.ts` — it gives the trailing-slash canonical the Person `@id` needs).

- [ ] **Step 4: Run to see it pass**

Run: `npm run test:unit && npx astro check`
Expected: PASS; ≤ 25.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo.ts tests/unit/seo.test.mjs "src/pages/[...lang]/members/[slug].astro"
git commit -m "feat(seo): projects as CreativeWork nodes their images are part of"
```

---

### Task 9: SortableJS and the strings the editor needs

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: Add the dependency**

Run: `npm install sortablejs && npm install -D @types/sortablejs`
Check the installed major is 1.x and that the lockfile changed only for these two.

- [ ] **Step 2: Strings (en / de)**

```ts
    "profile.project.new": "New project",                         // "Neues Projekt"
    "profile.project.untitled": "Project {n}",                     // "Projekt {n}"
    "profile.project.title": "Title",                              // "Titel"
    "profile.project.title.en": "Title (English)",                 // "Titel (Englisch)"
    "profile.project.title.de": "Title (German)",                  // "Titel (Deutsch)"
    "profile.project.description": "Description",                  // "Beschreibung"
    "profile.project.description.en": "Description (English)",     // "Beschreibung (Englisch)"
    "profile.project.description.de": "Description (German)",      // "Beschreibung (Deutsch)"
    "profile.project.link": "Link",                                // "Link"
    "profile.project.linkNote": "Where the project lives, e.g. a lab page or a paper. Images without their own site link use this one.", // "Wo das Projekt zu finden ist, z. B. eine Laborseite oder ein Paper. Bilder ohne eigenen Website-Link verwenden diesen."
    "profile.project.affiliations": "Affiliations",                // "Beteiligte"
    "profile.project.affiliations.add": "Add affiliation",         // "Beteiligte hinzufügen"
    "profile.project.affiliation.name": "Name",                    // "Name"
    "profile.project.affiliation.member": "VSCN member",           // "VSCN-Mitglied"
    "profile.project.affiliation.namePh": "Institution, lab or partner", // "Institution, Labor oder Partner"
    "profile.project.affiliation.memberPh": "Search members…",     // "Mitglieder suchen…"
    "profile.project.addImages": "Add images to this project",     // "Bilder zu diesem Projekt hinzufügen"
    "profile.project.delete": "Delete project",                    // "Projekt löschen"
    "profile.project.deleteNote": "The images stay in your gallery.", // "Die Bilder bleiben in deiner Galerie."
    "profile.project.drag": "Drag to move",                        // "Ziehen zum Verschieben"
    "profile.project.menu": "More actions",                        // "Weitere Aktionen"
    "profile.project.moveUp": "Move up",                           // "Nach oben"
    "profile.project.moveDown": "Move down",                       // "Nach unten"
    "profile.project.moveTo": "Move to project",                   // "In Projekt verschieben"
    "profile.project.removeFrom": "Remove from project",           // "Aus Projekt entfernen"
    "profile.project.saveFailed": "Project “{name}” could not be saved.", // "Projekt „{name}“ konnte nicht gespeichert werden."
    "profile.project.note": "Group images that belong together. Every field is optional; a project can hold a single image.", // "Fasse zusammengehörige Bilder zusammen. Alle Felder sind optional; ein Projekt kann auch ein einzelnes Bild enthalten."
    "member.project.partOf": "Part of",                            // "Teil von"   (already added in Task 7 if done there — do not duplicate)
    "member.project.with": "With",                                 // "Mit"        (same)
```
Add each to the `en` block with the English text and to the `de` block with the German text in the comment. (Wording is a proposal for Josh to adjust on review.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/i18n/translations.ts
git commit -m "chore(projects): SortableJS and the editor's strings"
```

---

### Task 10: The editor — project blocks, dragging, the ⋯ menu, Save order

> **Dispatch this task to Fable** (judgement task: interaction design inside a 3,700-line component). Tell the implementer to measure rather than comply where this text disagrees with the code, and to report any gate or walk it could not run.

**Files:**
- Modify: `src/components/ProfileForm.astro` — markup around `#gallery-editor` and the item template (~290-515), `renderGallery()` (~2264-2500), the move/remove/upload functions (~2770-2840), `currentViewModel()` (~2921), the load path that calls `loadGallery`, the Save handler (~3337-3400)

**Interfaces:**
- Consumes: everything from Tasks 2, 3, 5, 6, 9: `editorBlocks`, `emptyProjectIds`, `contiguousOrder`, `projectFields`, `inheritedSiteLink`, `ownProjects`; `GalleryItem.projectId`; `galleryQueue.add(files, { projectId })`; `loadProjects`, `saveProjects`, `deleteProjects`, `loadMemberOptions`, `memberSlugs`; `ProfileViewModel.projects`.
- Produces: nothing downstream.

**Editor state** (module-level in the component script, next to `gallery`):
```ts
type EditorProject = ProjectFields & { projectId: string };
let projects: EditorProject[] = [];        // in creation/load order
let storedProjectIds = new Set<string>();   // what Firestore held at load / last Save
let memberOptions: MemberOption[] | null = null; // loaded on first Member-mode focus
let previewSlugs = new Map<string, string>();    // uid → slug for preview credit links
```

**Load:** where the editor calls `loadGallery(uid, stored)`, also `const records = await loadProjects(uid)`; set `projects = records.map(({ ownerUid, ...rest }) => rest)`, `storedProjectIds = new Set(records.map((r) => r.projectId))`, then normalise the gallery so each project's images are adjacent: `gallery = contiguousOrder(gallery, (g) => (g.projectId && storedProjectIds.has(g.projectId) ? g.projectId : undefined))`. If the order changed, call `persistGalleryNow()` once. Resolve preview slugs: `previewSlugs = await memberSlugs(all memberUid in projects' affiliations)` (ignore failure → empty map).

**Markup:**
- Keep `#gallery-editor` as the ONE outer list. Its children are image rows (the existing `data-gallery-tpl="item"` clone, gaining a grip `<button type="button" class="gallery-grip" data-drag-handle aria-hidden="true" tabindex="-1">⠿</button>` at the start and a ⋯ menu in `.gallery-tools` replacing the ↑/↓ buttons; keep the Replace button) and project blocks.
- A new `<template data-gallery-tpl="project">`:
```astro
<section class="gallery-project" data-project-block>
  <header class="gallery-project-head">
    <button type="button" class="gallery-grip" data-drag-handle aria-hidden="true" tabindex="-1">⠿</button>
    <span class="gallery-project-name" data-project-name></span>
    <div class="gallery-menu" data-project-menu><!-- ⋯ button + menu, same component as the row's --></div>
  </header>
  <div class="gallery-project-fields">
    <!-- Title EN/DE and Description EN/DE: reuse the gallery row's EN/DE switch markup and CSS
         (.gallery-lang-switch / .gallery-lang-pane), NOT BilingualField — that component keys on
         fixed ids and this template is cloned per project. -->
    <!-- Link: the https:// prefix wrap, data-project-field="link", + its note (profile.project.linkNote) -->
    <!-- Affiliations: <div data-affiliations></div> + "Add affiliation" button, rows cloned from the
         template below -->
  </div>
  <div class="gallery-project-images" data-project-images></div>
  <label class="btn-outline choose-img">{t("profile.project.addImages")}
    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden data-project-files />
  </label>
</section>
```
- `<template data-gallery-tpl="affiliation">` — one row: a two-button Name | Member switch (reuse `.gallery-lang-btn` styling), a Name mode (`input[data-aff-name]` + https:// prefix `input[data-aff-url]`), a Member mode (`input[data-aff-member]` with a `<datalist>` or a small listbox filled from `memberOptions`, storing the chosen uid in `data-uid`), and a ✕ remove button — the Social Media row's `.social-row` / `.social-row-remove` look.
- A "+ New project" button beside the existing "Add images" label.
- The static project hint (`profile.project.note`) sits once above the list; if the info-tips PR has merged into dev by then, put it behind an `InfoTip` like the other notes; otherwise leave it visible and note that in the PR.

**Rendering:** `renderGallery()` builds the outer list from `editorBlocks(gallery, projects)`: an `image` block → a row for `gallery[index]` (the existing row code, unchanged apart from grip + menu); a `project` block → a project clone whose `[data-project-images]` holds rows for `indices`. The existing caret-restore and focus-restore logic must keep working: extend its lookup to find the row by `data-gallery-index` anywhere in the tree (it uses `closest`/`querySelector`, so it should — verify), and restore focus into project fields by `data-project-id` + field name the same way. Project name shown in the header: `projectTitle(p, lang)` or `s["profile.project.untitled"].replace("{n}", position among untitled + 1)`.

Field wiring follows the rows' pattern: `.value` set from state on clone; `input` listeners write back into `projects[i]` and call `syncPreview()`; never query by id.

**Dragging (SortableJS):**
```ts
import Sortable from "sortablejs";
```
After each render, (re)create instances — destroy the previous ones first (keep them in an array; also destroy on `astro:before-swap`):
```ts
const common = {
  handle: "[data-drag-handle]",
  animation: 150,
  delay: 180,             // touch: a short press on the handle starts the drag
  delayOnTouchOnly: true,
  fallbackOnBody: true,
  swapThreshold: 0.65,
  onEnd: onDragEnd,
};
sortables.push(Sortable.create(galleryEditor, {
  ...common,
  group: { name: "gallery", pull: true, put: true },
}));
galleryEditor.querySelectorAll<HTMLElement>("[data-project-images]").forEach((list) => {
  sortables.push(Sortable.create(list, {
    ...common,
    // Images come and go; a project block can never be dropped inside a project.
    group: { name: "gallery", pull: true, put: (_to, _from, dragged) => !dragged.matches("[data-project-block]") },
  }));
});
```
`onDragEnd` reads the DOM back into state — the DOM is the truth for one moment:
```ts
function onDragEnd() {
  const next: GalleryItem[] = [];
  for (const child of galleryEditor.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.matches("[data-project-block]")) {
      const projectId = child.dataset.projectId!;
      child.querySelectorAll<HTMLElement>("[data-project-images] > [data-gallery-index]").forEach((row) => {
        next.push({ ...gallery[Number(row.dataset.galleryIndex)], projectId });
      });
    } else if (child.dataset.galleryIndex !== undefined) {
      const { projectId: _drop, ...loose } = gallery[Number(child.dataset.galleryIndex)];
      next.push(loose);
    }
  }
  // Empty project blocks the member dragged above images keep no position — they have no image to
  // anchor them — and return to the end on re-render. Acceptable: the block is empty.
  gallery = next;
  renderGallery();
  syncPreview();
  void persistGalleryNow();   // order is stored at once, like the ↑/↓ buttons did; membership at Save
}
```
Also read the empty-project blocks' DOM order back into `projects` order so a dragged empty block keeps its place among other empty blocks.

**⋯ menu** (rows and project headers): a `<button aria-haspopup="menu" aria-expanded>` opening a small list of `<button role="menuitem">`s; Escape and outside click close it; focus returns to the ⋯ button. Row items: *Move up*, *Move down* (within its container — loose list or the project's image list — reusing `moveGalleryImage` semantics on the contiguous range), *Move to project → one item per project*, *Remove from project* (only inside a project; sets `projectId` undefined and moves the item directly after the block's last image). Header items: *Move up*, *Move down* (the whole block past its neighbouring block), *Delete project* (removes it from `projects`, clears `projectId` on its images in place; the project document itself is deleted at Save by `emptyProjectIds`). Every menu action ends with `renderGallery({…focus back on this row's/header's ⋯})`, `syncPreview()` and — when order changed — `persistGalleryNow()`. Remove the old ↑/↓ `focusHint` code only once the menu's focus return replaces it.

**Uploading into a project:** the block's `[data-project-files]` change handler calls the same path as `addGalleryFiles(files)` but with `galleryQueue.add(files, { projectId })`. Generalise `addGalleryFiles(files, target?)`. `onGalleryUploaded(item)` inserts an item that carries `projectId` directly after the last gallery item with that `projectId` (or at the end if none), instead of `push`.

**New project:** `projects.push({ projectId: crypto.randomUUID() })`, render, focus its title input.

**Preview:** `currentViewModel()` adds
```ts
      projects: ownProjects(uid, projects.map((p) => ({ ...p, ownerUid: uid })))
        .filter((p) => gallery.some((g) => g.projectId === p.id))
        .map((p) => resolveMemberCredits(p, previewSlugs)),
```
and each work gains `projectId` and `siteLink: inheritedSiteLink(workLink(g.siteLink), project)` — the same rule `memberView.works()` applies. The member-credit links in the preview use `previewSlugs`; a credit whose member has no current slug renders as plain text, as on the page.

**Save.** Rule: **a project is written only once at least one gallery image names it.** A block the member created but never filled stays local (it survives re-renders, not a reload), so Firestore never holds a project that was empty from birth. The submit handler, BEFORE `saveGalleryRecords(gallery)`:
```ts
        // PROJECTS FIRST (2026-09-23): an image record must never name a
        // project that does not exist yet. Then the records (with projectId),
        // then the profile's order, then the projects no image names any more.
        const used = projects.filter((p) => gallery.some((g) => g.projectId === p.projectId));
        const projectFailures = await saveProjects(user.uid, used, storedProjectIds);
        if (projectFailures.length > 0) {
          projectFailures.forEach((f) => console.warn(`[projects] ${f.projectId} not saved:`, f.error));
          throw new Error(projectFailures.map((f) => {
            const p = projects.find((x) => x.projectId === f.projectId);
            return s["profile.project.saveFailed"].replace("{name}", (p && projectTitle(p, lang)) || untitledLabel(f.projectId));
          }).join(" "));
        }
        for (const p of used) storedProjectIds.add(p.projectId);
```
(`untitledLabel(id)` is the same "Project {n}" label the header shows — factor it out of the header rendering.) AFTER `handleProfileUpdate(...)` succeeds:
```ts
        // Stored projects that no image names any more. A failed delete does
        // not fail the Save: an empty project is invisible (the build skips
        // it) and the next Save tries again.
        const emptied = emptyProjectIds(gallery, projects).filter((id) => storedProjectIds.has(id));
        const deleteFailures = await deleteProjects(emptied);
        deleteFailures.forEach((f) => console.warn(`[projects] ${f.projectId} not deleted:`, f.error));
        for (const id of emptied) {
          if (deleteFailures.some((f) => f.projectId === id)) continue;
          storedProjectIds.delete(id);
          projects = projects.filter((p) => p.projectId !== id);
        }
```
A project the member deleted through the ⋯ menu is already gone from `projects`; its images no longer name it, so include those ids too: keep a `deletedProjectIds: Set<string>` filled by *Delete project* and add `[...deletedProjectIds].filter((id) => storedProjectIds.has(id))` to `emptied`, clearing the set on success.

**Unsaved state:** membership and project fields follow Save. If the component has an unsaved-changes guard, make project edits and membership changes mark it dirty the same way caption edits do (grep for how caption `input` listeners mark dirty).

**Styles** (scoped in `ProfileForm.astro`, beside `.gallery-item`): `.gallery-project` framed (`border: 1px solid var(--color-border); border-radius; padding`), `.gallery-project-images` with the same row gap as `#gallery-editor`, `.gallery-grip` (`cursor: grab; touch-action: none;` — `touch-action: none` on the handle only, so the page still scrolls everywhere else), `.sortable-ghost` / `.sortable-chosen` states (SortableJS adds these classes to the dragged node; they are cloned DOM, so the scoped attribute is present).

- [ ] **Step 1: Implement the state, load and render of project blocks (no dragging yet)**; check in the browser that a stored project renders framed with its images. Commit: `feat(profile): project blocks in the gallery editor`.
- [ ] **Step 2: The ⋯ menus and New/Delete project**; walk the keyboard: Tab to ⋯, Enter, arrow/Tab to an item, Enter, focus returns. Commit: `feat(profile): row and project menus — move, move to project, delete`.
- [ ] **Step 3: SortableJS dragging** with the `onDragEnd` read-back; check drag in, out, within, and a whole block, at desktop and at 375px width with a touch emulation if the pane offers it. Commit: `feat(profile): drag images and project blocks`.
- [ ] **Step 4: Affiliation rows and the member type-ahead**; check Name/Member switch, add/remove, the type-ahead lists visible members. Commit: `feat(profile): project affiliations — names with links, member credits`.
- [ ] **Step 5: Upload into a project, preview wiring, Save order**; check Save writes projects, then records, then profile, and that a project emptied by dragging its last image out disappears from Firestore after Save. Commit: `feat(profile): uploads into a project, preview and Save order`.
- [ ] **Step 6: Gates** — `npm run lint && npx astro check && npm run test:unit`: 0 / ≤ 25 / PASS.

The browser pane cannot reach Firestore (it times out on googleapis — memory `works-on-the-record-restructure`); signed-in walking works through the Playwright MCP's persistent profile (memory `playwright-drives-the-animation-clock`). Use that against a local dev server pointed at the dev project, or defer the signed-in walk to Task 12 on the deployed dev site. Report which of the checks above were actually walked.

---

### Task 11: Integrity checks

**Files:**
- Modify: `scripts/check-integrity.mjs`

- [ ] **Step 1: Implement**

Add `db.collection("projects").get()` to the first `Promise.all` (as `projectsSnap`). After the "Gallery ids — users ↔ publicProfiles" block:
```js
  // PROJECTS (2026-09-23, documentation/20260923-projects-design.md). The rules
  // judge only shape, so what can drift is ownership and existence: a project
  // whose member is gone, an image naming a project that is missing or someone
  // else's, and a project no image names (harmless — the build skips it — but
  // the editor should have deleted it at Save, so worth a note).
  console.log("Projects ↔ owners and images");
  const projectById = new Map(projectsSnap.docs.map((d) => [d.id, d.data()]));
  const named = new Set();
  for (const [id, rec] of imageById) {
    if (!rec.projectId) continue;
    named.add(rec.projectId);
    const project = projectById.get(rec.projectId);
    if (!project) problem(`images/${id}.projectId → projects/${rec.projectId} missing`);
    else if (project.ownerUid !== rec.ownerUid) problem(`images/${id} (${rec.ownerUid}) names projects/${rec.projectId} owned by ${project.ownerUid}`);
  }
  for (const [id, project] of projectById) {
    if (!userIds.has(project.ownerUid) && !inGrace.has(project.ownerUid)) problem(`projects/${id} owner ${project.ownerUid} has no users doc`);
    if (!named.has(id)) note(`projects/${id} holds no images`);
  }
```
(`note` and `problem` are the script's existing helpers — check `note` exists; the file uses it for profile-only identities.)

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/check-integrity.mjs`
Expected: no output. (The script itself needs admin credentials; running it against dev is part of Task 12.)

- [ ] **Step 3: Commit**

```bash
git add scripts/check-integrity.mjs
git commit -m "chore(integrity): projects — owners, dangling projectIds, empty projects"
```

---

### Task 12: Full gate, review, PR to dev, deploy functions, walk it

- [ ] **Step 1: Full gate on the branch**

Run: `npm run lint && npx astro check && npm run test:unit && npm run test:rules && (cd functions && npx tsc --noEmit)`
Expected: 0 / ≤ 25 / PASS / PASS / 0. Report exact counts.

- [ ] **Step 2: Code review** — run the `superpowers:requesting-code-review` flow (or `/code-review high`) on `origin/dev...HEAD`. Fix confirmed findings, one commit each.

- [ ] **Step 3: Update the spec** — `documentation/20260923-projects-design.md`: the Structured data bullet now says images point at the project node via `isPartOf` (the inverse of `hasPart`) and that the community page's JSON-LD is unchanged; the Editor section says never-used empty blocks stay local until they hold an image. Commit.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/projects
gh pr create --base dev --title "Projects: group gallery images, drag to arrange" --body "…"
```
Body: what it does (link the spec), the release order (functions by hand before merge; rules by CI before Hosting), what was verified and what was not. End with the 🤖 attribution line.

- [ ] **Step 5: Deploy functions to dev BEFORE merging** — `purge`, `uploads` (authorizeImageUpload), `adminOps` (adminLookupMember) changed. From the worktree: `$env:FUNCTIONS_DISCOVERY_TIMEOUT = "90"` then `npx -y firebase-tools@latest deploy -P dev --only functions` (plain `firebase` if `npx firebase` fails — memory `site-footer-is-fixed-chrome`). If the dev credential path is blocked, stop and hand Josh the command.

- [ ] **Step 6: Merge into dev when checks are green** (standing permission, memory `merge-into-dev-without-asking`). Gate on `gh pr checks <n> --watch` exit status directly — never piped through `tail` (memory `merge-gate-must-read-exit-code`). Merge with `gh pr merge <n> --merge`. CI deploys rules, then Hosting.

- [ ] **Step 7: Walk it on https://vscn-dev-f4b60.web.app** (signed in via the Playwright MCP profile): create a project with a title, EN+DE description, link, one name affiliation with a link and one member credit; drag two images into it; Save; confirm in the console/admin view that `projects/{id}` and both images' `projectId` landed; wait for the rebuild; open the member page — framed block, heading linked, "With …" line, both images; open the lightbox on one — "Part of …" and the affiliations; check an image without its own site link shows the project's link; drag one image out, Save, check it is loose; delete the project, Save, check the document is gone. Then run `node scripts/check-integrity.mjs -P dev` and read the Projects section. **Josh's iPhone pass** for touch dragging is the one check that must be his — list it in the report.

- [ ] **Step 8: Memory** — write/update `~/.claude/projects/D--SynoDrive-VSCN/memory/projects-reintroduced.md` (+ MEMORY.md line, + mirror in `documentation/agent-memory/`), and mark `projects-feature-withdrawn.md` HISTORICAL with a pointer.

Prod release is a separate, later step and Josh's to run: rules and functions from `main` before the Hosting merge.
