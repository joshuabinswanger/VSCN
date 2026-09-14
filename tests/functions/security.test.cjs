const { test, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.GCLOUD_PROJECT !== 'demo-vscn-rules' || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
  throw new Error('These tests require the local demo Firestore emulator.');
}
const { db } = require('../../functions/lib/admin.js');
const rebuild = require('../../functions/lib/rebuild.js');
const { queueMemberRebuild, flushMemberRebuilds } = require('../../functions/lib/rebuildQueue.js');
const { adminSetProfileActive } = require('../../functions/lib/adminOps.js');
const adminModule = require('../../functions/lib/admin.js');
const { authorizeImageUpload } = require('../../functions/lib/uploads.js');
const backendRequire = require('node:module').createRequire(require('node:path').resolve('functions/package.json'));
const { Timestamp } = backendRequire('firebase-admin/firestore');
beforeEach(async () => {
  mock.restoreAll();
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-vscn-rules/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true);
});
after(async () => { mock.restoreAll(); await db.terminate(); });

test('upload allocation counts existing files and serializes concurrent reservations', async () => {
  mock.method(adminModule, 'getBucket', () => ({ getFiles: async () => [Array.from({ length: 19 }, (_, i) => ({ name: `users/member/gallery/old-${i}.webp` }))] }));
  const request = (imageId) => ({ auth: { uid: 'member', token: { email_verified: true } }, data: { imageId } });
  for (const id of ['one', 'two']) await db.doc(`images/${id}`).set({ ownerUid: 'member', kind: 'gallery', storagePath: `users/member/gallery/${id}.webp` });
  const results = await Promise.allSettled([authorizeImageUpload.run(request('one')), authorizeImageUpload.run(request('two'))]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await db.collection('uploadPermits').get()).size, 1);
});

test('upload allocation enforces ownership and hourly limits', async () => {
  mock.method(adminModule, 'getBucket', () => ({ getFiles: async () => [[]] }));
  const req = { auth: { uid: 'member', token: { email_verified: true } }, data: { imageId: 'work' } };
  await db.doc('images/work').set({ ownerUid: 'other', kind: 'gallery', storagePath: 'users/other/gallery/work.webp' });
  await assert.rejects(authorizeImageUpload.run(req), { code: 'permission-denied' });
  await db.doc('images/work').set({ ownerUid: 'member', kind: 'gallery', storagePath: 'users/member/gallery/work.webp' });
  await db.doc('uploadLimits/member').set({ windowStart: Timestamp.now(), count: 40 });
  await assert.rejects(authorizeImageUpload.run(req), { code: 'resource-exhausted' });
});

test('admin moderation rejects ordinary users and preserves member drafts on restore', async () => {
  await assert.rejects(adminSetProfileActive.run({ auth: { uid: 'member', token: {} }, data: { uid: 'member', active: true } }), { code: 'permission-denied' });
  const dispatch = mock.method(rebuild, 'dispatchRebuild', async () => true);
  const ref = db.doc('publicProfiles/member');
  await ref.set({ active: false, displayName: 'Member' });
  const req = { auth: { uid: 'admin', token: { admin: true } }, data: { uid: 'member', active: false } };
  await adminSetProfileActive.run(req);
  assert.equal((await ref.get()).data().moderationHidden, true);
  await adminSetProfileActive.run({ ...req, data: { uid: 'member', active: true } });
  assert.deepEqual((await ref.get()).data(), { active: false, displayName: 'Member', moderationHidden: false });
  assert.equal(dispatch.mock.callCount(), 2);
  assert.equal((await db.collection('adminActions').get()).size, 2);
});

test('rebuilds coalesce members and ignore unchanged saves and timestamp-only changes', async () => {
  await db.doc('publicProfiles/member').set({ active: true, displayName: 'Member', gallery: ['work'] });
  await db.doc('images/work').set({ ownerUid: 'member', caption: 'Original' });
  await queueMemberRebuild('member');
  await db.doc('publicProfiles/second').set({ active: true, displayName: 'Second' });
  await queueMemberRebuild('second');
  const dispatch = mock.method(rebuild, 'dispatchRebuild', async () => true);
  await flushMemberRebuilds.run({});
  assert.equal(dispatch.mock.callCount(), 1);
  assert.equal((await db.doc('rebuildQueue/site').get()).data().dirtyAt, undefined);
  await db.doc('publicProfiles/member').update({ updatedAt: Timestamp.now() });
  await queueMemberRebuild('member');
  await flushMemberRebuilds.run({});
  assert.equal(dispatch.mock.callCount(), 1);
  await db.doc('images/work').update({ caption: 'Corrected' });
  await queueMemberRebuild('member');
  await flushMemberRebuilds.run({});
  assert.equal(dispatch.mock.callCount(), 2);
});

test('failed dispatch and changes arriving during dispatch stay queued', async () => {
  const ref = db.doc('rebuildQueue/site');
  await ref.set({ dirtyAt: Timestamp.fromMillis(1) });
  mock.method(rebuild, 'dispatchRebuild', async () => false);
  await flushMemberRebuilds.run({});
  assert.ok((await ref.get()).data().dirtyAt);
  mock.restoreAll();
  mock.method(rebuild, 'dispatchRebuild', async () => {
    await ref.update({ dirtyAt: Timestamp.fromMillis(2) });
    return true;
  });
  await flushMemberRebuilds.run({});
  assert.equal((await ref.get()).data().dirtyAt.toMillis(), 2);
});
