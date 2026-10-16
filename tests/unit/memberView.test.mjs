// The build's producer of a member's works, fed by records rather than by an
// array of objects since 2026-09-07. What matters here is the mapping onto
// ProfileWork: url derived from the record, texts raw (both locales), link
// filtered for linkability by workLink().
import { test } from "node:test";
import assert from "node:assert/strict";
import { localizeMember, toMemberViewBase } from "../../src/lib/memberView.ts";

const UID = "owner-uid-000001";
const BUCKET = "vscn-dev-f4b60.firebasestorage.app";
const rec = (imageId, extra = {}) => ({
  imageId, ownerUid: UID, kind: "gallery", status: "live",
  storagePath: `users/${UID}/gallery/${imageId}.webp`, width: 1200, height: 800, ...extra,
});

test("works come from the records, in the list's order", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["b", "a", "c"] }, [
    rec("a", { caption: "A", description: "Long A", descriptionDe: "Lang A", link: "nature.com/x", siteLink: "ada.ch/work/x" }),
    rec("b", { color: "#112233" }),
    rec("c", { link: "not a link", siteLink: "also not one" }),
  ], BUCKET);
  assert.equal(m.works.length, 3);
  assert.equal(m.works[0].url, `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/users%2F${UID}%2Fgallery%2Fb.webp?alt=media`);
  assert.equal(m.works[0].color, "#112233");
  assert.equal(m.works[1].caption, "A");
  assert.equal(m.works[1].descriptionDe, "Lang A");
  assert.equal(m.works[1].link, "https://nature.com/x");
  assert.equal(m.works[1].siteLink, "https://ada.ch/work/x");
  assert.equal(m.works[2].link, undefined);
  assert.equal(m.works[2].siteLink, undefined);
});

test("a work carries its own tags", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a"] }, [
    rec("a", { tags: ["Botany", "Ink"] }),
  ], BUCKET);
  assert.deepEqual(m.works[0].tags, ["Botany", "Ink"]);
});

test("a work with no tags on its record has an empty list, not undefined", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a"] }, [rec("a")], BUCKET);
  assert.deepEqual(m.works[0].tags, []);
});

test("a member with ids but no live records has no artwork", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a"] }, [], BUCKET);
  assert.deepEqual(m.works, []);
});

test("records without a bucket or list still type-check as no works", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada" });
  assert.deepEqual(m.works, []);
});

// THE PRIORITY REACHES THE WORK. membersBuild attaches the snapshot's
// moderation row to the RECORD; works() reads it back off the record after
// orderedGalleryItems() has done the ordering, which is what lets the wall be
// ranked while /members/<slug> keeps the member's own order.
test("a work carries its priority and whether moderation hid it", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a", "b"] }, [
    rec("a", { caption: "a", score: 91, hidden: false }),
    rec("b", { caption: "b", score: 12, hidden: true }),
  ], BUCKET);
  assert.deepEqual(m.works.map((w) => [w.score, w.hidden]), [[91, false], [12, true]]);
});

// THE MEMBER'S OWN SWITCH (2026-10-16): `inGallery: false` on the record
// takes the work off /community the same way moderation does, and keeps it in
// the member's own list (still a work here, so /members/<slug> renders it).
test("a work the member took out of the gallery is hidden from /community but still a work", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a", "b", "c"] }, [
    rec("a", { caption: "a" }),
    rec("b", { caption: "b", inGallery: false }),
    rec("c", { caption: "c", inGallery: true }),
  ], BUCKET);
  assert.deepEqual(m.works.map((w) => [w.caption, w.hidden]), [["a", false], ["b", true], ["c", false]]);
});

test("a record with no moderation row still scores, so nothing sorts as zero", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a"] }, [rec("a")], BUCKET);
  // 100 * (0.85 * 2.5 + 0.15 * 0) / 5 — neutral on the three human criteria,
  // its real (empty) completeness on the fourth.
  assert.equal(m.works[0].score, 43);
  assert.equal(m.works[0].hidden, false);
});

