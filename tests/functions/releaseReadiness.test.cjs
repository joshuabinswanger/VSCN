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
test('a member whose last change predates generations reads as published, not unknown', async () => {
  await db.doc('publicProfiles/legacy').set({ displayName: 'Legacy', active: true });
  await queueMemberRebuild('legacy');
  // The shape rebuildMembers/{uid} had before generations existed.
  const { FieldValue } = backendRequire('firebase-admin/firestore');
  await db.doc('rebuildMembers/legacy').update({ generation: FieldValue.delete() });
  await db.doc('rebuildQueue/site').update({ publishedGeneration: 0 });
  assert.equal((await getPublicationStatus.run({ auth: { uid: 'legacy' } })).state, 'unknown');
  await queueMemberRebuild('legacy'); // an unchanged save
  assert.equal((await db.doc('rebuildMembers/legacy').get()).data().generation, 0);
  assert.equal((await getPublicationStatus.run({ auth: { uid: 'legacy' } })).state, 'published');
});
test('mail adapter addresses the operator from the mailbox it authenticated as', async () => {
  // A literal `to` or a dropped `auth` passed the suite before (review T2-26):
  // the envelope is what makes the notice reach the operator and nobody else.
  const nodemailer = backendRequire('nodemailer');
  const mail = require('../../functions/lib/mail.js');
  // Params read process.env at runtime; the CLI bakes the defineString
  // defaults into the deployed env, so the test supplies what a deploy would.
  const env = { ADMIN_NOTIFY_TO: 'operator@example.org', INFOMANIAK_SMTP_PASSWORD: 'not-a-real-password',
    SMTP_HOST: 'mail.infomaniak.com', SMTP_USER: 'info@vscn.ch', NOTIFY_FROM: 'VSCN <info@vscn.ch>' };
  Object.assign(process.env, env);
  let sent;
  mock.method(nodemailer, 'createTransport', options => {
    assert.equal(options.host, 'mail.infomaniak.com');
    assert.equal(options.secure, false, 'STARTTLS on 587, not implicit TLS');
    assert.equal(options.requireTLS, true);
    assert.deepEqual(options.auth, { user: 'info@vscn.ch', pass: 'not-a-real-password' });
    assert.ok(options.connectionTimeout && options.greetingTimeout && options.socketTimeout, 'a silent server must not eat the tick');
    return { sendMail: async message => { sent = message; }, close: () => {} };
  });
  try {
    await mail.sendToOperator({ subject: 'Test only', text: 'Test content' });
  } finally {
    for (const key of Object.keys(env)) delete process.env[key];
  }
  assert.equal(sent.from, 'VSCN <info@vscn.ch>', 'Infomaniak only sends as the authenticated box');
  assert.equal(sent.to, 'operator@example.org', 'the recipient is the ADMIN_NOTIFY_TO secret');
  assert.equal(sent.subject, 'Test only');
  assert.equal(sent.html, undefined, 'plain text only');
});
test('retrying a notice answers with a code for each way it can be wrong', async () => {
  const admin = { auth: { uid: 'admin', token: { admin: true } } };
  await assert.rejects(digest.adminRetryNotice.run({ auth: { uid: 'member', token: {} }, data: { id: 'x' } }), { code: 'permission-denied' });
  await assert.rejects(digest.adminRetryNotice.run({ ...admin, data: { id: '../x' } }), { code: 'invalid-argument' });
  await assert.rejects(digest.adminRetryNotice.run({ ...admin, data: { id: 'nothing-here' } }), { code: 'not-found' });
  await db.doc('failedAdminEvents/image-dup').set({ kind: 'image', uid: 'member', imageId: 'i', at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 12 });
  await db.doc('adminEvents/image-dup').set({ kind: 'image', uid: 'member', imageId: 'i', at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 0 });
  await assert.rejects(digest.adminRetryNotice.run({ ...admin, data: { id: 'image-dup' } }), { code: 'already-exists' });
  await db.doc('adminEvents/image-dup').delete();
  await digest.adminRetryNotice.run({ ...admin, data: { id: 'image-dup' } });
  const [row] = (await db.collection('adminActions').get()).docs.map(d => d.data());
  assert.equal(row.action, 'retryNotice');
  assert.equal(row.noticeId, 'image-dup', 'flat like audit() rows, not nested under detail');
  assert.equal(row.detail, undefined);
});
test('a signup is queued once: a redelivered Auth-create event neither re-queues a mailed notice nor resets a failing one', async () => {
  const created = new Date('2026-09-29T10:00:00Z');
  assert.equal(await digest.queueSignup('newbie', 'newbie@example.org', created), true);
  await db.doc('adminEvents/signup-newbie').update({ attempts: 4 });
  assert.equal(await digest.queueSignup('newbie', 'newbie@example.org', created), false);
  assert.equal((await db.doc('adminEvents/signup-newbie').get()).data().attempts, 4, 'attempts survive a redelivery');
  await db.doc('adminEvents/signup-newbie').delete(); // the digest mailed and deleted it
  assert.equal(await digest.queueSignup('newbie', 'newbie@example.org', created), false);
  assert.equal((await db.doc('adminEvents/signup-newbie').get()).exists, false, 'a mailed notice is not re-queued');
  // An event from before receipts existed keeps its attempts and gains a receipt.
  await db.doc('adminEvents/signup-legacy').set({ kind: 'signup', uid: 'legacy', email: null, at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 2 });
  assert.equal(await digest.queueSignup('legacy', null, created), false);
  assert.equal((await db.doc('adminEvents/signup-legacy').get()).data().attempts, 2);
  assert.equal((await db.doc('adminEventReceipts/signup-legacy').get()).exists, true);
});
test('only auth/user-not-found reads as a deleted account; any other Auth error keeps the event and fails the tick', async () => {
  const adminModule = require('../../functions/lib/admin.js');
  const mail = require('../../functions/lib/mail.js');
  await db.doc('adminEvents/signup-flaky').set({ kind: 'signup', uid: 'flaky', email: 'flaky@example.org', at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 0 });
  mock.method(adminModule.adminAuth, 'getUser', async () => { throw Object.assign(new Error('quota'), { code: 'auth/too-many-requests' }); });
  let sent = 0;
  mock.method(mail, 'sendToOperator', async () => { sent += 1; });
  await assert.rejects(digest.sendAdminDigest.run({}), /quota/);
  assert.equal(sent, 0, 'no mail claims the account was deleted');
  assert.equal((await db.doc('adminEvents/signup-flaky').get()).data().attempts, 0, 'the event is untouched for the next tick');
  mock.restoreAll();
  mock.method(adminModule.adminAuth, 'getUser', async () => { throw Object.assign(new Error('gone'), { code: 'auth/user-not-found' }); });
  let text = '';
  mock.method(mail, 'sendToOperator', async (msg) => { text = msg.text; });
  await digest.sendAdminDigest.run({});
  assert.match(text, /deleted again before this report ran/);
  assert.equal((await db.doc('adminEvents/signup-flaky').get()).exists, false);
});
test('a notice about a purged account is dropped when the mail fails, never retained with its email', async () => {
  const adminModule = require('../../functions/lib/admin.js');
  const mail = require('../../functions/lib/mail.js');
  await db.doc('adminEvents/signup-purged').set({ kind: 'signup', uid: 'purged', email: 'purged@example.org', at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 11 });
  await db.doc('users/alive').set({ displayName: 'Alive' });
  await db.doc('adminEvents/signup-alive').set({ kind: 'signup', uid: 'alive', email: 'alive@example.org', at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 11 });
  mock.method(adminModule.adminAuth, 'getUser', async () => { throw Object.assign(new Error('gone'), { code: 'auth/user-not-found' }); });
  mock.method(mail, 'sendToOperator', async () => { throw new Error('SMTP unavailable'); });
  await digest.sendAdminDigest.run({});
  assert.equal((await db.doc('adminEvents/signup-purged').get()).exists, false);
  assert.equal((await db.doc('failedAdminEvents/signup-purged').get()).exists, false, 'no Auth user and no users doc: nothing to retain');
  assert.equal((await db.doc('failedAdminEvents/signup-alive').get()).data().attempts, 12, 'a users doc means the account still exists, so it is retained');
});
test('purge sweeps the pending signup notice, the retained ones and the receipt, and keeps the rebuild tombstone', async () => {
  const adminModule = require('../../functions/lib/admin.js');
  const { scheduleDeletion } = require('../../functions/lib/lifecycle.js');
  const { purgeAccount } = require('../../functions/lib/purge.js');
  await db.doc('users/member').set({ displayName: 'Member', email: 'member@example.org' });
  await db.doc('publicProfiles/member').set({ displayName: 'Member', active: true });
  await digest.queueSignup('member', 'member@example.org', new Date());
  await db.doc('adminEvents/image-mine').set({ kind: 'image', uid: 'member', imageId: 'mine', at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 0 });
  await db.doc('failedAdminEvents/image-old').set({ kind: 'image', uid: 'member', imageId: 'old', at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 12 });
  await db.doc('adminEvents/signup-other').set({ kind: 'signup', uid: 'other', email: 'other@example.org', at: Timestamp.now(), dueAt: Timestamp.now(), attempts: 0 });
  await queueMemberRebuild('member');
  await scheduleDeletion('member', 'member', Timestamp.now());
  mock.method(adminModule.adminAuth, 'updateUser', async () => ({}));
  mock.method(adminModule.adminAuth, 'deleteUser', async () => {});
  mock.method(adminModule, 'getBucket', () => ({ deleteFiles: async () => {}, getFiles: async () => [[]] }));
  await purgeAccount('member');
  for (const path of ['adminEvents/signup-member', 'adminEvents/image-mine', 'failedAdminEvents/image-old', 'adminEventReceipts/signup-member', 'users/member', 'publicProfiles/member']) {
    assert.equal((await db.doc(path).get()).exists, false, `${path} must go with the account`);
  }
  assert.equal((await db.doc('adminEvents/signup-other').get()).exists, true);
  assert.equal((await db.doc('rebuildMembers/member').get()).exists, true, 'the tombstone the profile-delete trigger compares against');
  assert.equal(await digest.queueSignup('member', 'member@example.org', new Date()), true, 'the receipt went with the account');
});
test('"delayed" is measured from the oldest unpublished change, so later saves by anyone do not hide a stalled queue', async () => {
  const { markSiteDirty, flushMemberRebuilds } = require('../../functions/lib/rebuildQueue.js');
  const rebuild = require('../../functions/lib/rebuild.js');
  const old = Timestamp.fromMillis(Date.now() - 45 * 60_000);
  await db.doc('publicProfiles/early').set({ displayName: 'Early', active: true });
  await queueMemberRebuild('early');
  await db.doc('rebuildMembers/early').update({ queuedAt: old });
  await db.doc('rebuildQueue/site').update({ queuedAt: old, dirtyAt: old });
  // Another member saves, then moderation dirties the queue: both newer.
  await db.doc('publicProfiles/late').set({ displayName: 'Late', active: true });
  await queueMemberRebuild('late');
  await markSiteDirty();
  const queue = (await db.doc('rebuildQueue/site').get()).data();
  assert.equal(queue.queuedAt.toMillis(), old.toMillis(), 'the oldest unpublished write is kept');
  assert.ok(queue.dirtyAt.toMillis() > old.toMillis(), 'the newest is what dirtyAt tracks');
  assert.equal((await getPublicationStatus.run({ auth: { uid: 'early' } })).state, 'delayed');
  assert.equal((await getPublicationStatus.run({ auth: { uid: 'late' } })).state, 'queued', 'a fresh save is not delayed by an older one');
  // Early saves again while still unpublished: their own clock keeps running.
  await db.doc('publicProfiles/early').update({ displayName: 'Early again' });
  await queueMemberRebuild('early');
  assert.equal((await db.doc('rebuildMembers/early').get()).data().queuedAt.toMillis(), old.toMillis());
  assert.equal((await getPublicationStatus.run({ auth: { uid: 'early' } })).state, 'delayed');
  // The console sees the same age.
  mock.method(require('../../functions/lib/emails.js'), 'findEmailMismatches', async () => []);
  const { adminListQueues } = require('../../functions/lib/adminOps.js');
  const queues = await adminListQueues.run({ auth: { uid: 'admin', token: { admin: true } } });
  assert.equal(queues.publication.delayed, true);
  assert.ok(queues.publication.ageMinutes >= 45);
  assert.equal(queues.publication.dirty, true);
  assert.equal(queues.failedNotices, 0);
  // The flush logs the delay from the same clock and the ack clears both stamps.
  const { logger } = backendRequire('firebase-functions/v2');
  const errors = [];
  mock.method(logger, 'error', (...args) => { errors.push(args); });
  mock.method(rebuild, 'dispatchRebuild', async () => true);
  await flushMemberRebuilds.run({});
  assert.ok(errors.some(([m, extra]) => /Publication delayed/.test(m) && extra.minutes >= 45), 'the operator log names the age');
  // Once published, the member's next change starts a new clock.
  const { acknowledgeSitePublication } = require('../../functions/lib/publication.js');
  const { revision } = (await db.doc('rebuildQueue/site').get()).data();
  await acknowledgeSitePublication({ method: 'POST', body: { revision } }, { status: () => ({ send: () => {} }), send: () => {}, json: () => {} });
  assert.equal((await getPublicationStatus.run({ auth: { uid: 'early' } })).state, 'published');
  await db.doc('publicProfiles/early').update({ displayName: 'Early once more' });
  await queueMemberRebuild('early');
  assert.ok((await db.doc('rebuildMembers/early').get()).data().queuedAt.toMillis() > old.toMillis());
  assert.equal((await getPublicationStatus.run({ auth: { uid: 'early' } })).state, 'queued');
});
test('an empty string or empty array fingerprints as absent, so the editor writing roleDe: "" builds nothing', async () => {
  const { rebuildFingerprint } = require('../../functions/lib/rebuildQueue.js');
  const base = rebuildFingerprint({ displayName: 'A', role: 'x' }, [{ id: 'i', data: { caption: 'c' } }]);
  assert.equal(rebuildFingerprint({ displayName: 'A', role: 'x', roleDe: '', bioDe: '', tags: [] }, [{ id: 'i', data: { caption: 'c', tags: [] } }]), base);
  assert.notEqual(rebuildFingerprint({ displayName: 'A', role: 'x', roleDe: 'y' }, [{ id: 'i', data: { caption: 'c' } }]), base);
  await db.doc('publicProfiles/blank').set({ displayName: 'Blank', active: true });
  await queueMemberRebuild('blank');
  const { revision } = (await db.doc('rebuildQueue/site').get()).data();
  await db.doc('publicProfiles/blank').update({ roleDe: '', bioDe: '' });
  await queueMemberRebuild('blank');
  assert.equal((await db.doc('rebuildQueue/site').get()).data().revision, revision, 'no build was queued for two empty strings');
});
