const { test, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.GCLOUD_PROJECT !== 'demo-vscn-rules' || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) throw new Error('Local demo emulator required');
const { db } = require('../../functions/lib/admin.js');
const { beginEmbedRequest, endEmbedRequest } = require('../../functions/lib/embedAllowance.js');
const digest = require('../../functions/lib/adminDigest.js');
const { queueMemberRebuild } = require('../../functions/lib/rebuildQueue.js');
const { getPublicationStatus } = require('../../functions/lib/publication.js');
const backendRequire = require('node:module').createRequire(require('node:path').resolve('functions/package.json'));
const { Timestamp } = backendRequire('firebase-admin/firestore');
beforeEach(async () => {
  mock.restoreAll();
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-vscn-rules/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true);
});
after(async () => { mock.restoreAll(); await db.terminate(); });
test('only one expensive import runs, failed attempts are charged, stale finalizers cannot release another lease', async () => {
  const results = await Promise.allSettled([beginEmbedRequest('member'), beginEmbedRequest('member')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const token = results.find(r => r.status === 'fulfilled').value;
  assert.equal((await db.doc('uploadLimits/member').get()).data().count, 1);
  await endEmbedRequest('member', 'wrong-token');
  await assert.rejects(beginEmbedRequest('member'), { code: 'resource-exhausted' });
  await endEmbedRequest('member', token);
  await db.doc('uploadLimits/member').update({ count: 40 });
  await assert.rejects(beginEmbedRequest('member'), { code: 'resource-exhausted' });
});
test('exhausted mail is retained and only an administrator can retry it', async () => {
  const mail = require('../../functions/lib/mail.js');
  await db.doc('adminEvents/image-test').set({ kind: 'image', uid: 'member', imageId: 'gone', at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 11 });
  mock.method(mail, 'sendToOperator', async () => { throw new Error('SMTP unavailable'); });
  await digest.sendAdminDigest.run({});
  assert.equal((await db.doc('adminEvents/image-test').get()).exists, false);
  assert.equal((await db.doc('failedAdminEvents/image-test').get()).data().attempts, 12);
  mock.method(require('../../functions/lib/emails.js'), 'findEmailMismatches', async () => []);
  const { adminListQueues } = require('../../functions/lib/adminOps.js');
  const queues = await adminListQueues.run({ auth: { uid: 'admin', token: { admin: true } } });
  assert.equal(queues.unsentNotices[0].failed, true, 'the console must receive the failed state to offer Retry');
  await assert.rejects(digest.adminRetryNotice.run({ auth: { uid: 'member', token: {} }, data: { id: 'image-test' } }));
  await digest.adminRetryNotice.run({ auth: { uid: 'admin', token: { admin: true } }, data: { id: 'image-test' } });
  assert.equal((await db.doc('adminEvents/image-test').get()).data().attempts, 0);
  assert.equal((await db.collection('adminActions').get()).size, 1);
});
test('mail adapter uses authenticated TLS, sends plain text, and closes on failure', async () => {
  const nodemailer = backendRequire('nodemailer');
  const mail = require('../../functions/lib/mail.js');
  let closed = false;
  mock.method(nodemailer, 'createTransport', options => {
    assert.equal(options.requireTLS, true);
    assert.equal(options.port, 587);
    return { sendMail: async message => { assert.equal(message.text, 'Test content'); throw new Error('test transport failure'); }, close: () => { closed = true; } };
  });
  await assert.rejects(mail.sendToOperator({ subject: 'Test only', text: 'Test content' }), /test transport failure/);
  assert.equal(closed, true);
});
test('redelivered image events do not recreate a delivered notification', async () => {
  const event = { id: 'stable-event', params: { imageId: 'image' }, data: {
    before: { data: () => ({ status: 'uploading' }) },
    after: { data: () => ({ status: 'live', origin: 'member', ownerUid: 'member' }) },
  } };
  await digest.onImageWentLive.run(event);
  for (const doc of (await db.collection('adminEvents').get()).docs) await doc.ref.delete();
  await digest.onImageWentLive.run(event);
  assert.equal((await db.collection('adminEvents').get()).size, 0);
});
test('publication tracks the member generation independently of newer queued edits', async () => {
  await db.doc('publicProfiles/first').set({ displayName: 'First', active: true });
  await queueMemberRebuild('first');
  await db.doc('publicProfiles/second').set({ displayName: 'Second', active: true });
  await queueMemberRebuild('second');
  await db.doc('rebuildQueue/site').update({ publishedGeneration: 1 });
  assert.equal((await getPublicationStatus.run({ auth: { uid: 'first' } })).state, 'published');
  assert.equal((await getPublicationStatus.run({ auth: { uid: 'second' } })).state, 'queued');
  await assert.rejects(getPublicationStatus.run({}), { code: 'unauthenticated' });
});
