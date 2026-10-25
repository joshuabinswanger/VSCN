// The directory's search (2026-10-16): names, projects and images from one
// field. Pure, so the matching is testable without the bar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, queryWords, scoreEntry, searchDirectory, textIndex, workKey } from "../../src/lib/communitySearch.ts";

const INDEX = {
  people: [
    { name: "Johanna Keller", role: "Illustrator", href: "/members/johanna", photo: "", tags: ["botany"] },
    { name: "Anna Müller", role: "Biologist", href: "/members/anna", photo: "", tags: ["glaciers"] },
    { name: "Ben Ott", role: "Painter", href: "/members/ben", photo: "", tags: [] },
  ],
  projects: [
    { title: "Alpine Flora", member: "Johanna Keller", href: "/members/johanna?project=p1", tags: ["botany"] },
    { title: "Ice Cores", member: "Anna Müller", href: "/members/anna?project=p2", tags: [] },
  ],
  images: [
    { key: "a-0", caption: "Edelweiss", member: "Johanna Keller", project: "Alpine Flora", href: "#", tags: [] },
    { key: "b-0", caption: "", member: "Anna Müller", project: "Ice Cores", href: "#", tags: ["ice"] },
  ],
};

test("folding drops case and accents", () => {
  assert.equal(fold("Müller"), "muller");
  assert.equal(fold("Straße"), "strasse");
  assert.deepEqual(queryWords("  Anna   MÜL "), ["anna", "mul"]);
});

test("a blank query finds nothing", () => {
  assert.deepEqual(searchDirectory(INDEX, "   "), { people: [], projects: [], images: [] });
});

test("a name that starts with the query ranks first", () => {
  const { people } = searchDirectory(INDEX, "an");
  assert.deepEqual(people.map((p) => p.name), ["Anna Müller", "Johanna Keller"]);
});

test("accents need not be typed", () => {
  assert.deepEqual(searchDirectory(INDEX, "muller").people.map((p) => p.name), ["Anna Müller"]);
});

test("every word must match somewhere", () => {
  assert.deepEqual(searchDirectory(INDEX, "anna biologist").people.map((p) => p.name), ["Anna Müller"]);
  assert.equal(searchDirectory(INDEX, "anna painter").people.length, 0);
});

test("projects by title or member; images by caption, project, member or tag", () => {
  const r = searchDirectory(INDEX, "alpine");
  assert.deepEqual(r.projects.map((p) => p.title), ["Alpine Flora"]);
  assert.deepEqual(r.images.map((w) => w.key), ["a-0"]);
  assert.deepEqual(searchDirectory(INDEX, "ice").images.map((w) => w.key), ["b-0"]);
  assert.deepEqual(searchDirectory(INDEX, "keller").projects.map((p) => p.title), ["Alpine Flora"]);
});

test("limits cap each list", () => {
  const r = searchDirectory(INDEX, "a", { people: 1, projects: 1, images: 1 });
  assert.equal(r.people.length, 1);
});

test("scoreEntry: -1 for a miss", () => {
  assert.equal(scoreEntry(["zz"], "Anna", ["x"]), -1);
});

test("workKey is the stored object's path, token and bucket aside", () => {
  const url =
    "https://firebasestorage.googleapis.com/v0/b/vscn.appspot.com/o/users%2Fu1%2Fgallery%2Fimg9.webp?alt=media&token=abc";
  assert.equal(workKey(url), "users/u1/gallery/img9.webp");
  assert.equal(workKey(url.replace("token=abc", "token=zzz")), workKey(url));
  assert.equal(workKey("not a url"), "not a url");
});

// Full text (2026-10-25): "Alessandro" is only in Quaint's bio.
const STUDIO = {
  people: [
    { name: "Sandro Lochau", role: "Illustrator", href: "/members/sandro", photo: "", tags: [] },
    {
      name: "Quaint", role: "Visualization Studio", href: "/members/quaint", photo: "", tags: [],
      text: textIndex("Look closer.\n\nOur team: Alessandro Holler, Sandro Lochau, Leana Wirth", "Zürich"),
    },
  ],
  projects: [],
  images: [
    {
      key: "q-0", caption: "Welcome", member: "Quaint", project: "", href: "#", tags: [],
      text: textIndex("Welcome", "The first time Sandro & Alessandro worked together"),
    },
  ],
};

test("textIndex keeps each folded word once, behind a space", () => {
  assert.equal(textIndex("Zürich, zurich! Bern", undefined, ""), " zurich bern");
  assert.equal(textIndex(undefined, "  "), "");
});

test("a word only in the prose finds its entry", () => {
  const r = searchDirectory(STUDIO, "Alessandro");
  assert.deepEqual(r.people.map((p) => p.name), ["Quaint"]);
  assert.deepEqual(r.images.map((w) => w.key), ["q-0"]);
  assert.deepEqual(searchDirectory(STUDIO, "ales").people.map((p) => p.name), ["Quaint"]);
  assert.deepEqual(searchDirectory(STUDIO, "zurich").people.map((p) => p.name), ["Quaint"]);
});

test("the prose matches at word starts only", () => {
  assert.equal(searchDirectory(STUDIO, "essandro").people.length, 0);
  assert.equal(searchDirectory(STUDIO, "oser").people.length, 0);
});

test("a name outranks a mention in someone's prose", () => {
  assert.deepEqual(searchDirectory(STUDIO, "sandro").people.map((p) => p.name), ["Sandro Lochau", "Quaint"]);
});

test("name, rest and prose can share a query", () => {
  assert.deepEqual(searchDirectory(STUDIO, "quaint alessandro").people.map((p) => p.name), ["Quaint"]);
  assert.deepEqual(searchDirectory(STUDIO, "studio holler").people.map((p) => p.name), ["Quaint"]);
});

test("a word typed with punctuation finds its parts in a row", () => {
  const idx = { people: [{ name: "Q", role: "", href: "#", photo: "", tags: [], text: textIndex("see quaint.ch") }], projects: [], images: [] };
  assert.equal(searchDirectory(idx, "quaint.ch").people.length, 1);
  assert.equal(searchDirectory(idx, "quaint.de").people.length, 0);
});
