import { test, before, after, beforeEach } from "node:test";
import {
  setupEnv, assertFails, assertSucceeds, OWNER, OTHER, verified, unverified, slot,
} from "./helpers.mjs";

let env;
before(async () => {
  env = await setupEnv();
  // The Storage emulator can answer requests before its ruleset is loaded
  // ("Permission denied because no Storage ruleset is currently loaded"),
  // which fails the first uploads spuriously. Poll a legitimate owner upload
  // until the rules engine answers it, then clear the bucket.
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  const probe = `users/${OWNER}/gallery/00000000-0000-4000-8000-000000000000.webp`;
  let ready = false;
  for (let attempt = 0; attempt < 20 && !ready; attempt += 1) {
    try {
      await s.ref(probe).put(new Uint8Array(16), { contentType: "image/webp" });
      ready = true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!ready) throw new Error("Storage emulator never loaded its ruleset (20 attempts).");
  await env.clearStorage();
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearStorage(); });

const ID = "3f6c2a1e-1b2c-4d5e-8f90-a1b2c3d4e5f6";
const webp = (bytes) => new Uint8Array(bytes);

test("storage: owner uploads a gallery webp under their own prefix", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertSucceeds(s.ref(`users/${OWNER}/gallery/${ID}.webp`).put(webp(1024), { contentType: "image/webp" }));
});

test("storage: owner uploads an avatar webp", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertSucceeds(s.ref(`users/${OWNER}/avatar/${ID}.webp`).put(webp(1024), { contentType: "image/webp" }));
});

test("storage: cannot upload into someone else's prefix", async () => {
  const s = env.authenticatedContext(OTHER, verified(OTHER)).storage();
  await assertFails(s.ref(`users/${OWNER}/gallery/${ID}.webp`).put(webp(1024), { contentType: "image/webp" }));
});

test("storage: unknown kind, non-uuid name, wrong type are rejected", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(`users/${OWNER}/originals/${ID}.webp`).put(webp(1024), { contentType: "image/webp" }));
  await assertFails(s.ref(`users/${OWNER}/gallery/photo.webp`).put(webp(1024), { contentType: "image/webp" }));
  await assertFails(s.ref(`users/${OWNER}/gallery/${ID}.webp`).put(webp(1024), { contentType: "image/png" }));
});

test("storage: avatar capped at 2 MB, gallery at 8 MB", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(`users/${OWNER}/avatar/${ID}.webp`).put(webp(2 * 1024 * 1024 + 1), { contentType: "image/webp" }));
  await assertFails(s.ref(`users/${OWNER}/gallery/${ID}.webp`).put(webp(8 * 1024 * 1024 + 1), { contentType: "image/webp" }));
});

test("storage: public read, owner cannot delete (sweeper does)", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertSucceeds(s.ref(`users/${OWNER}/gallery/${ID}.webp`).put(webp(64), { contentType: "image/webp" }));
  const anon = env.unauthenticatedContext().storage();
  await assertSucceeds(anon.ref(`users/${OWNER}/gallery/${ID}.webp`).getDownloadURL());
  await assertFails(s.ref(`users/${OWNER}/gallery/${ID}.webp`).delete());
});

// The byte-side half of the unverified cap. Storage rules cannot read
// Firestore, so this door is the only thing bounding an unverified sign-up.
test("storage: an unverified member may write their slot object, per kind", async () => {
  const s = env.authenticatedContext(OWNER, unverified(OWNER)).storage();
  const g = `users/${OWNER}/gallery/${slot(OWNER, "gallery")}.webp`;
  await assertSucceeds(s.ref(g).put(webp(1024), { contentType: "image/webp" }));
  await assertSucceeds(s.ref(`users/${OWNER}/avatar/${slot(OWNER, "avatar")}.webp`)
    .put(webp(1024), { contentType: "image/webp" }));
  // Replacing overwrites the same object — that is what makes the cap livable.
  await assertSucceeds(s.ref(g).put(webp(2048), { contentType: "image/webp" }));
});

test("storage: an unverified member cannot write any other filename", async () => {
  const s = env.authenticatedContext(OWNER, unverified(OWNER)).storage();
  await assertFails(s.ref(`users/${OWNER}/gallery/${ID}.webp`)
    .put(webp(1024), { contentType: "image/webp" }));
  // The slot name is per kind: the gallery slot is not a second avatar.
  await assertFails(s.ref(`users/${OWNER}/avatar/${slot(OWNER, "gallery")}.webp`)
    .put(webp(1024), { contentType: "image/webp" }));
  // And it is per uid, so it cannot be borrowed.
  await assertFails(s.ref(`users/${OWNER}/gallery/${slot(OTHER, "gallery")}.webp`)
    .put(webp(1024), { contentType: "image/webp" }));
});

test("storage: the slot stays writable after verification", async () => {
  // The client reads emailVerified off a cached user record, so it can still
  // address the slot for a while after the link is clicked. That must work.
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertSucceeds(s.ref(`users/${OWNER}/gallery/${slot(OWNER, "gallery")}.webp`)
    .put(webp(1024), { contentType: "image/webp" }));
});

test("storage: legacy paths are denied entirely (catch-all)", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(`galleries/${OWNER}/123-abc.webp`).put(webp(64), { contentType: "image/webp" }));
  await assertFails(s.ref(`avatars/${OWNER}-123.webp`).put(webp(64), { contentType: "image/webp" }));
  await assertFails(s.ref(`galleries/${OWNER}/123-abc.webp`).getDownloadURL());
  await assertFails(s.ref(`avatars/${OWNER}-123.webp`).getDownloadURL());
});
