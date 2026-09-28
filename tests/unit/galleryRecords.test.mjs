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

test("galleryIds drops an item with no id — never a blank element in the stored list", () => {
  assert.deepEqual(galleryIds([{ imageId: "a" }, { imageId: "" }]), ["a"]);
});

test("the id list decides the order; the record decides everything else", () => {
  const items = orderedGalleryItems(UID, ["b", "a"], [record("a", { caption: "A" }), record("b", { caption: "B", link: "x.org/1", siteLink: "me.ch/w/1" })], BUCKET);
  assert.deepEqual(items.map((i) => i.imageId), ["b", "a"]);
  assert.equal(items[0].caption, "B");
  assert.equal(items[0].link, "x.org/1");
  assert.equal(items[0].siteLink, "me.ch/w/1");
  assert.equal(items[0].url, storageUrl(BUCKET, `users/${UID}/gallery/b.webp`));
  assert.equal(items[0].width, 1200);
  assert.equal(items[0].color, "#aabbcc");
  assert.equal(items[1].link, undefined);
  assert.equal("siteLink" in items[1], false);
});

test("an id with no live record is dropped, not rendered broken", () => {
  const items = orderedGalleryItems(UID, ["gone", "a", "dead"], [record("a"), record("dead", { status: "pendingDeletion" })], BUCKET);
  assert.deepEqual(items.map((i) => i.imageId), ["a"]);
});

test("a zero dimension is not renderable — the card's frame would collapse", () => {
  assert.deepEqual(orderedGalleryItems(UID, ["a"], [record("a", { width: 0 })], BUCKET), []);
  assert.deepEqual(orderedGalleryItems(UID, ["a"], [record("a", { height: 0 })], BUCKET), []);
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

test("tags ride the join from the record", () => {
  const [item] = orderedGalleryItems(UID, ["a"], [record("a", { tags: ["Botany", "Ink"] })], BUCKET);
  assert.deepEqual(item.tags, ["Botany", "Ink"]);
});

test("no tags on the record is absent on the item, not an empty list", () => {
  const [item] = orderedGalleryItems(UID, ["a"], [record("a")], BUCKET);
  assert.equal("tags" in item, false);
});

test("garbage in the list is ignored", () => {
  assert.deepEqual(orderedGalleryItems(UID, [null, 42, {}, ""], [record("a")], BUCKET), []);
  assert.deepEqual(orderedGalleryItems(UID, "not a list", [record("a")], BUCKET), []);
  assert.deepEqual(orderedGalleryItems(UID, undefined, [record("a")], BUCKET), []);
});

test("a video work carries its embed and poster source; the poster is still the url", () => {
  const embed = { provider: "vimeo", videoId: "22439234", hash: "a1b2c3d4e5" };
  const [item] = orderedGalleryItems(UID, ["v"], [record("v", {
    media: "embed", embed, posterSource: "member", createdAt: "2026-09-23T10:00:00.000Z",
  })], BUCKET);
  assert.deepEqual(item.embed, embed);
  assert.equal(item.posterSource, "member");
  assert.equal(item.addedAt, "2026-09-23T10:00:00.000Z");
  assert.equal(item.url, storageUrl(BUCKET, `users/${UID}/gallery/v.webp`));
});

test("the record's projectId rides onto the item; absent stays absent", () => {
  const items = orderedGalleryItems(UID, ["a", "b"], [record("a", { projectId: "p1" }), record("b")], BUCKET);
  assert.equal(items[0].projectId, "p1");
  assert.equal("projectId" in items[1], false);
});

test("a record that claims to be a video without a playable id is shown as the still it is", () => {
  const items = orderedGalleryItems(UID, ["a", "b", "c"], [
    record("a", { media: "embed", embed: { provider: "youtube", videoId: "../evil" } }),
    record("b", { media: "embed" }),
    record("c", { embed: { provider: "youtube", videoId: "dQw4w9WgXcQ" } }),
  ], BUCKET);
  assert.equal(items.length, 3);
  assert.equal(items.some((item) => "embed" in item || "posterSource" in item), false);
});
