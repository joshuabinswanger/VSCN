// The editor's pre-write check mirrors every cap firestore.rules holds on the
// two profile docs (T2-4) and names the field in the member's language (T3-7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { firstProfileProblem, PROFILE_LIST_CAPS, PROFILE_TEXT_CAPS } from "../../src/lib/profileValidation.ts";
import { ui } from "../../src/i18n/translations.ts";

const ok = {
  displayName: "Ada", role: "r", roleDe: "r", affiliation: "", location: "", bio: "one two", bioDe: "",
  portfolio: "", socialMedia: "", phone: "", tags: [], openTo: [], visualNeeds: [],
};

test("a profile within every cap passes", () => {
  assert.equal(firstProfileProblem(ok, ui.en), null);
});

test("the caps are the ones firestore.rules enforces", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const cap = (field) => Number(rules.match(new RegExp(`data\\.${field}\\.size\\(\\) <= (\\d+)`))?.[1]);
  const capGet = (field) => Number(rules.match(new RegExp(`data\\.get\\('${field}', ''\\)\\.size\\(\\) <= (\\d+)`))?.[1]);
  assert.equal(PROFILE_TEXT_CAPS.displayName, cap("displayName"));
  assert.equal(PROFILE_TEXT_CAPS.role, cap("role"));
  assert.equal(PROFILE_TEXT_CAPS.roleDe, capGet("roleDe"));
  assert.equal(PROFILE_TEXT_CAPS.bio, cap("bio"));
  assert.equal(PROFILE_TEXT_CAPS.bioDe, capGet("bioDe"));
  assert.equal(PROFILE_TEXT_CAPS.portfolio, cap("portfolio"));
  assert.equal(PROFILE_TEXT_CAPS.socialMedia, cap("socialMedia"));
  assert.equal(PROFILE_TEXT_CAPS.affiliation, cap("affiliation"));
  assert.equal(PROFILE_TEXT_CAPS.location, cap("location"));
  assert.equal(PROFILE_TEXT_CAPS.phone, capGet("phone"));
  assert.equal(PROFILE_LIST_CAPS.openTo, cap("openTo"));
  assert.equal(PROFILE_LIST_CAPS.tags, cap("tags"));
  assert.equal(PROFILE_LIST_CAPS.visualNeeds, cap("visualNeeds"));
});

test("an over-long role names the field and the cap", () => {
  const p = firstProfileProblem({ ...ok, role: "x".repeat(101) }, ui.en);
  assert.equal(p.field, "role");
  assert.equal(p.message, "Role (English) must be 100 characters or fewer.");
});

test("the German bio's word cap names the German field, in German on /de", () => {
  const words = Array.from({ length: 36 }, (_, i) => `w${i}`).join(" ");
  const en = firstProfileProblem({ ...ok, bioDe: words }, ui.en);
  assert.equal(en.field, "bioDe");
  assert.equal(en.message, "About you (German) must be 35 words or fewer.");
  const de = firstProfileProblem({ ...ok, bioDe: words }, ui.de);
  assert.equal(de.message, "Über dich (Deutsch) darf höchstens 35 Wörter haben.");
});

test("too many open-to choices is refused before the rules see it", () => {
  const p = firstProfileProblem({ ...ok, openTo: ["a", "b", "c", "d", "e", "f"] }, ui.en);
  assert.equal(p.field, "openTo");
  assert.match(p.message, /at most 5/);
});

test("over-long social links keep their own sentence", () => {
  const p = firstProfileProblem({ ...ok, socialMedia: "x".repeat(501) }, ui.de);
  assert.equal(p.field, "socialMedia");
  assert.equal(p.message, ui.de["profile.social.tooLong"]);
});

test("the first problem in form order wins", () => {
  const p = firstProfileProblem({ ...ok, phone: "1".repeat(41), location: "l".repeat(101) }, ui.en);
  assert.equal(p.field, "location");
});

for (const lang of ["en", "de"]) {
  test(`${lang}: the validation templates carry their placeholders`, () => {
    assert.ok(ui[lang]["profile.validation.tooLong"].includes("{field}"));
    assert.ok(ui[lang]["profile.validation.tooLong"].includes("{n}"));
    assert.ok(ui[lang]["profile.validation.tooManyWords"].includes("{n}"));
    assert.ok(ui[lang]["profile.validation.tooMany"].includes("{n}"));
  });
}
