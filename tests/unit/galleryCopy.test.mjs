// The Save error that names a picture whose words did not land. Both locales,
// and the {n} placeholder the editor substitutes — a missing placeholder would
// print "image ." to a member.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ui } from "../../src/i18n/translations.ts";

for (const lang of ["en", "de"]) {
  test(`${lang}: profile.gallery.saveFailed names the image`, () => {
    const s = ui[lang]["profile.gallery.saveFailed"];
    assert.equal(typeof s, "string");
    assert.ok(s.includes("{n}"), `${lang} string must carry {n}`);
  });

  test(`${lang}: profile.gallery.saveFailed.tail says the profile was not saved, once`, () => {
    const s = ui[lang]["profile.gallery.saveFailed.tail"];
    assert.equal(typeof s, "string");
    assert.ok(s.length > 0, `${lang} tail string must be non-empty`);
    assert.ok(!s.includes("{n}"), `${lang} tail string must not carry {n}`);
  });
}
