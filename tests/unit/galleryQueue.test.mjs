import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/load-ts.mjs';
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function setup(overrides = {}, capacity = () => 8) {
  let uploads = 0, committed = 0;
  const gallery = {
    validateGalleryFile: () => null,
    compressGalleryImage: async () => ({}),
    uploadGalleryImage: async () => { uploads++; return { imageId: 'test' }; },
    galleryErrorCode: () => 'network', GalleryError: Error, ...overrides,
  };
  const { createGalleryQueue } = loadTs('src/lib/galleryQueue.ts', { './gallery.ts': gallery }, {
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    fetch: async () => ({ blob: async () => new Blob() }),
  });
  const queue = createGalleryQueue({ uid: () => 'member', capacity, onChange() {}, onUploaded() { committed++; } });
  return { queue, counts: () => ({ uploads, committed }) };
}
const files = [{ name: 'one.webp' }, { name: 'two.webp' }];

test('cancel preparing and queued work never uploads or commits either image', async () => {
  const gate = deferred();
  const { queue, counts } = setup({ compressGalleryImage: () => gate.promise });
  queue.add(files);
  for (const task of queue.tasks()) queue.cancel(task.id);
  assert.equal(queue.tasks().length, 0);
  gate.resolve({}); await settle();
  assert.deepEqual(counts(), { uploads: 0, committed: 0 });
});

test('cancel before the transfer handler arrives cancels that transfer immediately', async () => {
  const gate = deferred(); let cancelled = false;
  const { queue, counts } = setup({ uploadGalleryImage: async (_uid, _image, options) => {
    await gate.promise;
    options.onCancellable(() => { cancelled = true; });
    return { imageId: 'test' };
  } });
  queue.add(files.slice(0, 1)); await settle();
  queue.cancel(queue.tasks()[0].id); gate.resolve(); await settle();
  assert.equal(cancelled, true);
  assert.equal(counts().committed, 0);
});

test('dispose cancels outstanding work and rejects new work', async () => {
  const gate = deferred();
  const { queue, counts } = setup({ compressGalleryImage: () => gate.promise });
  queue.add(files); queue.dispose(); gate.resolve({}); await settle();
  assert.deepEqual(counts(), { uploads: 0, committed: 0 });
  assert.equal(queue.add(files).queued, 0);
});

test('retry does not reclaim a slot now used by another image', async () => {
  let room = 1;
  const { queue } = setup({ compressGalleryImage: async () => { throw new Error('network'); } }, () => room);
  queue.add(files.slice(0, 1)); await settle();
  const task = queue.tasks()[0]; assert.equal(task.state, 'error');
  room = 0; queue.retry(task.id); await settle();
  assert.equal(task.state, 'error');
  room = 1; queue.retry(task.id); await settle();
  assert.equal(queue.tasks().length, 1);
});
