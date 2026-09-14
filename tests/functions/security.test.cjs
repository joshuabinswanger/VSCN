const { test, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.GCLOUD_PROJECT !== 'demo-vscn-rules' || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
  throw new Error('These tests require the local demo Firestore emulator.');
}
const { db } = require('../../functions/lib/admin.js');
const rebuild = require('../../functions/lib/rebuild.js');
const { queueMemberRebuild, flushMemberRebuilds } = require('../../functions/lib/rebuildQueue.js');
const { adminSetProfileActive } = require('../../functions/lib/adminOps.js');
const backendRequire = require('node:module').createRequire(require('node:path').resolve('functions/package.json'));
const { Timestamp } = backendRequire('firebase-admin/firestore');
beforeEach(async () => {
  mock.restoreAll();
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-vscn-rules/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true);
});
after(async () => { mock.restoreAll(); await db.terminate(); });

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
