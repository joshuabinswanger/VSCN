// The Turnstile → App Check mint endpoint is chosen by the page's hostname.
// Same-origin everywhere except local development, because the whole point of
// leaving reCAPTCHA (documentation/20260907-turnstile-app-check-provider.md)
// is to keep third-party hosts, which institutional filters block by category,
// out of the login path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mintEndpointFor, MINT_PATH } from "../../src/lib/appCheckEndpoint.ts";

test("a deployed page mints same-origin, so the call cannot be filtered apart from the site", () => {
  assert.equal(mintEndpointFor("vscn.ch", "vscn-39508"), MINT_PATH);
  assert.equal(mintEndpointFor("vscn-dev-f4b60.web.app", "vscn-dev-f4b60"), MINT_PATH);
  assert.equal(mintEndpointFor("vscn-39508--pr12-abc.web.app", "vscn-39508"), MINT_PATH);
});

test("astro dev has no Hosting in front of it, so localhost goes straight to the function", () => {
  assert.equal(
    mintEndpointFor("localhost", "vscn-dev-f4b60"),
    "https://us-central1-vscn-dev-f4b60.cloudfunctions.net/mintAppCheckToken"
  );
  assert.equal(
    mintEndpointFor("127.0.0.1", "vscn-dev-f4b60"),
    "https://us-central1-vscn-dev-f4b60.cloudfunctions.net/mintAppCheckToken"
  );
});
