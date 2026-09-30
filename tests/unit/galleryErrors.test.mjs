// Which sentence a failed upload or video link gets. The callables throw
// FunctionsErrors ("functions/unauthenticated"), and when App Check cannot
// attest, the SDK sends the call without its token and the server answers
// `unauthenticated`: the same code as a missing sign-in. The member used to be
// told their session had expired (video) or "Something went wrong" (image),
// neither of which signing in again can fix. See src/lib/gallery.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "../helpers/load-ts.mjs";
import { ui } from "../../src/i18n/translations.ts";

let attesting = true;
const { galleryErrorCode, embedErrorCode } = loadTs("src/lib/gallery.ts", {
  "firebase/firestore": {},
  "firebase/functions": {},
  "./images.ts": {},
  "./galleryRecords.ts": {},
  "./image.ts": {},
  "./firebase.ts": { isAttestationFailing: () => !attesting },
});

const callable = (code, reason) => ({ code: `functions/${code}`, ...(reason ? { details: { reason } } : {}) });

test("an unauthenticated callable while attestation fails names the security check", () => {
  attesting = false;
  assert.equal(galleryErrorCode(callable("unauthenticated")), "appCheck");
  assert.equal(embedErrorCode(callable("unauthenticated")), "appCheck");
});

test("an unauthenticated callable with attestation working still reads as a sign-in problem", () => {
  attesting = true;
  assert.equal(galleryErrorCode(callable("unauthenticated")), "denied");
  assert.equal(embedErrorCode(callable("unauthenticated")), "denied");
});

test("the image path strips the callable prefix and reads the server's reason", () => {
  attesting = true;
  assert.equal(galleryErrorCode(callable("resource-exhausted", "hourlyLimit")), "hourlyLimit");
  assert.equal(galleryErrorCode(callable("resource-exhausted", "storedLimit")), "storedLimit");
  assert.equal(galleryErrorCode(callable("unavailable")), "network");
  assert.equal(galleryErrorCode(callable("deadline-exceeded")), "network");
  assert.equal(galleryErrorCode(callable("permission-denied")), "denied");
  // Storage and Firestore codes are unchanged.
  assert.equal(galleryErrorCode({ code: "storage/unauthorized" }), "denied");
  assert.equal(galleryErrorCode({ code: "storage/quota-exceeded" }), "quota");
  assert.equal(galleryErrorCode({ code: "permission-denied" }), "denied");
});

for (const lang of ["en", "de"]) {
  test(`${lang}: every new code has a sentence, and the App Check ones name the host to allow`, () => {
    for (const key of [
      "profile.gallery.err.appCheck",
      "profile.gallery.err.storedLimit",
      "profile.gallery.err.hourlyLimit",
      "profile.embed.err.appCheck",
    ]) {
      assert.equal(typeof ui[lang][key], "string", `${lang} ${key}`);
    }
    for (const key of ["profile.gallery.err.appCheck", "profile.embed.err.appCheck"]) {
      assert.ok(ui[lang][key].includes("challenges.cloudflare.com"), `${lang} ${key}`);
    }
  });
}
