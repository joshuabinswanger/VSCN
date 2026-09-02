import { test, before, after, beforeEach } from "node:test";
import {
  setupEnv, seed, assertFails, assertSucceeds,
  OWNER, OTHER, ADMIN, verified, minimalUser,
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

test("images: owner edits caption and description", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").update({
    caption: "A cell", description: "Made for a paper.", updatedAt: new Date(),
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

test("images: an unlisted key is rejected (hasOnly)", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1", { projectId: "p" })));
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

test("publicProfiles: gallery items may carry imageId (both shapes accepted)", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  const url = "https://firebasestorage.googleapis.com/v0/b/vscn-dev-f4b60.firebasestorage.app/o/x.webp?alt=media";
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member",
    gallery: [
      { url, caption: "", width: 10, height: 10 },
      { imageId: "img-1", url, caption: "", width: 10, height: 10, color: "#000000" },
    ],
  }));
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
