// THE THREE MODERATION CALLABLES, against the emulator.
//
// What is worth guarding here is not that a number comes back but WHOSE number
// it is: the ratings map is shared by every admin, so the tests below are
// mostly about one admin's write leaving the others alone, and about the score
// being derived from exactly the map that was stored rather than from a second
// copy of it.
//
// See documentation/20260922-image-moderation-ranking-design.md.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.GCLOUD_PROJECT !== 'demo-vscn-rules' || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
  throw new Error('These tests require the local demo Firestore emulator.');
}
const { db } = require('../../functions/lib/admin.js');
const { adminListRatingQueue, adminRateImage, adminSetImageHidden } = require('../../functions/lib/moderation.js');
const { imageScore } = require('../../functions/lib/imageScore.js');
const backendRequire = require('node:module').createRequire(require('node:path').resolve('functions/package.json'));
const { Timestamp } = backendRequire('firebase-admin/firestore');

const asAdmin = (uid, data) => ({ auth: { uid, token: { admin: true } }, data });
const asMember = (data) => ({ auth: { uid: 'member', token: {} }, data });

/** A live gallery record, referenced by its owner's profile below. */
async function seedImage(imageId, extra = {}) {
  await db.doc(`images/${imageId}`).set({
    ownerUid: 'member',
    kind: 'gallery',
    status: 'live',
    storagePath: `users/member/gallery/${imageId}.webp`,
    width: 10,
    height: 10,
    createdAt: Timestamp.fromMillis(1_000),
    ...extra,
  });
}

async function seedProfile(gallery) {
  await db.doc('publicProfiles/member').set({ displayName: 'Member', active: true, gallery });
}

const modDoc = async (imageId) => (await db.doc(`imageModeration/${imageId}`).get()).data();
const imageDoc = async (imageId) => (await db.doc(`images/${imageId}`).get()).data();

beforeEach(async () => {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-vscn-rules/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true);
});
after(async () => { await db.terminate(); });

// 1
test('moderation is admin-only on every one of the three callables', async () => {
  await seedImage('img1');
  await seedProfile(['img1']);
  await assert.rejects(adminRateImage.run(asMember({ imageId: 'img1', professional: 3, knowledge: 3, aesthetics: 3, completeness: null })), { code: 'permission-denied' });
  await assert.rejects(adminSetImageHidden.run(asMember({ imageId: 'img1', hidden: true })), { code: 'permission-denied' });
  await assert.rejects(adminListRatingQueue.run(asMember({})), { code: 'permission-denied' });
  // A signed-out caller is unauthenticated, not merely unprivileged.
  await assert.rejects(adminListRatingQueue.run({ data: {} }), { code: 'unauthenticated' });
  assert.equal((await db.collection('imageModeration').get()).size, 0);
});

// 2
test('a rating outside the scale is refused rather than clamped at the door', async () => {
  await seedImage('img1');
  const good = { imageId: 'img1', professional: 3, knowledge: 3, aesthetics: 3, completeness: null };
  for (const bad of [
    { ...good, professional: 2.5 },
    { ...good, knowledge: 6 },
    { ...good, aesthetics: -1 },
    { ...good, completeness: 9 },
    { ...good, professional: '4' },
    { ...good, imageId: '' },
    { ...good, imageId: 'images/img1' },
    { ...good, professional: undefined },
  ]) {
    await assert.rejects(adminRateImage.run(asAdmin('admin', bad)), { code: 'invalid-argument' }, JSON.stringify(bad));
  }
  assert.equal((await db.collection('imageModeration').get()).size, 0);
  assert.equal((await db.collection('adminActions').get()).size, 0);
});

// 3
test('completeness null is stored as null — auto is an instruction, not a number', async () => {
  await seedImage('img1', { caption: 'a', description: 'b' });
  await adminRateImage.run(asAdmin('admin', { imageId: 'img1', professional: 0, knowledge: 0, aesthetics: 0, completeness: null }));
  const stored = await modDoc('img1');
  assert.equal(stored.ratings.admin.completeness, null);
  // 0.15 * 2 (caption + description) / 5 * 100 — the record's reading, live.
  assert.equal(stored.score, 6);
  // And it stays live: adding a tag lifts the score with nobody re-rating.
  await db.doc('images/img1').update({ tags: ['neuron'] });
  assert.equal(imageScore(await imageDoc('img1'), stored), 9);
});

// 4
test('one admin rating writes one entry, and the stored score is that map scored', async () => {
  await seedImage('img1', { caption: 'a', description: 'b', tags: ['x'], link: 'example.com/x' });
  const result = await adminRateImage.run(asAdmin('admin', { imageId: 'img1', professional: 5, knowledge: 4, aesthetics: 3, completeness: null }));
  const stored = await modDoc('img1');
  assert.deepEqual(Object.keys(stored.ratings), ['admin']);
  assert.equal(stored.ratings.admin.name, '');
  assert.ok(stored.ratings.admin.at instanceof Timestamp);
  assert.ok(stored.scoredAt instanceof Timestamp);
  // THE POINT: the number the callable returned, the number it stored, and the
  // number the pure module derives from the stored map are one number.
  assert.equal(result.score, stored.score);
  assert.equal(stored.score, imageScore(await imageDoc('img1'), stored));
  // 0.35*5 + 0.25*4 + 0.25*3 + 0.15*4 = 4.1 → 82
  assert.equal(stored.score, 82);
});

