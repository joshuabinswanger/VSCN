import { test, before, after, beforeEach } from "node:test";
import {
  setupEnv, seed, assertFails, assertSucceeds, OWNER, OTHER, verified, unverified, slot,
} from "./helpers.mjs";

const ID = "3f6c2a1e-1b2c-4d5e-8f90-a1b2c3d4e5f6";
const webp = (bytes) => new Uint8Array(bytes);
const staged = (kind, id) => `pending/${OWNER}/${kind}/${id}.webp`;
const published = (kind, id) => `users/${OWNER}/${kind}/${id}.webp`;
let env;

async function permit(kind, id, expiresAt = new Date(Date.now() + 60_000)) {
  await seed(env, `uploadPermits/${id}.webp`, {
    imageId: id, ownerUid: OWNER, kind, storagePath: published(kind, id), uploadPath: staged(kind, id), expiresAt,
  });
  await seed(env, `images/${id}`, {
    ownerUid: OWNER, kind, storagePath: published(kind, id), status: "uploading",
  });
}

before(async () => {
  env = await setupEnv();
  // Wait for the Storage emulator rules engine to load before the tests run.
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  const id = "00000000-0000-4000-8000-000000000000";
  await permit("gallery", id);
  let ready = false;
  for (let attempt = 0; attempt < 20 && !ready; attempt += 1) {
    try {
      await s.ref(staged("gallery", id)).put(webp(16), { contentType: "image/webp" });
      ready = true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!ready) throw new Error("Storage emulator never loaded its ruleset.");
  await env.clearStorage();
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearStorage();
  await env.clearFirestore();
  await permit("gallery", ID);
  await permit("gallery", slot(OWNER, "gallery"));
  await permit("avatar", slot(OWNER, "avatar"));
});

test("storage: unreserved and expired uploads are rejected", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(staged("gallery", "00000000-0000-4000-8000-000000000001"))
    .put(webp(64), { contentType: "image/webp" }));
  await permit("gallery", ID, new Date(0));
  await assertFails(s.ref(staged("gallery", ID)).put(webp(64), { contentType: "image/webp" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc(`uploadPermits/${ID}.webp`).update({ expiresAt: new Date(Date.now() + 60_000) }));
});

test("storage: member upload stays private and cannot write the public path", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertSucceeds(s.ref(staged("gallery", ID)).put(webp(1024), { contentType: "image/webp" }));
  const anon = env.unauthenticatedContext().storage();
  await assertFails(anon.ref(staged("gallery", ID)).getDownloadURL());
  await assertFails(s.ref(published("gallery", ID)).put(webp(1024), { contentType: "image/webp" }));
});

test("storage: a published record cannot be reuploaded even with a permit", async () => {
  await seed(env, `images/${ID}`, {
    ownerUid: OWNER, kind: "gallery", storagePath: published("gallery", ID), status: "live",
  });
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(staged("gallery", ID)).put(webp(64), { contentType: "image/webp" }));
});

test("storage: avatar uploads remain available in private staging", async () => {
  await permit("avatar", ID);
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertSucceeds(s.ref(staged("avatar", ID)).put(webp(1024), { contentType: "image/webp" }));
});

test("storage: another member cannot upload to the owner's prefix", async () => {
  const s = env.authenticatedContext(OTHER, verified(OTHER)).storage();
  await assertFails(s.ref(staged("gallery", ID)).put(webp(1024), { contentType: "image/webp" }));
});

test("storage: unknown kind, filename, and MIME type are rejected", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(staged("originals", ID)).put(webp(1024), { contentType: "image/webp" }));
  await assertFails(s.ref(staged("gallery", "photo")).put(webp(1024), { contentType: "image/webp" }));
  await assertFails(s.ref(staged("gallery", ID)).put(webp(1024), { contentType: "image/png" }));
});

test("storage: avatar capped at 2 MB and gallery at 8 MB", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await permit("avatar", ID);
  await assertFails(s.ref(staged("avatar", ID)).put(webp(2 * 1024 * 1024 + 1), { contentType: "image/webp" }));
  await permit("gallery", ID);
  await assertFails(s.ref(staged("gallery", ID)).put(webp(8 * 1024 * 1024 + 1), { contentType: "image/webp" }));
});

test("storage: server-promoted files are public, but members cannot delete them", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(published("gallery", ID)).put(webp(64), { contentType: "image/webp" });
  });
  const anon = env.unauthenticatedContext().storage();
  await assertSucceeds(anon.ref(published("gallery", ID)).getDownloadURL());
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(published("gallery", ID)).delete());
});

test("storage: unverified member may replace one slot per kind", async () => {
  const s = env.authenticatedContext(OWNER, unverified(OWNER)).storage();
  const gallery = staged("gallery", slot(OWNER, "gallery"));
  await assertSucceeds(s.ref(gallery).put(webp(1024), { contentType: "image/webp" }));
  await assertSucceeds(s.ref(staged("avatar", slot(OWNER, "avatar")))
    .put(webp(1024), { contentType: "image/webp" }));
  await assertSucceeds(s.ref(gallery).put(webp(2048), { contentType: "image/webp" }));
});

test("storage: unverified member cannot use another filename or slot", async () => {
  const s = env.authenticatedContext(OWNER, unverified(OWNER)).storage();
  await assertFails(s.ref(staged("gallery", ID)).put(webp(1024), { contentType: "image/webp" }));
  await assertFails(s.ref(staged("avatar", slot(OWNER, "gallery")))
    .put(webp(1024), { contentType: "image/webp" }));
  await assertFails(s.ref(staged("gallery", slot(OTHER, "gallery")))
    .put(webp(1024), { contentType: "image/webp" }));
});

test("storage: a verified member may still use the slot", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertSucceeds(s.ref(staged("gallery", slot(OWNER, "gallery")))
    .put(webp(1024), { contentType: "image/webp" }));
});

test("storage: legacy paths remain denied", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(`galleries/${OWNER}/123-abc.webp`).put(webp(64), { contentType: "image/webp" }));
  await assertFails(s.ref(`avatars/${OWNER}-123.webp`).put(webp(64), { contentType: "image/webp" }));
  await assertFails(s.ref(`galleries/${OWNER}/123-abc.webp`).getDownloadURL());
  await assertFails(s.ref(`avatars/${OWNER}-123.webp`).getDownloadURL());
});
