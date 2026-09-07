import { test, before, after, beforeEach } from "node:test";
import {
  setupEnv, seed, assertFails, assertSucceeds,
  OWNER, OTHER, ADMIN, verified, unverified, slot, minimalUser,
} from "./helpers.mjs";

let env;
before(async () => { env = await setupEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

test("users: owner can create their own private doc", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc(`users/${OWNER}`).set(minimalUser(OWNER)));
});

test("users: another member cannot write it", async () => {
  const db = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(db.doc(`users/${OWNER}`).set(minimalUser(OWNER)));
});

test("users: another member cannot read it", async () => {
  await seed(env, `users/${OWNER}`, minimalUser(OWNER));
  const db = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(db.doc(`users/${OWNER}`).get());
});

function imageDoc(uid, imageId, overrides = {}) {
  return {
    ownerUid: uid,
    kind: "gallery",
    storagePath: `users/${uid}/gallery/${imageId}.webp`,
    width: 1200,
    height: 800,
    color: "#aabbcc",
    origin: "member",
    status: "uploading",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("images: anyone can read", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1"));
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(db.doc("images/img-1").get());
});

test("images: owner creates a record in the uploading state", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").set(imageDoc(OWNER, "img-1")));
});

test("images: create must start as uploading", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1", { status: "live" })));
});

test("images: cannot create under someone else's uid", async () => {
  const db = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1")));
});

test("images: storagePath must match owner, kind and id", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").set(
    imageDoc(OWNER, "img-1", { storagePath: `users/${OWNER}/gallery/other.webp` })));
  await assertFails(db.doc("images/img-1").set(
    imageDoc(OWNER, "img-1", { storagePath: `users/${OTHER}/gallery/img-1.webp` })));
});

test("images: client cannot claim curated origin or provenance", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1", { origin: "curated" })));
  await assertFails(db.doc("images/img-1").set(
    imageDoc(OWNER, "img-1", { provenance: { credit: "me" } })));
});

test("images: owner flips uploading → live → pendingDeletion", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1"));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").update({ status: "live", updatedAt: new Date() }));
  await assertSucceeds(db.doc("images/img-1").update({ status: "pendingDeletion", updatedAt: new Date() }));
});

test("images: owner edits caption and both descriptions", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").update({
    caption: "A cell", description: "Made for a paper.",
    descriptionShort: "A cell, drawn for a paper.", updatedAt: new Date(),
  }));
  // The short line has its own ceiling — MAX_GALLERY_DESCRIPTION_SHORT in
  // src/lib/gallery.ts. A long text pasted into it is the mistake this
  // catches, and it must fail rather than silently sit in the band.
  await assertFails(db.doc("images/img-1").update({
    descriptionShort: "x".repeat(241), updatedAt: new Date(),
  }));
});

test("images: descriptionDe shares description's 600-char cap", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").update({
    descriptionDe: "x".repeat(600), updatedAt: new Date(),
  }));
  await assertFails(db.doc("images/img-1").update({
    descriptionDe: "x".repeat(601), updatedAt: new Date(),
  }));
});

test("images: captionDe shares caption's 140-char cap", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").update({
    captionDe: "x".repeat(140), updatedAt: new Date(),
  }));
  await assertFails(db.doc("images/img-1").update({
    captionDe: "x".repeat(141), updatedAt: new Date(),
  }));
});

test("images: ownerUid, kind, storagePath, origin and createdAt are immutable", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").update({ ownerUid: OTHER }));
  await assertFails(db.doc("images/img-1").update({ kind: "avatar" }));
  await assertFails(db.doc("images/img-1").update({ storagePath: `users/${OWNER}/gallery/x.webp` }));
  await assertFails(db.doc("images/img-1").update({ origin: "curated" }));
  await assertFails(db.doc("images/img-1").update({ createdAt: new Date(0) }));
});

