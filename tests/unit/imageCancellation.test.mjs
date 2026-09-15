import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';

test('cancelling while upload authorization is pending prevents bytes and live status', async () => {
  let release, started, cancel;
  const gate = new Promise(resolve => { release = resolve; });
  const authorizing = new Promise(resolve => { started = resolve; });
  let uploads = 0, live = 0;
  const { uploadImage } = loadTs('src/lib/images.ts', {
    'firebase/firestore': { doc: () => ({}), setDoc: async () => {}, serverTimestamp: () => 0,
      updateDoc: async (_ref, data) => { if (data.status === 'live') live++; } },
    'firebase/storage': { ref: () => ({}), uploadBytesResumable: () => { uploads++; throw new Error('must not upload'); } },
    './firebase.ts': { auth: { currentUser: {} }, db: {}, storage: {}, functions: {} },
    'firebase/functions': { httpsCallable: () => async () => { started(); await gate; } },
    './auth.ts': { hasVerifiedClaim: async () => true },
  });
  const pending = uploadImage('member', 'gallery', new Blob(), { width: 10, height: 10 }, () => {}, fn => { cancel = fn; });
  await authorizing; cancel(); release();
  await assert.rejects(pending, { code: 'storage/canceled' });
  assert.equal(uploads, 0); assert.equal(live, 0);
});
