// The Impressum, contact and privacy pages read their prose from
// src/i18n/legal.ts and the entity facts from src/data/legalEntity.ts. These
// tests guard the two ways such pages quietly rot: a section that exists in
// one language and not the other, and a placeholder that ships.
import { test } from "node:test";
import assert from "node:assert/strict";
import { legal, LEGAL_PAGES } from "../../src/i18n/legal.ts";
import { legalEntity } from "../../src/data/legalEntity.ts";

test("every legal page exists in both languages with the same section ids in the same order", () => {
  for (const page of LEGAL_PAGES) {
    const en = legal.en[page];
    const de = legal.de[page];
    assert.ok(en, `en.${page} missing`);
    assert.ok(de, `de.${page} missing`);
    assert.ok(en.title && de.title, `${page} needs a title in both languages`);
    assert.deepEqual(de.sections.map((s) => s.id), en.sections.map((s) => s.id), `${page}: section ids differ between en and de`);
  }
});

test("no section is empty and nothing reads as a placeholder", () => {
  for (const lang of ["en", "de"]) {
    for (const page of LEGAL_PAGES) {
      for (const s of legal[lang][page].sections) {
        assert.ok(s.body.length > 0, `${lang}.${page}.${s.id} has no paragraphs`);
        const texts = s.body.flatMap((b) => (typeof b === "string" ? [b] : b.list));
        for (const p of texts) {
          assert.ok(p.trim().length > 0, `${lang}.${page}.${s.id} has an empty paragraph`);
          assert.doesNotMatch(p, /TODO|TBD|lorem|\[\[|XXX/i, `${lang}.${page}.${s.id} still holds a placeholder: ${p}`);
        }
      }
    }
  }
});

test("the entity is a named person with a working email — the two things a controller must state", () => {
  assert.equal(legalEntity.responsible, "Joshua Binswanger");
  assert.match(legalEntity.email, /^[^@\s]+@vscn\.ch$/);
  assert.equal(legalEntity.legalForm, "informal");
});

test("the privacy page never claims analytics — Firebase Analytics was removed in ef63f4d", () => {
  for (const lang of ["en", "de"]) {
    const all = legal[lang].privacy.sections
      .flatMap((s) => s.body.flatMap((b) => (typeof b === "string" ? [b] : b.list)))
      .join("\n");
    assert.doesNotMatch(all, /Google Analytics|Firebase Analytics/);
  }
});