test("images: identity pins hold even when the change is self-consistent", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  // ownerUid + storagePath changed together: validImage's derived path check passes; only the ownerUid pin can refuse this.
  await assertFails(db.doc("images/img-1").update({
    ownerUid: OTHER, storagePath: `users/${OTHER}/gallery/img-1.webp`,
  }));
  // kind + storagePath changed together: same reasoning for the kind pin.
  await assertFails(db.doc("images/img-1").update({
    kind: "avatar", storagePath: `users/${OWNER}/avatar/img-1.webp`,
  }));
});

test("images: another member cannot update, nobody can delete", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const other = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(other.doc("images/img-1").update({ caption: "mine now" }));
  const owner = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(owner.doc("images/img-1").delete());
});

// The unverified cap. Rules cannot count documents, so "one image" is spelled
// as "one id": an unverified account may only ever create images/{uid}-{kind}.
test("images: an unverified member may create their slot record", async () => {
  const db = env.authenticatedContext(OWNER, unverified(OWNER)).firestore();
  const id = slot(OWNER, "gallery");
  await assertSucceeds(db.doc(`images/${id}`).set(imageDoc(OWNER, id)));
});

test("images: an unverified member cannot create any other id", async () => {
  const db = env.authenticatedContext(OWNER, unverified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1")));
  await assertFails(db.doc(`images/${slot(OTHER, "gallery")}`).set(
    imageDoc(OWNER, slot(OTHER, "gallery"))));
  // A second slot-shaped id is still a second id.
  await assertFails(db.doc(`images/${slot(OWNER, "gallery")}-2`).set(
    imageDoc(OWNER, `${slot(OWNER, "gallery")}-2`)));
});

test("images: an unverified slot id must name its own kind", async () => {
  const db = env.authenticatedContext(OWNER, unverified(OWNER)).firestore();
  const id = slot(OWNER, "gallery");
  // Self-consistent — storagePath matches the doc id and the kind — and still
  // rejected, because the avatar slot is not called `{uid}-gallery`. Without
  // this, one id would buy an object under each kind.
  await assertFails(db.doc(`images/${id}`).set(imageDoc(OWNER, id, {
    kind: "avatar", storagePath: `users/${OWNER}/avatar/${id}.webp`,
  })));
});

test("images: unverified gets one avatar AND one gallery slot, and may replace them", async () => {
  const db = env.authenticatedContext(OWNER, unverified(OWNER)).firestore();
  const g = slot(OWNER, "gallery");
  const a = slot(OWNER, "avatar");
  await assertSucceeds(db.doc(`images/${g}`).set(imageDoc(OWNER, g)));
  await assertSucceeds(db.doc(`images/${a}`).set(imageDoc(OWNER, a, {
    kind: "avatar", storagePath: `users/${OWNER}/avatar/${a}.webp`,
  })));
  // Replacing the picture is an UPDATE of the same record — the cap bounds how
  // many images exist, not how many times one is changed.
  await assertSucceeds(db.doc(`images/${g}`).update({
    width: 640, height: 480, status: "live", updatedAt: new Date(),
  }));
});

test("images: a verified member is not confined to the slot", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").set(imageDoc(OWNER, "img-1")));
  await assertSucceeds(db.doc("images/img-2").set(imageDoc(OWNER, "img-2")));
});

test("images: an unlisted key is rejected (hasOnly)", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1", { projectId: "p" })));
});

test("images: the record carries where the image appeared", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").update({ link: "onlinelibrary.wiley.com/doi/10.1111/gcb.70195", updatedAt: new Date() }));
  await assertSucceeds(db.doc("images/img-1").update({ link: "x".repeat(200), updatedAt: new Date() }));
  await assertFails(db.doc("images/img-1").update({ link: "x".repeat(201), updatedAt: new Date() }));
  await assertFails(db.doc("images/img-1").update({ link: 42, updatedAt: new Date() }));
});

