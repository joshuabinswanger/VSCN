// The profile editor is ONE <form>, and everything in it — the gallery, the
// video link field, Save — must stay inside it. A second <form> nested in it
// is not HTML: the parser drops the inner tag and its </form> closes the
// profile form early, taking Save and every later section out of it. astro
// check does not notice, and /profile then fails to load at all (2026-09-23,
// caught in review of the video-link field before it shipped).
//
// Since the 2026-09-28 extraction the shell (ProfileForm.astro) holds only the
// <form> itself and every field lives in src/components/profile/*.astro, all
// of which render inside it, so the guard reads all of them (review T2-15).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// Comments are not markup: WorkEditor.astro explains, in a JSX comment, why
// it is "NOT A <form>".
const markup = (path) => readFileSync(path, "utf8")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const openings = (source) => source.match(/<form[\s>/]/gi) ?? [];
const closings = (source) => source.match(/<\/form\s*>/gi) ?? [];

test("the profile editor shell holds exactly one form element", () => {
  const source = markup("src/components/ProfileForm.astro");
  const opening = source.match(/<form\s[^>]*>/g) ?? [];
  assert.deepEqual(opening.map((tag) => tag.match(/id="([^"]+)"/)?.[1]), ["profile-form"]);
  assert.equal(closings(source).length, 1);
});

test("no profile editor section opens or closes a form of its own", () => {
  const dir = "src/components/profile";
  const files = readdirSync(dir).filter((f) => f.endsWith(".astro"));
  assert.ok(files.length >= 4, `expected the extracted sections in ${dir}, found ${files.join(", ")}`);
  const offenders = files.flatMap((f) => {
    const source = markup(`${dir}/${f}`);
    const n = openings(source).length + closings(source).length;
    return n ? [`${f}: ${n} form tag(s)`] : [];
  });
  assert.deepEqual(offenders, []);
});
