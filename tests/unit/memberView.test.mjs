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
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["b", "a"] }, [
    rec("a", { caption: "A", description: "Long A", descriptionDe: "Lang A", link: "nature.com/x" }),
    rec("b", { color: "#112233" }),
  ], BUCKET);
  assert.equal(m.works.length, 2);
  assert.equal(m.works[0].url, `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/users%2F${UID}%2Fgallery%2Fb.webp?alt=media`);
  assert.equal(m.works[0].color, "#112233");
  assert.equal(m.works[1].caption, "A");
  assert.equal(m.works[1].descriptionDe, "Lang A");
  assert.equal(m.works[1].link, "https://nature.com/x");
});

test("a member with ids but no live records has no artwork", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a"] }, [], BUCKET);
  assert.deepEqual(m.works, []);
});

test("records without a bucket or list still type-check as no works", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada" });
  assert.deepEqual(m.works, []);
});
