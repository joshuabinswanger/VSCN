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
  const replaced = [];
  const queue = createGalleryQueue({ uid: () => 'member', capacity, onChange() {}, onUploaded() { committed++; },
    onReplaced(item, id) { replaced.push([item.imageId, id]); } });
  return { queue, counts: () => ({ uploads, committed }), replaced };
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

test('a replacement needs no free slot, tells the upload what it replaces, and lands as a swap', async () => {
  let seen;
  const { queue, counts, replaced } = setup({ uploadGalleryImage: async (_uid, _image, options) => {
    seen = options.replaces; return { imageId: 'new' };
  } }, () => 0);
  assert.equal(queue.add(files.slice(0, 1)).overflow, 1);
  assert.equal(queue.replace('old', files[0]), null);
  assert.equal(queue.pendingCount(), 0);
  await settle(); await settle();
  assert.equal(seen, 'old');
  assert.deepEqual(replaced, [['new', 'old']]);
  assert.equal(counts().committed, 0);
  assert.equal(queue.tasks().length, 0);
});

test('one work takes one replacement at a time, and a failed one is superseded by the next', async () => {
  const gate = deferred();
  let fail = true;
  const { queue, replaced } = setup({ compressGalleryImage: async () => {
    if (fail) throw new Error('network'); await gate.promise; return {};
  } }, () => 0);
  queue.replace('old', files[0]); await settle();
  assert.equal(queue.tasks()[0].state, 'error');
  assert.equal(queue.replacing('old'), false);
  fail = false;
  assert.equal(queue.replace('old', files[1]), null);
  assert.equal(queue.tasks().length, 1);
  assert.equal(queue.replacing('old'), true);
  assert.equal(queue.replace('old', files[0]), 'busy');
  gate.resolve(); await settle(); await settle();
  assert.equal(replaced.length, 1);
  assert.equal(queue.replacing('old'), false);
});

test('a failed replacement retries even when the gallery is full', async () => {
  let fail = true;
  const { queue, replaced } = setup({ compressGalleryImage: async () => { if (fail) throw new Error('network'); return {}; } }, () => 0);
  queue.replace('old', files[0]); await settle();
  const task = queue.tasks()[0]; assert.equal(task.state, 'error');
  fail = false; queue.retry(task.id);
  for (let i = 0; i < 5; i++) await settle();
  assert.equal(replaced.length, 1);
});
