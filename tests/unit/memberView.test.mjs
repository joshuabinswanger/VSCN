// The build's producer of a member's works, fed by records rather than by an
// array of objects since 2026-09-07. What matters here is the mapping onto
// ProfileWork: url derived from the record, texts raw (both locales), link
// filtered for linkability by workLink().
import { test } from "node:test";
import assert from "node:assert/strict";
import { toMemberViewBase } from "../../src/lib/memberView.ts";

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
