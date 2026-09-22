// WHO THE DEPLOY WILL LET CALL acknowledgeSitePublication.
//
// This asserts the DEPLOY MANIFEST, not the function's behaviour: `__endpoint`
// is exactly what the Firebase CLI reads during discovery and writes into the
// service's invoker policy. Guarding it here is the point — on 2026-09-22 the
// invoker was `private` (nobody), the deployer's grant lived only in the live
// IAM policy, and every functions deploy wiped it. See functions/src/publication.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.GCLOUD_PROJECT !== 'demo-vscn-rules' || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
  throw new Error('These tests require the local demo Firestore emulator.');
}
const { acknowledgeSitePublication } = require('../../functions/lib/publication.js');

test('the manifest names the Hosting deployer of the project being deployed to', () => {
  const invoker = acknowledgeSitePublication.__endpoint.httpsTrigger.invoker;
  // Derived from the project, never hardcoded: dev and prod each name their
  // own deployer, and this test's project is the emulator's.
  assert.deepEqual(invoker, [`vscn-hosting-deployer@${process.env.GCLOUD_PROJECT}.iam.gserviceaccount.com`]);
});

test('the endpoint is neither public nor granted to nobody', () => {
  const invoker = acknowledgeSitePublication.__endpoint.httpsTrigger.invoker;
  // "public" would expose the release acknowledgement to the internet.
  // "private" is what caused the outage: it grants no one and, because the
  // deploy rewrites the policy from this manifest, it REVOKES the deployer.
  assert.ok(!invoker.includes('public'), 'the acknowledgement endpoint must not be public');
  assert.ok(!invoker.includes('private'), 'invoker: "private" revokes the deployer on every deploy');
});
