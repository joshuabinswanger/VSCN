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
    copy: async (dest) => { assert.equal(options?.generation, '123'); assert.equal(dest.name, path); copied = true; return [{}, { resource: { generation: "456" } }]; },
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
  assert.ok((await db.doc('rebuildQueue/site').get()).data().dirtyAt);
  await db.doc('publicProfiles/member').update({ updatedAt: Timestamp.now() });
  await queueMemberRebuild('member');
  await flushMemberRebuilds.run({});
  assert.equal(dispatch.mock.callCount(), 1);
  await db.doc('rebuildQueue/site').update({ leaseUntil: Timestamp.fromMillis(0) });
  await db.doc('images/work').update({ caption: 'Corrected' });
  await queueMemberRebuild('member');
  await flushMemberRebuilds.run({});
  assert.equal(dispatch.mock.callCount(), 2);
});

test('a hidden member changes nothing the site shows: their uploads queue no build, hiding them does', async () => {
  // The release walk uploads and deletes an image per release as a
  // moderationHidden member (documentation/20260923-release-walk-automation.md §7).
  const queue = db.doc('rebuildQueue/site');
  await db.doc('publicProfiles/walker').set({ active: true, displayName: 'Walker', gallery: [] });
  await queueMemberRebuild('walker');
  await queue.delete();
  await db.doc('publicProfiles/walker').update({ moderationHidden: true });
  await queueMemberRebuild('walker');
  assert.ok((await queue.get()).data()?.dirtyAt, 'hiding a visible member queues the build that drops them');
  await queue.delete();
  await db.doc('images/walk-img').set({ ownerUid: 'walker', kind: 'gallery', status: 'live', caption: 'Release walk' });
  await db.doc('publicProfiles/walker').update({ gallery: ['walk-img'] });
  await queueMemberRebuild('walker');
  await db.doc('images/walk-img').update({ caption: 'Release walk, edited' });
  await queueMemberRebuild('walker');
  await db.doc('publicProfiles/walker').update({ gallery: [] });
  await queueMemberRebuild('walker');
  assert.equal((await queue.get()).exists, false, 'a hidden member uploading, captioning and deleting queues nothing');
  await db.doc('publicProfiles/walker').update({ active: false, moderationHidden: false });
  await queueMemberRebuild('walker');
  assert.equal((await queue.get()).exists, false, 'inactive is as absent as hidden, which is what the export does');
  await db.doc('publicProfiles/walker').update({ active: true });
  await queueMemberRebuild('walker');
  assert.ok((await queue.get()).data()?.dirtyAt, 'reactivating queues the build that shows them again');
});

