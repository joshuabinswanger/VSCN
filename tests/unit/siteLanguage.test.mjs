// The stored language routes a signed-in member on /profile — within limits
// that each protect a visitor from being dragged somewhere they did not ask
// to go. See src/lib/siteLanguage.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { localePath, preferredLocaleTarget } from "../../src/lib/siteLanguage.ts";

test("localePath swaps only the locale prefix", () => {
  assert.equal(localePath("/profile", "de"), "/de/profile");
  assert.equal(localePath("/de/profile", "en"), "/profile");
  assert.equal(localePath("/de/profile/", "en"), "/profile/");
  assert.equal(localePath("/", "de"), "/de");
  assert.equal(localePath("/de", "en"), "/");
  assert.equal(localePath("/de/profile", "de"), "/de/profile");
  // A path that merely starts with the letters is not the German locale.
  assert.equal(localePath("/delete", "de"), "/de/delete");
  assert.equal(localePath("/delete", "en"), "/delete");
});

test("a stored preference that differs from the page routes to its locale", () => {
  assert.equal(preferredLocaleTarget("de", "en", "/profile", null), "/de/profile");
  assert.equal(preferredLocaleTarget("en", "de", "/de/profile", null), "/profile");
});

test("a matching, absent or foreign preference stays put", () => {
  assert.equal(preferredLocaleTarget("de", "de", "/de/profile", null), null);
  assert.equal(preferredLocaleTarget(undefined, "en", "/profile", null), null);
  assert.equal(preferredLocaleTarget("fr", "en", "/profile", null), null);
  assert.equal(preferredLocaleTarget(null, "de", "/de/profile", null), null);
});

test("an explicit switch on this visit outranks the stored preference", () => {
  assert.equal(preferredLocaleTarget("de", "en", "/profile", "en"), null);
  // Even when the member later reaches the other locale by a link: the click
  // said what they want, and a stale stored value must not undo it.
  assert.equal(preferredLocaleTarget("en", "de", "/de/profile", "en"), null);
});
