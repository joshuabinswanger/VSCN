const { test } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.GCLOUD_PROJECT !== 'demo-vscn-rules') throw new Error('Demo project required');
const functions = require('../../functions/lib/index.js');
const { backendLabels } = require('../../functions/lib/releaseStamp.js');
test('every deployed export declares the same backend artifact, including first-generation Auth triggers', () => {
  assert.match(backendLabels.source_digest, /^[a-f0-9]{40}$/);
  for (const [name, fn] of Object.entries(functions)) {
    assert.equal(fn.__endpoint?.labels?.source_digest, backendLabels.source_digest, name);
  }
});
