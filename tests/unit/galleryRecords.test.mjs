// The one join between a profile's id list and its image records, used by the
// browser editor and the Node build alike. Pure on purpose: it is the only
// place the rule "a work is on the site when its id is listed, its record is
// live and its owner matches" is written down, and both callers must agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryIds, orderedGalleryItems, storageUrl } from "../../src/lib/galleryRecords.ts";

const BUCKET = "vscn-dev-f4b60.firebasestorage.app";
const UID = "owner-uid-000001";

function record(imageId, overrides = {}) {
  return {
    imageId,
    ownerUid: UID,
    kind: "gallery",
    status: "live",
    storagePath: `users/${UID}/gallery/${imageId}.webp`,
    width: 1200,
    height: 800,
    color: "#aabbcc",
    ...overrides,
  };
}

test("storageUrl derives the tokenless download URL from the path", () => {
  assert.equal(
    storageUrl(BUCKET, `users/${UID}/gallery/a.webp`),
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/users%2F${UID}%2Fgallery%2Fa.webp?alt=media`,
  );
});

test("galleryIds is the items' ids in order", () => {
  assert.deepEqual(galleryIds([{ imageId: "b" }, { imageId: "a" }]), ["b", "a"]);
});

test("the id list decides the order; the record decides everything else", () => {
  const items = orderedGalleryItems(UID, ["b", "a"], [record("a", { caption: "A" }), record("b", { caption: "B", link: "x.org/1" })], BUCKET);
  assert.deepEqual(items.map((i) => i.imageId), ["b", "a"]);
  assert.equal(items[0].caption, "B");
  assert.equal(items[0].link, "x.org/1");
  assert.equal(items[0].url, storageUrl(BUCKET, `users/${UID}/gallery/b.webp`));
  assert.equal(items[0].width, 1200);
  assert.equal(items[0].color, "#aabbcc");
  assert.equal(items[1].link, undefined);
});

test("an id with no live record is dropped, not rendered broken", () => {
  const items = orderedGalleryItems(UID, ["gone", "a", "dead"], [record("a"), record("dead", { status: "pendingDeletion" })], BUCKET);
  assert.deepEqual(items.map((i) => i.imageId), ["a"]);
});

test("another member's record is dropped even when listed", () => {
  const items = orderedGalleryItems(UID, ["theirs"], [record("theirs", { ownerUid: "other-uid-000002" })], BUCKET);
  assert.deepEqual(items, []);
});

test("avatars and duplicates never become works", () => {
  const items = orderedGalleryItems(UID, ["a", "a", "av"], [record("a"), record("av", { kind: "avatar" })], BUCKET);
  assert.deepEqual(items.map((i) => i.imageId), ["a"]);
});

test("a record with no live text yields a blank caption and absent optionals", () => {
  const [item] = orderedGalleryItems(UID, ["a"], [record("a")], BUCKET);
  assert.equal(item.caption, "");
  assert.equal("captionDe" in item, false);
  assert.equal("description" in item, false);
  assert.equal("link" in item, false);
});

test("MIGRATION WINDOW: an old-shape element is read by its imageId, and its words fill a record that has none", () => {
  const old = { imageId: "a", url: "https://x/y", caption: "From the array", description: "Long", link: "arr.org", width: 1, height: 1 };
  const [item] = orderedGalleryItems(UID, [old], [record("a", { description: "On the record" })], BUCKET);
  assert.equal(item.imageId, "a");
  assert.equal(item.caption, "From the array");
  assert.equal(item.description, "On the record"); // the record wins when it has a value
  assert.equal(item.link, "arr.org");
  assert.equal(item.width, 1200); // geometry is always the record's
});

test("garbage in the list is ignored", () => {
  assert.deepEqual(orderedGalleryItems(UID, [null, 42, {}, ""], [record("a")], BUCKET), []);
  assert.deepEqual(orderedGalleryItems(UID, "not a list", [record("a")], BUCKET), []);
  assert.deepEqual(orderedGalleryItems(UID, undefined, [record("a")], BUCKET), []);
});
