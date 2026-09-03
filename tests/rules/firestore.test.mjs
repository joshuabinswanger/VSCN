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

test("publicProfiles: the array check is the key list, the bucket and the link", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  const url = "https://firebasestorage.googleapis.com/v0/b/vscn-dev-f4b60.firebasestorage.app/o/x.webp?alt=media";
  const save = (gallery) => db.doc(`publicProfiles/${OWNER}`).set({ displayName: "Test Member", gallery });

  await assertSucceeds(save([{ imageId: "img-1", url, caption: "", width: 10, height: 10 }]));

  // AN UNLISTED KEY still takes the whole write down. This is the one check
  // that cannot move anywhere else: it is what stops a withdrawn field
  // (`projectId`, once) creeping back in through a stale client.
  await assertFails(save([{ imageId: "img-1", url, descriptionLong: "nope", width: 10, height: 10 }]));

  // THE BUCKET, because this url is what the community wall renders. An
  // off-site one would turn the directory into a hotlink to anywhere.
  await assertFails(save([{ imageId: "img-1", url: "https://evil.example.com/x.webp", width: 10, height: 10 }]));
  await assertFails(save([{ imageId: "img-1", width: 10, height: 10 }]));

  // What the array NO LONGER judges, because validGalleryItem could not afford
  // to judge it eight times over: imageId, the text lengths, the colour and the
  // dimensions. Every one of them is enforced on images/{imageId} instead —
  // see the `images:` tests above — and by the client before either write. A
  // profile whose array disagrees with its records renders from the records.
  await assertSucceeds(save([{ url, caption: "", width: 10, height: 10 }]));
});

test("publicProfiles: both descriptions ride along in the array, uncapped there", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  const url = "https://firebasestorage.googleapis.com/v0/b/vscn-dev-f4b60.firebasestorage.app/o/x.webp?alt=media";
  const item = (extra) => ({ imageId: "img-1", url, caption: "", width: 10, height: 10, ...extra });
  const save = (gallery) => db.doc(`publicProfiles/${OWNER}`).set({ displayName: "Test Member", gallery });

  // Both keys are in validGalleryItem's hasOnly list, so both travel in the
  // array the editor writes back whole.
  await assertSucceeds(save([item({ description: "x".repeat(600), descriptionShort: "x".repeat(240) })]));

  // Their CEILINGS are enforced on images/{imageId} (see "images: owner edits
  // caption and both descriptions") and in the client, not here. Asserting the
  // over-long value SUCCEEDS is deliberate: it is the price of eight images,
  // written down where someone tightening this rule will trip over it.
  await assertSucceeds(save([item({ descriptionShort: "x".repeat(241) })]));

  // The key list is still the key list.
  await assertFails(save([item({ descriptionLong: "nope" })]));
});

test("publicProfiles: a gallery item may say where the image appeared", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  const url = "https://firebasestorage.googleapis.com/v0/b/vscn-dev-f4b60.firebasestorage.app/o/x.webp?alt=media";
  const item = (extra) => ({ imageId: "img-1", url, caption: "", width: 10, height: 10, ...extra });

  // THE SHAPE THE EDITOR ACTUALLY WRITES, all four text fields at once. The
  // gallery is one field of one write, so a single unlisted key inside it
  // rejects the entire profile save with a message that names nothing — which
  // is precisely what `link` did between landing in the client and landing in
  // a deployed ruleset.
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member",
    gallery: [item({
      caption: "A short one",
      descriptionShort: "A bit longer.",
      description: "The paragraph that only the profile page shows.",
      link: "https://onlinelibrary.wiley.com/doi/10.1111/gcb.70195",
    })],
  }));

  // An emptied box is still a string: the editor writes back what it holds.
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member", gallery: [item({ link: "" })],
  }));

  // Only LENGTH is judged here. Whether a value is linkable is the read path's
  // question (workLink in src/lib/links.ts), so nonsense saves and simply does
  // not render — a rule that rejected it would fail the save over a typo.
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member", gallery: [item({ link: "not a url at all" })],
  }));

  // Mirror of MAX_GALLERY_LINK. The client caps the input; this is the door.
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member", gallery: [item({ link: "x".repeat(200) })],
  }));
  await assertFails(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member", gallery: [item({ link: "x".repeat(201) })],
  }));
  await assertFails(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member", gallery: [item({ link: 12 })],
  }));
});

test("users + publicProfiles: a MAXIMAL profile saves a FULL gallery", async () => {
  // THE TEST THAT WAS MISSING, twice over.
  //
  // Rules evaluation has a budget; validGallery spends it eight times; and a
  // fixture that is merely "realistic" understates it. The first version of
  // this test used a profile with three tags and two audiences, passed 8/8, and
  // was WRONG: the same rules gave a member with full lists four images. So
  // every list here sits at its cap and every string at its ceiling, because
  // the only number worth asserting is the one that holds for the member who
  // filled everything in.
  //
  // Both documents, because updateUserProfile writes both and users/{uid}
  // carries three fields more — it runs out first, and it is the one a member
  // actually hits.
  //
  // If this starts failing, something in validPublicFields, validPrivateUser or
  // validGalleryItem has grown, and something else must come out. There is no
  // warning in production: a member simply loses an image, with a bare
  // permission error. See documentation/20260903-gallery-rules-budget.md.
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  const url = (n) => `https://firebasestorage.googleapis.com/v0/b/vscn-dev-f4b60.firebasestorage.app/o/users%2F${OWNER}%2Fgallery%2F${n}.webp?alt=media`;
  const item = (n) => ({
    imageId: `img-${n}`, url: url(n), caption: "x".repeat(140),
    description: "x".repeat(600), descriptionShort: "x".repeat(240),
    link: "x".repeat(200), width: 2400, height: 1800, color: "#e8c4b4",
  });
  const gallery = Array.from({ length: 8 }, (_, i) => item(i));

  const publicMax = {
    displayName: "x".repeat(100),
    photoURL: url("avatar"), photoImageId: "x".repeat(40), photoColor: "#ffffff",
    memberType: "both", role: "x".repeat(100),
    // 35 words is validBioWordCount's ceiling; long words take it to 500 chars.
    bio: Array.from({ length: 35 }, () => "wordwordword").join(" "),
    portfolio: "x".repeat(200), socialMedia: "x".repeat(500),
    affiliation: "x".repeat(150), location: "x".repeat(100),
    languages: ["de", "en", "fr", "it"],
    visualNeeds: ["a", "b", "c", "d", "e", "f", "g", "h"],
    openTo: ["a", "b", "c", "d", "e"],
    primaryAudiences: ["science", "public", "policy-makers", "education"],
    tags: ["a", "b", "c", "d", "e", "f", "g"],
    active: false,
    gallery,
  };
  // `active` is public-only — it is not in validPrivateUser's allowlist, and
  // leaving it here would reject the private write for the wrong reason.
  const { active, ...rest } = publicMax;
  const privateMax = { ...rest, phone: "x".repeat(40), wantsToContribute: true, onboardingComplete: true };

  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set(publicMax));
  await assertSucceeds(db.doc(`users/${OWNER}`).set(privateMax));
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
