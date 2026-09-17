// Local emulator evidence only. Passing cases demonstrate the current weaknesses.
// Run from repo root under emulators:exec with demo-vscn-rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { seed, assertSucceeds, assertFails, OWNER, OTHER, verified } from '../../tests/rules/helpers.mjs';

if (process.env.GCLOUD_PROJECT !== 'demo-vscn-rules' || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error('This audit must run against the demo-vscn-rules local emulators.');
}
const env = await initializeTestEnvironment({
  projectId: 'demo-vscn-rules',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 18080 },
  storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 19199 },
});
try {
  await env.clearFirestore();
  await env.clearStorage();
  const owner = env.authenticatedContext(OWNER, verified(OWNER));
  const other = env.authenticatedContext(OTHER, verified(OTHER));
  const anon = env.unauthenticatedContext();

  await seed(env, 'tags/audit-tag', { label: 'Original', createdAt: new Date(), createdBy: OWNER });
  await assertSucceeds(other.firestore().doc('tags/audit-tag').update({ label: 'Changed by another member', active: false, createdBy: OTHER, extra: 'x'.repeat(10000) }));
  console.log('CONFIRMED: another verified member can overwrite and deactivate a shared tag, forge its creator, and add arbitrary fields.');

  await seed(env, `publicProfiles/${OWNER}`, { displayName: 'Hidden test member', active: false });
  await assertSucceeds(anon.firestore().doc(`publicProfiles/${OWNER}`).get());
  console.log('CONFIRMED: anonymous rule context can read an inactive profile.');
  await assertSucceeds(owner.firestore().doc(`publicProfiles/${OWNER}`).update({ active: true }));
  console.log('CONFIRMED: a member can reverse an admin-written active:false flag.');

  for (let i = 0; i < 9; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    await assertSucceeds(owner.storage().ref(`users/${OWNER}/gallery/${id}.webp`).put(new Uint8Array(16), { contentType: 'image/webp' }));
  }
  await env.withSecurityRulesDisabled(async ctx => {
    const imageDocs = await ctx.firestore().collection('images').get();
    assert.equal(imageDocs.size, 0);
  });
  console.log('CONFIRMED: nine uploads accepted with zero image records; bytes are not validated as WebP.');

  await seed(env, `users/${OWNER}`, { email: 'private@example.test', phone: 'test' });
  await assertFails(anon.firestore().doc(`users/${OWNER}`).get());
  await assertFails(other.firestore().doc(`users/${OWNER}`).get());
  console.log('PASS: anonymous and other-member reads of a private user document are rejected.');
} finally {
  await env.clearFirestore();
  await env.clearStorage();
  await env.cleanup();
}
