import { test, before, after, beforeEach } from "node:test";
import {
  setupEnv, seed, assertFails, assertSucceeds,
  OWNER, OTHER, verified, minimalUser,
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