test("users: an owner update leaves server-owned fields alone and passes", async () => {
  await seed(env, `users/${OWNER}`, {
    ...minimalUser(OWNER), status: "active", purgeAfter: null,
  });
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  // Merge write that does not mention status: the MERGED doc still carries it.
  await assertSucceeds(db.doc(`users/${OWNER}`).set({ bio: "New bio." }, { merge: true }));
});

test("users: client cannot set or change status / deletion fields", async () => {
  await seed(env, `users/${OWNER}`, { ...minimalUser(OWNER), status: "active" });
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc(`users/${OWNER}`).update({ status: "pendingDeletion" }));
  await assertFails(db.doc(`users/${OWNER}`).update({ purgeAfter: new Date() }));
  await assertFails(db.doc(`users/${OWNER}`).update({ deletionRequestedAt: new Date() }));
  // And not on create either.
  const fresh = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(fresh.doc(`users/${OTHER}`).set({ ...minimalUser(OTHER), status: "active" }));
});

test("users/publicProfiles: photoImageId is an accepted string field", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc(`users/${OWNER}`).set({ ...minimalUser(OWNER), photoImageId: "img-a" }));
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member", photoURL: "", photoImageId: "img-a", gallery: [],
  }));
});

test("publicProfiles: the gallery is a list of image ids, and nothing else", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  const save = (gallery) => db.doc(`publicProfiles/${OWNER}`).set({ displayName: "Test Member", gallery });

  await assertSucceeds(save([]));
  await assertSucceeds(save(["img-1"]));
  await assertSucceeds(save(["img-1", "img-2", "img-3", "img-4", "img-5", "img-6", "img-7", "img-8"]));
  await assertSucceeds(save([`${OWNER}-gallery`]));
  await assertSucceeds(save([crypto.randomUUID()]));

  // A ninth is refused: the cap is the list's own size.
  await assertFails(save(["1", "2", "3", "4", "5", "6", "7", "8", "9"]));
  // THE OLD SHAPE is refused outright (2026-09-07 — the record is the work,
  // documentation/20260907-works-on-the-record-design.md). A stale tab that
  // still writes objects fails safe rather than re-growing the array.
  const url = "https://firebasestorage.googleapis.com/v0/b/vscn-dev-f4b60.firebasestorage.app/o/x.webp?alt=media";
  await assertFails(save([{ imageId: "img-1", url, caption: "", width: 10, height: 10 }]));
  await assertFails(save([""]));
  await assertFails(save(["x".repeat(65)]));
  await assertFails(save([42]));
});

test("publicProfiles: eight ids save on a FULL profile", async () => {
  // The whole reason for the shape change: validGalleryItem could not be
  // afforded eight times on a realistic profile (see
  // documentation/20260903-gallery-rules-budget.md). Eight ids must fit next
  // to every other field the editor writes.
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "x".repeat(100), photoURL: "", photoImageId: "img-a", photoColor: "#123456",
    memberType: "creator", role: "x".repeat(100),
    bio: Array.from({ length: 35 }, () => "word").join(" "),
    portfolio: "x".repeat(200), socialMedia: "x".repeat(500),
    affiliation: "x".repeat(150), location: "x".repeat(100),
    languages: ["de", "en", "fr", "it"], visualNeeds: ["a", "b", "c", "d", "e", "f", "g", "h"],
    openTo: ["a", "b", "c", "d", "e"], primaryAudiences: [], tags: ["a", "b", "c", "d", "e", "f", "g"],
    gallery: Array.from({ length: 8 }, () => crypto.randomUUID()),
    active: true,
  }));
  await assertSucceeds(db.doc(`users/${OWNER}`).set({
    ...minimalUser(OWNER),
    displayName: "x".repeat(100), role: "x".repeat(100),
    bio: Array.from({ length: 35 }, () => "word").join(" "),
    portfolio: "x".repeat(200), socialMedia: "x".repeat(500),
    affiliation: "x".repeat(150), location: "x".repeat(100),
    languages: ["de", "en", "fr", "it"], visualNeeds: ["a", "b", "c", "d", "e", "f", "g", "h"],
    openTo: ["a", "b", "c", "d", "e"], tags: ["a", "b", "c", "d", "e", "f", "g"],
    gallery: Array.from({ length: 8 }, () => crypto.randomUUID()),
    phone: "x".repeat(40), wantsToContribute: true, onboardingComplete: true,
  }));
});