test("the fallback score reads the record, so a documented picture edges ahead", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a"] }, [
    rec("a", {
      caption: "A", captionDe: "A", description: "B", descriptionDe: "B",
      tags: ["Botany"], link: "nature.com/x",
    }),
  ], BUCKET);
  assert.equal(m.works[0].score, 58);
});

// The German role and bio (2026-09-23): carried raw by the shared base, picked
// per page by localizeMember(), with a fallback in BOTH directions.
test("localizeMember picks the German role and bio on German pages, and the caption follows", () => {
  const m = toMemberViewBase(UID, {
    displayName: "Ada", role: "Illustrator", roleDe: " Illustratorin ",
    bio: "Draws cells. Also engines.", bioDe: "Zeichnet Zellen. Auch Motoren.",
  });
  assert.equal(m.roleDe, "Illustratorin");
  const de = localizeMember(m, "de");
  assert.equal(de.role, "Illustratorin");
  assert.equal(de.bio, "Zeichnet Zellen. Auch Motoren.");
  assert.equal(de.caption, "Zeichnet Zellen.");
  const en = localizeMember(m, "en");
  assert.equal(en.role, "Illustrator");
  assert.equal(en.bio, "Draws cells. Also engines.");
  assert.equal(en.caption, "Draws cells.");
  // The shared base is not mutated — the other locale's page reads it too.
  assert.equal(m.role, "Illustrator");
});

test("localizeMember falls back to whichever language was written", () => {
  const enOnly = toMemberViewBase(UID, { displayName: "Ada", role: "Illustrator", bio: "Draws cells." });
  assert.equal(enOnly.roleDe, undefined);
  assert.equal(localizeMember(enOnly, "de").role, "Illustrator");
  assert.equal(localizeMember(enOnly, "de").bio, "Draws cells.");
  const deOnly = toMemberViewBase(UID, { displayName: "Ada", role: "", roleDe: "Illustratorin", bio: "  ", bioDe: "Zeichnet Zellen." });
  assert.equal(localizeMember(deOnly, "en").role, "Illustratorin");
  assert.equal(localizeMember(deOnly, "en").bio, "Zeichnet Zellen.");
  const none = toMemberViewBase(UID, { displayName: "Ada" });
  assert.equal(localizeMember(none, "de").role, "");
  assert.equal(localizeMember(none, "de").bio, "");
});

// PROJECTS (2026-09-23): works() attaches the member's own project id, and the
// project's link fills an empty siteLink — inheritedSiteLink() in
// projects.ts. toMemberViewBase's fifth argument is the snapshot's project
// records for this owner; ownProjects() filters to the member's own before
// works() ever sees them, so someone else's projectId on a record is ignored.
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
  // Someone else's project is no project: the work is filed under "Works"
  // (2026-10-16), never shown project-less.
  assert.equal(m.works[2].projectId, `works-${UID}`);
  assert.deepEqual(m.projects.map((p) => p.id), ["p", `works-${UID}`]);
});

// EVERY WORK IN A PROJECT (2026-10-16, Josh: "images without project are not
// allowed any longer!"). Old data with loose works reads as a virtual
// "Works" / "Arbeiten" project, localized by projectTitle().
test("loose works join a virtual Works project; no records at all means one project", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a"] }, [rec("a")], BUCKET);
  assert.equal(m.works[0].projectId, `works-${UID}`);
  assert.equal(m.projects.length, 1);
  assert.equal(m.projects[0].title, "Works");
  assert.equal(m.projects[0].titleDe, "Arbeiten");
});

test("a member whose works are all in projects gets no virtual project", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a"] }, [rec("a", { projectId: "p" })], BUCKET, [
    { projectId: "p", ownerUid: UID, title: "P" },
  ]);
  assert.deepEqual(m.projects.map((p) => p.id), ["p"]);
});

test("no works means no projects", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada" }, [], BUCKET);
  assert.deepEqual(m.projects, []);
});
