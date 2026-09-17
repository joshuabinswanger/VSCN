// Local audit reproduction: real queue code with deferred image processing.
// No Firebase access, network requests, or image uploads occur.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/lib/galleryQueue.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let release;
const prepared = new Promise(resolve => { release = resolve; });
let uploads = 0;
let committed = 0;
const exportsObject = {};
vm.runInNewContext(code, {
  exports: exportsObject,
  URL: { createObjectURL: () => 'blob:audit', revokeObjectURL() {} },
  require: () => ({
    compressGalleryImage: () => prepared,
    validateGalleryFile: () => null,
    galleryErrorCode: () => 'unknown',
    uploadGalleryImage: async () => { uploads++; return { imageId: 'audit' }; },
    GalleryError: Error,
  }),
});
const queue = exportsObject.createGalleryQueue({
  uid: () => 'audit-user', capacity: () => 8,
  onChange() {}, onUploaded() { committed++; },
});
queue.add([{ name: 'audit.webp' }]);
assert.equal(queue.tasks()[0].state, 'preparing');
queue.cancel(queue.tasks()[0].id);
assert.equal(queue.tasks().length, 0);
release({ blob: {}, width: 10, height: 10 });
setImmediate(() => {
  assert.equal(uploads, 1, 'Historical reproduction should show an upload after cancel');
  assert.equal(committed, 1, 'Historical reproduction should show publication callback after cancel');
  console.log(JSON.stringify({ cancelledRowRemoved: true, uploadsAfterCancel: uploads, callbacksAfterCancel: committed }));
  console.log('CONFIRMED: cancelling during preparation still uploads and calls onUploaded.');
});