test("publicProfiles: another member's image id is accepted by rules — the READER drops it", async () => {
  // Rules cannot look up eight records per save. orderedGalleryItems() in
  // src/lib/galleryRecords.ts requires ownerUid == uid, so a foreign id is
  // never rendered. Written down here so nobody "fixes" the rule.
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({ displayName: "Test Member", gallery: ["someone-elses-id"] }));
});

test("users: email is server-written — absent on create, unchanged on update", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc(`users/${OWNER}`).set({ ...minimalUser(OWNER), email: `${OWNER}@example.test` }));
  await seed(env, `users/${OWNER}`, { ...minimalUser(OWNER), email: "stored@example.test" });
  await assertSucceeds(db.doc(`users/${OWNER}`).set({ bio: "still fine" }, { merge: true }));
  await assertFails(db.doc(`users/${OWNER}`).update({ email: "other@example.test" }));
});

test("users/publicProfiles: owners cannot delete their own docs (purge does)", async () => {
  await seed(env, `users/${OWNER}`, minimalUser(OWNER));
  await seed(env, `publicProfiles/${OWNER}`, { displayName: "Test Member" });
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc(`users/${OWNER}`).delete());
  await assertFails(db.doc(`publicProfiles/${OWNER}`).delete());
});

test("slugs: public read, no client write", async () => {
  await seed(env, "slugs/test-member", { uid: OWNER, current: true, createdAt: new Date() });
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(anon.doc("slugs/test-member").get());
  const owner = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(owner.doc("slugs/mine").set({ uid: OWNER, current: true, createdAt: new Date() }));
});

test("deletions/adminActions: admin reads, nobody writes, members cannot read", async () => {
  await seed(env, `deletions/${OWNER}`, { uid: OWNER, completedAt: null });
  await seed(env, "adminActions/a1", { actorUid: ADMIN, action: "x", targetUid: OWNER });
  const admin = env.authenticatedContext(ADMIN, verified(ADMIN, { admin: true })).firestore();
  await assertSucceeds(admin.doc(`deletions/${OWNER}`).get());
  await assertSucceeds(admin.collection("adminActions").get());
  await assertFails(admin.doc(`deletions/${OWNER}`).update({ completedAt: new Date() }));
  await assertFails(admin.collection("adminActions").add({ actorUid: ADMIN }));
  const owner = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(owner.doc(`deletions/${OWNER}`).get());
  await assertFails(owner.collection("adminActions").get());
});

test("admin: reads every users doc but cannot write one", async () => {
  await seed(env, `users/${OWNER}`, minimalUser(OWNER));
  const admin = env.authenticatedContext(ADMIN, verified(ADMIN, { admin: true })).firestore();
  await assertSucceeds(admin.doc(`users/${OWNER}`).get());
  await assertSucceeds(admin.collection("users").get());
  await assertFails(admin.doc(`users/${OWNER}`).update({ bio: "admin was here" }));
});

test("onboardingRequests: admin can list, member cannot", async () => {
  await seed(env, `onboardingRequests/${OWNER}`, { userId: OWNER, message: "hi", lang: "en" });
  const admin = env.authenticatedContext(ADMIN, verified(ADMIN, { admin: true })).firestore();
  await assertSucceeds(admin.collection("onboardingRequests").get());
  const owner = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(owner.collection("onboardingRequests").get());
  await assertSucceeds(owner.doc(`onboardingRequests/${OWNER}`).get());
});