// 5
test('a second admin joins the average and does not disturb the first', async () => {
  await seedImage('img1');
  await db.doc('publicProfiles/admin2').set({ displayName: 'Second Admin' });
  await adminRateImage.run(asAdmin('admin1', { imageId: 'img1', professional: 5, knowledge: 5, aesthetics: 5, completeness: null }));
  const first = (await modDoc('img1')).ratings.admin1;
  await adminRateImage.run(asAdmin('admin2', { imageId: 'img1', professional: 1, knowledge: 1, aesthetics: 1, completeness: null }));
  const stored = await modDoc('img1');
  assert.deepEqual(Object.keys(stored.ratings).sort(), ['admin1', 'admin2']);
  assert.deepEqual(stored.ratings.admin1, first);
  // The denormalised name comes off the rater's own profile, not the target's.
  assert.equal(stored.ratings.admin2.name, 'Second Admin');
  // means 3/3/3, completeness auto 0 → 0.85*3 = 2.55 → 51
  assert.equal(stored.score, 51);
  assert.equal(stored.score, imageScore(await imageDoc('img1'), stored));
});

// 6
test('re-rating overwrites only the caller’s own entry', async () => {
  await seedImage('img1');
  await adminRateImage.run(asAdmin('admin1', { imageId: 'img1', professional: 5, knowledge: 5, aesthetics: 5, completeness: null }));
  await adminRateImage.run(asAdmin('admin2', { imageId: 'img1', professional: 5, knowledge: 5, aesthetics: 5, completeness: null }));
  const before = (await modDoc('img1')).ratings.admin2;
  await adminRateImage.run(asAdmin('admin1', { imageId: 'img1', professional: 1, knowledge: 1, aesthetics: 1, completeness: 5 }));
  const stored = await modDoc('img1');
  assert.deepEqual(Object.keys(stored.ratings).sort(), ['admin1', 'admin2']);
  assert.deepEqual(stored.ratings.admin2, before);
  assert.equal(stored.ratings.admin1.professional, 1);
  assert.equal(stored.ratings.admin1.completeness, 5);
  // admin1 now 1/1/1 with an override of 5, admin2 still 5/5/5 on auto 0:
  // means 3/3/3 and completeness (5+0)/2 = 2.5 → 0.85*3 + 0.15*2.5 = 2.925 → 59
  assert.equal(stored.score, 59);
  assert.equal(stored.score, imageScore(await imageDoc('img1'), stored));
});

// 7
test('rating or hiding an image that does not exist is not-found', async () => {
  const data = { imageId: 'ghost', professional: 3, knowledge: 3, aesthetics: 3, completeness: null };
  await assert.rejects(adminRateImage.run(asAdmin('admin', data)), { code: 'not-found' });
  await assert.rejects(adminSetImageHidden.run(asAdmin('admin', { imageId: 'ghost', hidden: true })), { code: 'not-found' });
  assert.equal((await db.collection('imageModeration').get()).size, 0);
});

// 8
test('hiding is independent of the score, and unhiding clears who hid it', async () => {
  await seedImage('img1', { caption: 'a' });
  await adminRateImage.run(asAdmin('admin1', { imageId: 'img1', professional: 5, knowledge: 5, aesthetics: 5, completeness: null }));
  const rated = await modDoc('img1');
  await adminSetImageHidden.run(asAdmin('admin2', { imageId: 'img1', hidden: true }));
  const hidden = await modDoc('img1');
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.hiddenBy, 'admin2');
  assert.ok(hidden.hiddenAt instanceof Timestamp);
  // Untouched: the grade survives the picture coming off the wall.
  assert.equal(hidden.score, rated.score);
  assert.deepEqual(hidden.ratings, rated.ratings);
  assert.deepEqual(hidden.scoredAt, rated.scoredAt);
  await adminSetImageHidden.run(asAdmin('admin2', { imageId: 'img1', hidden: false }));
  const shown = await modDoc('img1');
  assert.equal(shown.hidden, false);
  assert.equal(shown.hiddenBy, null);
  assert.equal(shown.hiddenAt, null);
  assert.equal(shown.score, rated.score);
});

