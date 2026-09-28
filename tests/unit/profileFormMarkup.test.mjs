// The profile editor is ONE <form>, and everything in it — the gallery, the
// video link field, Save — must stay inside it. A second <form> nested in it
// is not HTML: the parser drops the inner tag and its </form> closes the
// profile form early, taking Save and every later section out of it. astro
// check does not notice, and /profile then fails to load at all (2026-09-23,
// caught in review of the video-link field before it shipped).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the profile editor holds exactly one form element", () => {
  const source = readFileSync("src/components/ProfileForm.astro", "utf8");
  const opening = source.match(/<form\s[^>]*>/g) ?? [];
  assert.deepEqual(opening.map((tag) => tag.match(/id="([^"]+)"/)?.[1]), ["profile-form"]);
  assert.equal((source.match(/<\/form>\s*$/gm) ?? []).length, 1);
});
