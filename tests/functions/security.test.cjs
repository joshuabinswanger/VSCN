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
const { resolveEmbed, restoreAutoPoster } = require('../../functions/lib/embeds.js');
const sharp = require('sharp');
const backendRequire = require('node:module').createRequire(require('node:path').resolve('functions/package.json'));
const { Timestamp } = backendRequire('firebase-admin/firestore');
beforeEach(async () => {
  mock.restoreAll();
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-vscn-rules/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true);
});
after(async () => { mock.restoreAll(); await db.terminate(); });

test('upload allocation counts stored works and serializes concurrent reservations', async () => {
  // Records, not files, since video links (2026-09-23): one work may own a
  // poster and an automatic poster, and the cap is about works.
  for (let i = 0; i < 19; i += 1) {
    await db.doc(`images/old-${i}`).set({ ownerUid: 'member', kind: 'gallery', storagePath: `users/member/gallery/old-${i}.webp`, status: i % 2 ? 'live' : 'pendingDeletion' });
  }
  await db.doc('images/someone-else').set({ ownerUid: 'other', kind: 'gallery', storagePath: 'users/other/gallery/someone-else.webp', status: 'live' });
  const request = (imageId) => ({ auth: { uid: 'member', token: { email_verified: true } }, data: { imageId, kind: 'gallery', width: 100, height: 100 } });
  const results = await Promise.allSettled([
    authorizeImageUpload.run(request('11111111-1111-4111-8111-111111111111')),
    authorizeImageUpload.run(request('22222222-2222-4222-8222-222222222222')),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'resource-exhausted');
  assert.equal((await db.collection('uploadPermits').get()).size, 1);
  assert.equal((await db.collection('images').where('ownerUid', '==', 'member').get()).size, 20);
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

test('a refused digest keeps its notices with the reason, and a sent one clears them', async () => {
  const digest = require('../../functions/lib/adminDigest.js');
  const mail = require('../../functions/lib/mail.js');
  await db.doc('publicProfiles/member').set({ displayName: 'Member' });
  await db.doc('adminEvents/image-gone-1').set({ kind: 'image', uid: 'member', imageId: 'gone', at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 0 });
  mock.method(mail, 'sendToOperator', async () => { throw new Error('Invalid login: 535 5.7.0 Invalid login'); });
  await digest.sendAdminDigest.run({});
  const [notice] = await digest.listUnsentNotices();
  assert.equal(notice.id, 'image-gone-1');
  assert.equal(notice.attempts, 1);
  assert.match(notice.lastError, /535 5\.7\.0 Invalid login/, 'the SMTP reply reaches the console, not only the log');
  assert.ok(notice.lastAttemptAt);
  mock.restoreAll();
  mock.method(mail, 'sendToOperator', async () => {});
  await digest.sendAdminDigest.run({});
  assert.deepEqual(await digest.listUnsentNotices(), []);
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

// REPLACING A WORK'S PICTURE (2026-09-23). The words move to the new record at
// allocation; the review settles at completion — ratings reset, hidden stays.
async function publishWith(uid, imageId, extraPermit = {}) {
  const path = `users/${uid}/gallery/${imageId}.webp`;
  const bytes = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#ffffff' } }).webp().toBuffer();
  await db.doc(`images/${imageId}`).set({ ownerUid: uid, kind: 'gallery', storagePath: path, origin: 'member', status: 'uploading', width: 2, height: 3 }, { merge: true });
  await db.doc(`uploadPermits/${imageId}.webp`).set({ imageId, ownerUid: uid, kind: 'gallery', storagePath: path, uploadPath: `pending/${uid}/gallery/${imageId}.webp`, expiresAt: Timestamp.fromMillis(Date.now() + 60000), ...extraPermit });
  mock.method(adminModule, 'getBucket', () => ({ file: () => ({
    getMetadata: async () => [{ contentType: 'image/webp', generation: '123', size: String(bytes.length) }],
    download: async () => [bytes.subarray(0, 64)],
    copy: async () => [{}, { resource: { generation: '456' } }],
    delete: async () => {},
  }) }));
  await completeImageUpload.run({ auth: { uid, token: { email_verified: true } }, data: { imageId } });
}

test('a replacement starts as a new record carrying the work\'s words, and only for the owner\'s live work', async () => {
  mock.method(adminModule, 'getBucket', () => ({ getFiles: async () => [[]] }));
  const oldId = '55555555-5555-4555-8555-555555555555';
  const newId = '66666666-6666-4666-8666-666666666666';
  const request = (uid, replaces) => ({ auth: { uid, token: { email_verified: true } }, data: { imageId: newId, kind: 'gallery', width: 10, height: 10, replaces } });
  await db.doc(`images/${oldId}`).set({ ownerUid: 'member', kind: 'gallery', status: 'live', origin: 'member', storagePath: `users/member/gallery/${oldId}.webp`,
    caption: 'Cell', captionDe: 'Zelle', description: 'Long', link: 'nature.com/x', siteLink: 'me.ch/x', tags: ['biology'], descriptionShort: 'gone' });
  await assert.rejects(authorizeImageUpload.run(request('intruder', oldId)), { code: 'permission-denied' });
  await assert.rejects(authorizeImageUpload.run({ ...request('member', oldId), data: { ...request('member', oldId).data, kind: 'avatar' } }), { code: 'invalid-argument' });
  await authorizeImageUpload.run(request('member', oldId));
  const created = (await db.doc(`images/${newId}`).get()).data();
  assert.deepEqual(
    { caption: created.caption, captionDe: created.captionDe, description: created.description, link: created.link, siteLink: created.siteLink, tags: created.tags },
    { caption: 'Cell', captionDe: 'Zelle', description: 'Long', link: 'nature.com/x', siteLink: 'me.ch/x', tags: ['biology'] },
  );
  assert.equal(created.descriptionShort, undefined);
  assert.equal(created.status, 'uploading');
  assert.equal((await db.doc(`uploadPermits/${newId}.webp`).get()).data().replaces, oldId);
  assert.equal((await db.doc(`images/${oldId}`).get()).data().status, 'live');
  await db.doc(`images/${oldId}`).update({ status: 'pendingDeletion' });
  await db.doc(`images/${newId}`).delete();
  await assert.rejects(authorizeImageUpload.run(request('member', oldId)), { code: 'permission-denied' });
});

test('a replaced picture loses its ratings but keeps a hide', async () => {
  const oldId = '77777777-7777-4777-8777-777777777777';
  const newId = '88888888-8888-4888-8888-888888888888';
  const hiddenAt = Timestamp.fromMillis(1_700_000_000_000);
  await db.doc(`imageModeration/${oldId}`).set({ ratings: { admin: { professional: 5, knowledge: 5, aesthetics: 5, completeness: null } }, score: 4.5, hidden: true, hiddenBy: 'admin', hiddenAt });
  await publishWith('member', newId, { replaces: oldId });
  const mod = (await db.doc(`imageModeration/${newId}`).get()).data();
  assert.deepEqual({ hidden: mod.hidden, hiddenBy: mod.hiddenBy, ratings: mod.ratings, score: mod.score }, { hidden: true, hiddenBy: 'admin', ratings: undefined, score: undefined });
  assert.equal(mod.hiddenAt.toMillis(), hiddenAt.toMillis());

  // An unhidden, rated picture: the replacement gets no record at all, so it
  // is simply unrated — back in every admin's queue.
  const plainOld = '99999999-9999-4999-8999-999999999999';
  const plainNew = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.doc(`imageModeration/${plainOld}`).set({ ratings: { admin: { professional: 1, knowledge: 1, aesthetics: 1, completeness: null } }, score: 1 });
  await publishWith('member', plainNew, { replaces: plainOld });
  assert.equal((await db.doc(`imageModeration/${plainNew}`).get()).exists, false);

  // The unverified slot replaces in place: same record, ratings cleared, hide kept.
  const slot = 'member-gallery';
  await db.doc(`imageModeration/${slot}`).set({ ratings: { admin: { professional: 3, knowledge: 3, aesthetics: 3, completeness: null } }, score: 3, scoredAt: hiddenAt, hidden: true });
  await publishWith('member', slot, { replaces: slot });
  const slotMod = (await db.doc(`imageModeration/${slot}`).get()).data();
  assert.deepEqual(slotMod, { hidden: true });
});


// VIDEO LINKS (2026-09-23, release 1 of documentation/20260923-motion-works-design.md).
// Storage is an in-memory map and the platforms are a stubbed fetch, so what
// is pinned here is what the callables WRITE, not what YouTube answers.
function memoryBucket(objects = new Map()) {
  const file = (name) => ({
    name,
    save: async (bytes, options) => { objects.set(name, { bytes: Buffer.from(bytes), options }); },
    download: async () => { if (!objects.has(name)) throw Object.assign(new Error('missing'), { code: 404 }); return [objects.get(name).bytes]; },
    copy: async (dest) => { if (!objects.has(name)) throw new Error('missing'); objects.set(dest.name, { ...objects.get(name) }); return [{}, { resource: { generation: '1' } }]; },
    getMetadata: async () => [{ contentType: 'image/webp', generation: '123', size: String(objects.get(name)?.bytes.length ?? 0) }],
    delete: async () => { objects.delete(name); },
  });
  return { objects, bucket: { file, getFiles: async () => [[]] } };
}

function stubPlatforms({ oembedStatus = 200, title = 'Mitosis, animated', thumbnail } = {}) {
  const calls = [];
  mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    if (String(url).includes('/oembed')) {
      return new Response(JSON.stringify({ title, thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }), { status: oembedStatus });
    }
    if (String(url).startsWith('https://i.ytimg.com/')) return new Response(thumbnail, { status: 200 });
    return new Response('', { status: 404 });
  });
  return calls;
}

const verifiedMember = (data) => ({ auth: { uid: 'member', token: { email_verified: true } }, data });

test('a video link becomes a live work whose poster is stored twice, never the URL', async () => {
  const { objects, bucket } = memoryBucket();
  mock.method(adminModule, 'getBucket', () => bucket);
  const thumbnail = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#336699' } }).jpeg().toBuffer();
  const calls = stubPlatforms({ thumbnail });
  const result = await resolveEmbed.run(verifiedMember({ url: 'https://youtu.be/dQw4w9WgXcQ?si=tracking' }));
  assert.deepEqual(result.embed, { provider: 'youtube', videoId: 'dQw4w9WgXcQ' });
  assert.equal(result.caption, 'Mitosis, animated');
  const rec = (await db.doc(`images/${result.imageId}`).get()).data();
  assert.equal(rec.status, 'live');
  assert.equal(rec.media, 'embed');
  assert.equal(rec.posterSource, 'auto');
  assert.deepEqual(rec.embed, { provider: 'youtube', videoId: 'dQw4w9WgXcQ' });
  assert.equal(JSON.stringify(rec).includes('si=tracking'), false);
  assert.deepEqual({ w: rec.width, h: rec.height }, { w: 640, h: 360 });
  assert.match(rec.color, /^#[0-9a-f]{6}$/);
  const path = `users/member/gallery/${result.imageId}.webp`;
  assert.equal(rec.storagePath, path);
  assert.deepEqual([...objects.keys()].sort(), [path.replace('.webp', '.auto.webp'), path].sort());
  assert.equal(objects.get(path).options.metadata.cacheControl, 'public, max-age=31536000, immutable');
  // Only the two platforms were ever contacted, and only fixed endpoints on them.
  assert.equal(calls.every((u) => u.startsWith('https://www.youtube.com/oembed?') || u.startsWith('https://i.ytimg.com/vi/dQw4w9WgXcQ/')), true);
});

test('a refused link is refused before anything is fetched or stored', async () => {
  const { objects, bucket } = memoryBucket();
  mock.method(adminModule, 'getBucket', () => bucket);
  const calls = stubPlatforms({ thumbnail: Buffer.alloc(0) });
  for (const url of ['https://example.com/watch?v=dQw4w9WgXcQ', 'instagram.com/reel/Cx1', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 42]) {
    await assert.rejects(resolveEmbed.run(verifiedMember({ url })), (e) => e.code === 'invalid-argument' && e.details.reason === 'notVideoLink');
  }
  await assert.rejects(resolveEmbed.run({ auth: { uid: 'member', token: { email_verified: false } }, data: { url: 'youtu.be/dQw4w9WgXcQ' } }),
    (e) => e.code === 'permission-denied' && e.details.reason === 'verify');
  assert.equal(calls.length, 0);
  assert.equal(objects.size, 0);
  assert.equal((await db.collection('images').get()).size, 0);
});

test('a missing or non-embeddable video leaves nothing behind', async () => {
  const { objects, bucket } = memoryBucket();
  mock.method(adminModule, 'getBucket', () => bucket);
  for (const [status, reason] of [[404, 'videoNotFound'], [401, 'notEmbeddable'], [500, 'providerUnavailable']]) {
    mock.restoreAll();
    mock.method(adminModule, 'getBucket', () => bucket);
    stubPlatforms({ oembedStatus: status, thumbnail: Buffer.alloc(0) });
    await assert.rejects(resolveEmbed.run(verifiedMember({ url: 'youtu.be/dQw4w9WgXcQ' })), (e) => e.details?.reason === reason);
  }
  assert.equal(objects.size, 0);
  assert.equal((await db.collection('images').get()).size, 0);
});

test('a video link counts against the stored-work cap like any upload', async () => {
  const { bucket } = memoryBucket();
  mock.method(adminModule, 'getBucket', () => bucket);
  const calls = stubPlatforms({ thumbnail: Buffer.alloc(0) });
  for (let i = 0; i < 20; i += 1) {
    await db.doc(`images/held-${i}`).set({ ownerUid: 'member', kind: 'gallery', storagePath: `users/member/gallery/held-${i}.webp`, status: 'live' });
  }
  await assert.rejects(resolveEmbed.run(verifiedMember({ url: 'youtu.be/dQw4w9WgXcQ' })),
    (e) => e.code === 'resource-exhausted' && e.details.reason === 'storedLimit');
  assert.equal(calls.length, 0);
});

test('a member thumbnail on a video keeps the video, and carries the automatic poster to the new id', async () => {
  const oldId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const newId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const embed = { provider: 'vimeo', videoId: '22439234', hash: 'a1b2c3d4e5' };
  const { objects, bucket } = memoryBucket();
  mock.method(adminModule, 'getBucket', () => bucket);
  await db.doc(`images/${oldId}`).set({ ownerUid: 'member', kind: 'gallery', status: 'live', origin: 'member', storagePath: `users/member/gallery/${oldId}.webp`,
    caption: 'The Mountain', media: 'embed', embed, posterSource: 'auto' });
  await authorizeImageUpload.run(verifiedMember({ imageId: newId, kind: 'gallery', width: 2, height: 3, replaces: oldId }));
  const allocated = (await db.doc(`images/${newId}`).get()).data();
  assert.deepEqual({ media: allocated.media, embed: allocated.embed, posterSource: allocated.posterSource, caption: allocated.caption },
    { media: 'embed', embed, posterSource: 'member', caption: 'The Mountain' });

  const bytes = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#ffffff' } }).webp().toBuffer();
  objects.set(`pending/member/gallery/${newId}.webp`, { bytes });
  objects.set(`users/member/gallery/${oldId}.auto.webp`, { bytes: Buffer.from('auto-poster') });
  await completeImageUpload.run(verifiedMember({ imageId: newId }));
  assert.equal((await db.doc(`images/${newId}`).get()).data().status, 'live');
  assert.equal(objects.get(`users/member/gallery/${newId}.auto.webp`).bytes.toString(), 'auto-poster');
  assert.equal(objects.has(`users/member/gallery/${newId}.webp`), true);
});

test('"Use automatic thumbnail" makes a new record from the kept poster, resetting ratings and keeping a hide', async () => {
  const oldId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const embed = { provider: 'youtube', videoId: 'dQw4w9WgXcQ' };
  const auto = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#224466' } }).webp().toBuffer();
  const { objects, bucket } = memoryBucket(new Map([[`users/member/gallery/${oldId}.auto.webp`, { bytes: auto }]]));
  mock.method(adminModule, 'getBucket', () => bucket);
  await db.doc(`images/${oldId}`).set({ ownerUid: 'member', kind: 'gallery', status: 'live', origin: 'member', storagePath: `users/member/gallery/${oldId}.webp`,
    caption: 'Mine', tags: ['biology'], media: 'embed', embed, posterSource: 'member', width: 10, height: 10 });
  await db.doc(`imageModeration/${oldId}`).set({ ratings: { admin: { professional: 5, knowledge: 5, aesthetics: 5, completeness: null } }, score: 5, hidden: true, hiddenBy: 'admin' });

  const result = await restoreAutoPoster.run(verifiedMember({ imageId: oldId }));
  assert.notEqual(result.imageId, oldId);
  const rec = (await db.doc(`images/${result.imageId}`).get()).data();
  assert.deepEqual({ status: rec.status, media: rec.media, embed: rec.embed, posterSource: rec.posterSource, caption: rec.caption, tags: rec.tags, w: rec.width, h: rec.height },
    { status: 'live', media: 'embed', embed, posterSource: 'auto', caption: 'Mine', tags: ['biology'], w: 320, h: 180 });
  assert.equal(objects.get(`users/member/gallery/${result.imageId}.webp`).bytes.equals(auto), true);
  assert.equal(objects.get(`users/member/gallery/${result.imageId}.auto.webp`).bytes.equals(auto), true);
  const mod = (await db.doc(`imageModeration/${result.imageId}`).get()).data();
  assert.deepEqual({ hidden: mod.hidden, ratings: mod.ratings }, { hidden: true, ratings: undefined });
  // The old record is the editor's to retire (it swaps the id, then marks it).
  assert.equal((await db.doc(`images/${oldId}`).get()).data().status, 'live');

  // Nothing to restore on a work whose poster is already the automatic one, or on a still.
  const notRestorable = (e) => e.code === 'failed-precondition' && e.details.reason === 'notRestorable';
  await assert.rejects(restoreAutoPoster.run(verifiedMember({ imageId: result.imageId })), notRestorable);
  await db.doc(`images/${oldId}`).set({ ownerUid: 'member', kind: 'gallery', status: 'live', storagePath: `users/member/gallery/${oldId}.webp` });
  await assert.rejects(restoreAutoPoster.run(verifiedMember({ imageId: oldId })), notRestorable);
  await assert.rejects(restoreAutoPoster.run({ auth: { uid: 'intruder', token: { email_verified: true } }, data: { imageId: result.imageId } }), notRestorable);
});

test('the sweep removes a video work\'s automatic poster with it', async () => {
  const id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const { objects, bucket } = memoryBucket(new Map([
    [`users/member/gallery/${id}.webp`, { bytes: Buffer.from('p') }],
    [`users/member/gallery/${id}.auto.webp`, { bytes: Buffer.from('a') }],
  ]));
  mock.method(adminModule, 'getBucket', () => bucket);
  await db.doc(`images/${id}`).set({ ownerUid: 'member', kind: 'gallery', status: 'pendingDeletion', storagePath: `users/member/gallery/${id}.webp`, media: 'embed' });
  await sweepImages.run({});
  assert.equal(objects.size, 0);
  assert.equal((await db.doc(`images/${id}`).get()).exists, false);
});