// 9
test('every moderation write lands in adminActions, and reading the queue writes nothing', async () => {
  await seedImage('img1');
  await seedProfile(['img1']);
  await adminRateImage.run(asAdmin('admin1', { imageId: 'img1', professional: 4, knowledge: 4, aesthetics: 4, completeness: 2 }));
  await adminSetImageHidden.run(asAdmin('admin2', { imageId: 'img1', hidden: true }));
  await adminSetImageHidden.run(asAdmin('admin2', { imageId: 'img1', hidden: false }));
  await adminListRatingQueue.run(asAdmin('admin1', {}));

  const rows = (await db.collection('adminActions').get()).docs.map((d) => d.data());
  assert.equal(rows.length, 3);
  const byAction = new Map(rows.map((r) => [r.action, r]));
  assert.deepEqual([...byAction.keys()].sort(), ['hideImage', 'rateImage', 'unhideImage']);
  // The target of a moderation act is the MEMBER, so the log reads as
  // something done to a person's work — and ownerUid comes from the same read
  // that rated the picture, not from a second one afterwards.
  for (const row of rows) assert.equal(row.targetUid, 'member');
  assert.equal(byAction.get('rateImage').actorUid, 'admin1');
  assert.equal(byAction.get('hideImage').actorUid, 'admin2');
  assert.equal(byAction.get('unhideImage').actorUid, 'admin2');
  assert.equal(byAction.get('rateImage').completeness, 2);
  assert.equal(byAction.get('rateImage').score, 74);
});

// 10
test('rating and hiding each mark the site rebuild dirty by hand', async () => {
  await seedImage('img1');
  const ref = db.doc('rebuildQueue/site');
  const stale = { dirtyAt: Timestamp.fromMillis(1), revision: 'old' };

  await ref.set(stale);
  await adminRateImage.run(asAdmin('admin', { imageId: 'img1', professional: 3, knowledge: 3, aesthetics: 3, completeness: null }));
  const afterRating = (await ref.get()).data();
  assert.ok(afterRating.dirtyAt.toMillis() > 1);
  assert.notEqual(afterRating.revision, 'old');

  await ref.set(stale);
  await adminSetImageHidden.run(asAdmin('admin', { imageId: 'img1', hidden: true }));
  const afterHide = (await ref.get()).data();
  assert.ok(afterHide.dirtyAt.toMillis() > 1);
  assert.notEqual(afterHide.revision, 'old');
});

// 11
test('the queue is what THIS admin has not rated, of what a visible profile shows', async () => {
  await seedImage('rated', { caption: 'a', description: 'b', captionDe: 'a', descriptionDe: 'b', tags: ['x'], link: 'example.com/x' });
  await seedImage('unrated');
  await seedImage('byOther', { ownerUid: 'other', storagePath: 'users/other/gallery/byOther.webp' });
  await seedImage('orphan');           // live, but no profile points at it
  await seedImage('avatar', { kind: 'avatar' });
  await seedImage('uploading', { status: 'uploading' });
  await seedProfile(['rated', 'unrated', 'orphan-not-listed', 'avatar', 'uploading']);
  await db.doc('publicProfiles/other').set({ displayName: 'Other', active: false, gallery: ['byOther'] });
  await db.doc('slugs/member').set({ uid: 'member', current: true });

  await adminRateImage.run(asAdmin('admin1', { imageId: 'rated', professional: 5, knowledge: 5, aesthetics: 5, completeness: null }));

  const mine = await adminListRatingQueue.run(asAdmin('admin1', {}));
  assert.deepEqual(mine.items.map((i) => i.imageId), ['unrated']);
  assert.equal(mine.remaining, 1);

  // A second admin still owes the picture their judgement: the grade is an
  // average, so "already rated" is per-admin and not a property of the image.
  const theirs = await adminListRatingQueue.run(asAdmin('admin2', {}));
  assert.deepEqual(theirs.items.map((i) => i.imageId).sort(), ['rated', 'unrated']);
  assert.equal(theirs.remaining, 2);

  const rated = theirs.items.find((i) => i.imageId === 'rated');
  assert.equal(rated.ownerName, 'Member');
  assert.equal(rated.ownerSlug, 'member');
  assert.equal(rated.raterCount, 1);
  assert.equal(rated.score, 100);
  assert.equal(rated.computedCompleteness, 5);
  assert.deepEqual(rated.checks, { caption: true, description: true, german: true, tags: true, link: true });
  assert.equal(rated.hidden, false);
  // plain() turned the Timestamp into something JSON can carry.
  assert.equal(typeof rated.createdAt, 'string');

  const unrated = theirs.items.find((i) => i.imageId === 'unrated');
  assert.equal(unrated.raterCount, 0);
  assert.equal(unrated.score, 43);
  assert.deepEqual(unrated.tags, []);

  // `remaining` counts the whole stack; `limit` only pages it.
  const paged = await adminListRatingQueue.run(asAdmin('admin2', { limit: 1 }));
  assert.equal(paged.items.length, 1);
  assert.equal(paged.remaining, 2);
});

// The defect the plan flagged: the draft sorted millisecond counts through
// localeCompare, which orders them as text — 9_000 then 100_000 then 20_000.
test('the queue is newest first, by number and not by the text of a number', async () => {
  await seedImage('nine', { createdAt: Timestamp.fromMillis(9_000) });
  await seedImage('hundred', { createdAt: Timestamp.fromMillis(100_000) });
  await seedImage('twenty', { createdAt: Timestamp.fromMillis(20_000) });
  await seedProfile(['nine', 'hundred', 'twenty']);
  const queue = await adminListRatingQueue.run(asAdmin('admin', {}));
  assert.deepEqual(queue.items.map((i) => i.imageId), ['hundred', 'twenty', 'nine']);
});
