const { test, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.GCLOUD_PROJECT !== 'demo-vscn-rules' || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
  throw new Error('These tests require the local demo Firestore emulator.');
}
const { db } = require('../../functions/lib/admin.js');
const rebuild = require('../../functions/lib/rebuild.js');
const { queueMemberRebuild, flushMemberRebuilds } = require('../../functions/lib/rebuildQueue.js');
const { adminSetProfileActive } = require('../../functions/lib/adminOps.js');
const { sweepImages } = require('../../functions/lib/maintenance.js');
const adminModule = require('../../functions/lib/admin.js');
const { authorizeImageUpload, completeImageUpload, webpDimensions } = require('../../functions/lib/uploads.js');
const sharp = require('sharp');
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
  const request = (imageId) => ({ auth: { uid: 'member', token: { email_verified: true } }, data: { imageId, kind: 'gallery', width: 100, height: 100 } });
  const results = await Promise.allSettled([
    authorizeImageUpload.run(request('11111111-1111-4111-8111-111111111111')),
    authorizeImageUpload.run(request('22222222-2222-4222-8222-222222222222')),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await db.collection('uploadPermits').get()).size, 1);
  assert.equal((await db.collection('images').get()).size, 1);
});

test('upload allocation enforces ownership and hourly limits', async () => {
  mock.method(adminModule, 'getBucket', () => ({ getFiles: async () => [[]] }));
  const imageId = '33333333-3333-4333-8333-333333333333';
  const req = { auth: { uid: 'member', token: { email_verified: true } }, data: { imageId, kind: 'gallery', width: 100, height: 100 } };
  await db.doc(`images/${imageId}`).set({ ownerUid: 'other', kind: 'gallery', storagePath: `users/other/gallery/${imageId}.webp` });
  await assert.rejects(authorizeImageUpload.run(req), { code: 'permission-denied' });
  await db.doc(`images/${imageId}`).delete();
  await db.doc('uploadLimits/member').set({ windowStart: Timestamp.now(), count: 40 });
  await assert.rejects(authorizeImageUpload.run(req), { code: 'resource-exhausted' });
});

test('server publishes only an uploaded WebP matching its record', async () => {
  const uid = 'member';
  const imageId = '44444444-4444-4444-8444-444444444444';
  const path = `users/${uid}/gallery/${imageId}.webp`;
  const uploadPath = `pending/${uid}/gallery/${imageId}.webp`;
  const bytes = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#ffffff' } }).webp().toBuffer();
  assert.deepEqual(webpDimensions(bytes.subarray(0, 64), bytes.length), { width: 2, height: 3 });
  await db.doc(`images/${imageId}`).set({ ownerUid: uid, kind: 'gallery', storagePath: path, origin: 'member', status: 'uploading', width: 2, height: 3 });
  await db.doc(`uploadPermits/${imageId}.webp`).set({ imageId, ownerUid: uid, kind: 'gallery', storagePath: path, uploadPath, expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  let copied = false;
  mock.method(adminModule, 'getBucket', () => ({ file: (name, options) => ({
    name,
    getMetadata: async () => [{ contentType: 'image/webp', generation: '123', size: String(bytes.length) }],
    download: async () => { assert.equal(options?.generation, '123'); return [bytes.subarray(0, 64)]; },
    copy: async (dest) => { assert.equal(options?.generation, '123'); assert.equal(dest.name, path); copied = true; return []; },
    delete: async () => {},
  }) }));
  await completeImageUpload.run({ auth: { uid, token: { email_verified: true } }, data: { imageId } });
  assert.equal(copied, true);
  assert.equal((await db.doc(`images/${imageId}`).get()).data().status, 'live');
  assert.equal((await db.doc(`uploadPermits/${imageId}.webp`).get()).exists, false);
});

test('mislabeled bytes and forged dimensions cannot become live', async () => {
  const uid = 'member';
  const imageId = '55555555-5555-4555-8555-555555555555';
  const path = `users/${uid}/gallery/${imageId}.webp`;
  const uploadPath = `pending/${uid}/gallery/${imageId}.webp`;
  const bytes = Buffer.from('not a webp image'.repeat(4));
  assert.equal(webpDimensions(bytes.subarray(0, 64), bytes.length), null);
  await db.doc(`images/${imageId}`).set({ ownerUid: uid, kind: 'gallery', storagePath: path, origin: 'member', status: 'uploading', width: 2, height: 3 });
  await db.doc(`uploadPermits/${imageId}.webp`).set({ imageId, ownerUid: uid, kind: 'gallery', storagePath: path, uploadPath, expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  mock.method(adminModule, 'getBucket', () => ({ file: () => ({
    getMetadata: async () => [{ contentType: 'image/webp', generation: '456', size: String(bytes.length) }],
    download: async () => [bytes.subarray(0, 64)],
  }) }));
  await assert.rejects(completeImageUpload.run({ auth: { uid, token: {} }, data: { imageId } }), { code: 'invalid-argument' });
  assert.equal((await db.doc(`images/${imageId}`).get()).data().status, 'uploading');
});

test('sweeper retains a recently reopened upload slot', async () => {
  const imageId = 'member-gallery';
  const ref = db.doc(`images/${imageId}`);
  await ref.set({ ownerUid: 'member', kind: 'gallery', storagePath: `users/member/gallery/${imageId}.webp`,
    status: 'uploading', createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.now() });
  mock.method(adminModule, 'getBucket', () => ({
    file: () => ({ delete: async () => { throw new Error('Recent slot was deleted'); } }),
    getFiles: async () => [[]],
  }));
  await sweepImages.run({});
  assert.equal((await ref.get()).exists, true);
});

test('sweeper deletes old orphaned private uploads', async () => {
  let deleted = false;
  mock.method(adminModule, 'getBucket', () => ({ getFiles: async () => [[{
    name: 'pending/member/gallery/orphan.webp', metadata: { timeCreated: new Date(0).toISOString() },
    delete: async () => { deleted = true; },
  }]] }));
  await sweepImages.run({});
  assert.equal(deleted, true);
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