test('an image going live for a hidden member queues no operator event', async () => {
  const { onImageWentLive } = require('../../functions/lib/adminDigest.js');
  await db.doc('publicProfiles/walker').set({ displayName: 'Walker', moderationHidden: true });
  await db.doc('publicProfiles/member').set({ displayName: 'Member' });
  const wentLive = (ownerUid) => ({ params: { imageId: `${ownerUid}-img` }, data: {
    before: { exists: true, data: () => ({ ownerUid, origin: 'member', kind: 'gallery', status: 'uploading' }) },
    after: { exists: true, data: () => ({ ownerUid, origin: 'member', kind: 'gallery', status: 'live' }) },
  } });
  await onImageWentLive.run(wentLive('walker'));
  await onImageWentLive.run(wentLive('member'));
  const events = await db.collection('adminEvents').get();
  assert.deepEqual(events.docs.map((d) => d.data().uid), ['member']);
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

test('an unacknowledged deployment retries after lease expiry', async () => {
  await db.doc('publicProfiles/member').set({ displayName: 'Member' });
  await queueMemberRebuild('member');
  const dispatch = mock.method(rebuild, 'dispatchRebuild', async () => true);
  await flushMemberRebuilds.run({});
  await flushMemberRebuilds.run({});
  assert.equal(dispatch.mock.callCount(), 1);
  await db.doc('rebuildQueue/site').update({ leaseUntil: Timestamp.fromMillis(0) });
  await flushMemberRebuilds.run({});
  assert.equal(dispatch.mock.callCount(), 2);
  assert.ok((await db.doc('rebuildQueue/site').get()).data().revision);
});

test('only deployment of the current revision clears pending publication', async () => {
  const { acknowledgePublication } = await import('../../scripts/lib/publication-state.mjs');
  const { FieldValue } = backendRequire('firebase-admin/firestore');
  const ref = db.doc('rebuildQueue/site');
  await ref.set({ revision: 'new', dirtyAt: Timestamp.now(), leaseUntil: Timestamp.now() });
  assert.equal(await acknowledgePublication(db, 'old', FieldValue), false);
  assert.ok((await ref.get()).data().dirtyAt);
  assert.equal(await acknowledgePublication(db, 'new', FieldValue), true);
  assert.equal((await ref.get()).data().dirtyAt, undefined);
  assert.equal((await ref.get()).data().publishedRevision, 'new');
});

test('server profile events publish latest names despite stale delivery, including deletion', async () => {
  const { onPublicProfileWritten } = require('../../functions/lib/slugs.js');
  const ref = db.doc('publicProfiles/member');
  await ref.set({ displayName: 'Newest Name' });
  const stale = { params: { uid: 'member' }, data: {
    before: { exists: true, data: () => ({ displayName: 'First Name' }) },
    after: { exists: true, data: () => ({ displayName: 'Old Name' }) },
  } };
  await onPublicProfileWritten.run(stale);
  await onPublicProfileWritten.run(stale);
  assert.equal((await db.doc('slugs/newest-name').get()).data().current, true);
  assert.equal((await db.doc('slugs/old-name').get()).exists, false);
  const revision = (await db.doc('rebuildQueue/site').get()).data().revision;
  await ref.delete();
  await onPublicProfileWritten.run({ ...stale, data: { ...stale.data, after: { exists: false } } });
  assert.notEqual((await db.doc('rebuildQueue/site').get()).data().revision, revision);
});

test('purge excludes concurrent workers and cancellation, then resumes after failure', async () => {
  const { scheduleDeletion, cancelDeletion } = require('../../functions/lib/lifecycle.js');
  const { purgeAccount } = require('../../functions/lib/purge.js');
  const { syncEmail } = require('../../functions/lib/accounts.js');
  await db.doc('users/member').set({ displayName: 'Member' });
  await db.doc('publicProfiles/member').set({ displayName: 'Member', active: true });
  await scheduleDeletion('member', 'member', Timestamp.now());
  let unblock, entered;
  const gate = new Promise(resolve => { unblock = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  mock.method(adminModule.adminAuth, 'updateUser', async () => ({}));
  mock.method(adminModule.adminAuth, 'deleteUser', async () => {});
  mock.method(adminModule, 'getBucket', () => ({
    deleteFiles: async () => { entered(); await gate; throw new Error('simulated outage'); },
    getFiles: async () => [[]],
  }));
  const running = purgeAccount('member');
  const rejected = assert.rejects(running, /simulated outage/);
  await started;
  await assert.rejects(cancelDeletion('member'), { code: 'failed-precondition' });
  await assert.rejects(purgeAccount('member'), { code: 'aborted' });
  await assert.rejects(syncEmail.run({ auth: { uid: 'member', token: { email: 'test@example.test' } } }), { code: 'failed-precondition' });
  await assert.rejects(authorizeImageUpload.run({ auth: { uid: 'member', token: {} }, data: { imageId: 'member-avatar', kind: 'avatar', width: 10, height: 10 } }), { code: 'failed-precondition' });
  unblock(); await rejected;
  assert.equal((await db.doc('deletions/member').get()).data().state, 'purging');
  await assert.rejects(cancelDeletion('member'), { code: 'failed-precondition' });
  mock.method(adminModule, 'getBucket', () => ({ deleteFiles: async () => {} }));
  await purgeAccount('member');
  assert.equal((await db.doc('users/member').get()).exists, false);
  assert.equal((await db.doc('deletions/member').get()).data().state, 'completed');
});

test('a scheduled deletion can be cancelled before cleanup starts', async () => {
  const { scheduleDeletion, cancelDeletion } = require('../../functions/lib/lifecycle.js');
  await db.doc('users/member').set({ displayName: 'Member' });
  await db.doc('publicProfiles/member').set({ displayName: 'Member', active: true });
  await scheduleDeletion('member', 'admin', Timestamp.now());
  await cancelDeletion('member');
  assert.equal((await db.doc('deletions/member').get()).exists, false);
  assert.equal((await db.doc('publicProfiles/member').get()).data().active, true);
});


test('deletion revokes pending upload permits atomically', async () => {
  const { scheduleDeletion } = require('../../functions/lib/lifecycle.js');
  await db.doc('uploadPermits/member-avatar.webp').set({ ownerUid: 'member' });
  await scheduleDeletion('member', 'member', Timestamp.now());
  assert.equal((await db.doc('uploadPermits/member-avatar.webp').get()).exists, false);
});

test('private publication endpoint rejects malformed revisions and ignores stale builds', async () => {
  const { acknowledgeSitePublication } = require('../../functions/lib/publication.js');
  const current = '11111111-1111-4111-8111-111111111111';
  const stale = '22222222-2222-4222-8222-222222222222';
  const ref = db.doc('rebuildQueue/site');
  await ref.set({ revision: current, dirtyAt: Timestamp.now() });
  let status, result;
  const res = { status: n => { status=n; return res; }, send: () => {}, json: r => { result=r; } };
  await acknowledgeSitePublication({ method: 'POST', body: { revision: 'bad' } }, res);
  assert.equal(status, 400);
  await acknowledgeSitePublication({ method: 'POST', body: { revision: stale } }, res);
  assert.equal(result.acknowledged, false);
  assert.ok((await ref.get()).data().dirtyAt);
  await acknowledgeSitePublication({ method: 'POST', body: { revision: current } }, res);
  assert.equal(result.acknowledged, true);
  assert.equal((await ref.get()).data().dirtyAt, undefined);
});

test('deletion during upload publication removes only the newly copied generation', async () => {
  const uid='member', imageId='member-avatar';
  const path='users/member/avatar/member-avatar.webp', uploadPath='pending/member/avatar/member-avatar.webp';
  const bytes=await sharp({ create: { width: 2, height: 3, channels: 3, background: '#ffffff' } }).webp().toBuffer();
  await db.doc('images/'+imageId).set({ ownerUid: uid, kind:'avatar', storagePath:path, origin:'member', status:'uploading', width:2, height:3 });
  await db.doc('uploadPermits/'+imageId+'.webp').set({ imageId,ownerUid:uid,storagePath:path,uploadPath,expiresAt:Timestamp.fromMillis(Date.now()+60000) });
  let removed=false;
  mock.method(adminModule,'getBucket',()=>({ file:(name,options)=>({
    getMetadata:async()=>[{ contentType:'image/webp', generation:'123',size:String(bytes.length) }],
    download:async()=>[bytes.subarray(0,64)],
    copy:async()=> { await db.doc('deletions/member').set({state:'purging'}); return [{},{resource:{generation:'456'}}]; },
    delete:async()=> { assert.equal(name,path);assert.equal(options.generation,'456');removed=true; },
  }) }));
  await assert.rejects(completeImageUpload.run({auth:{uid,token:{}},data:{imageId}}),{code:'failed-precondition'});
  assert.equal(removed,true);
  assert.equal((await db.doc('images/'+imageId).get()).data().status,'uploading');
});
