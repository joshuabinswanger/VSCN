// A success or error paragraph that a script shows by toggling its display is
// silent to a screen reader unless it is a live region: the sign-in error, the
// wizard's password mismatch and the account settings failures appeared on
// screen and were announced to nobody (review T3-6, WCAG 4.1.3). The role is
// set statically in the markup, so it is in place before the first message.
//
// /styleguide is exempt: its samples are static demonstrations, and a static
// role="alert" would be read out on every visit to the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function astroFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return astroFiles(path);
    return entry.name.endsWith(".astro") ? [path] : [];
  });
}

test("every msg-err paragraph is an alert and every msg-ok paragraph a status", () => {
  const missing = [];
  for (const file of astroFiles("src")) {
    if (file.replaceAll("\\", "/").endsWith("pages/styleguide.astro")) continue;
    const source = readFileSync(file, "utf8");
    for (const tag of source.match(/<p\s[^>]*class="[^"]*\bmsg-(?:err|ok)\b[^"]*"[^>]*>/g) ?? []) {
      const wanted = /\bmsg-err\b/.test(tag) ? "alert" : "status";
      if (!tag.includes(`role="${wanted}"`)) missing.push(`${file}: ${tag}`);
    }
  }
  assert.deepEqual(missing, []);
});
