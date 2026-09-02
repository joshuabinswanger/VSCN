import { test, before, after, beforeEach } from "node:test";
import { setupEnv, assertFails, assertSucceeds, OWNER, OTHER, verified } from "./helpers.mjs";

let env;
before(async () => { env = await setupEnv(); });
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

test("storage: legacy paths are read-only", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(`galleries/${OWNER}/123-abc.webp`).put(webp(64), { contentType: "image/webp" }));
  await assertFails(s.ref(`avatars/${OWNER}-123.webp`).put(webp(64), { contentType: "image/webp" }));
});
