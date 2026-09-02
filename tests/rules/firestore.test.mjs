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
