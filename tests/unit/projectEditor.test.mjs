// The gallery editor's project decisions, pure: where a menu move lands, what
// a drag's DOM order means for the gallery array, where an upload into a
// project is inserted, which stored projects a Save deletes. /profile needs a
// session, so these are the rules a browser walk cannot reach locally.
import { test } from "node:test";
import assert from "node:assert/strict";
import { editorBlocks } from "../../src/lib/projects.ts";
import {
  affiliationRecords,
  applyBlocks,
  dissolveProject,
  editorAffiliations,
  emptiedStoredIds,
  insertUploaded,
  moveImage,
  moveProject,
  moveToProject,
  orderProjects,
  previewProjects,
  projectLabel,
  removeFromProject,
  sameIds,
  toProjectRecord,
  memberUidFor,
  writtenProjectIds,
} from "../../src/lib/projectEditor.ts";

const img = (imageId, projectId) => (projectId ? { imageId, projectId } : { imageId });
const ids = (gallery) => gallery.map((g) => `${g.imageId}${g.projectId ? ":" + g.projectId : ""}`);
const P = (projectId, extra = {}) => ({ projectId, affiliations: [], ...extra });

// a  [p: b c]  d  [q: e]   + r empty
const gallery = [img("a"), img("b", "p"), img("c", "p"), img("d"), img("e", "q")];
const projects = [P("p"), P("q"), P("r")];
const blocks = () => editorBlocks(gallery, projects);

test("applyBlocks is the inverse of editorBlocks", () => {
  assert.deepEqual(ids(applyBlocks(gallery, blocks())), ids(gallery));
});

test("applyBlocks: an image block drops projectId, a project block sets it", () => {
  const out = applyBlocks(gallery, [
    { kind: "project", projectId: "q", indices: [0, 3] },
    { kind: "image", index: 1 },
    { kind: "project", projectId: "p", indices: [2, 4] },
  ]);
  assert.deepEqual(ids(out), ["a:q", "d:q", "b", "c:p", "e:p"]);
});

test("moveImage: a loose row steps over a whole project block", () => {
  // d up: past [p: b c] → a d [p] [q]
  const out = moveImage(blocks(), 3, -1);
  assert.deepEqual(ids(applyBlocks(gallery, out)), ["a", "d", "b:p", "c:p", "e:q"]);
});

test("moveImage: inside a project it swaps with its sibling and stays inside", () => {
  const out = moveImage(blocks(), 2, -1);
  assert.deepEqual(ids(applyBlocks(gallery, out)), ["a", "c:p", "b:p", "d", "e:q"]);
  assert.equal(moveImage(blocks(), 1, -1), null, "first in its project has no up");
  assert.equal(moveImage(blocks(), 2, 1), null, "last in its project has no down");
});

test("moveImage: edges of the outer list, including the invisible edge before empty projects", () => {
  assert.equal(moveImage(blocks(), 0, -1), null);
  // e is the last anchored thing; below it sits only the empty r, so down changes nothing.
  assert.equal(moveProject(blocks(), "q", 1), null);
  assert.equal(moveImage(blocks(), 4, 1), null, "a row inside q cannot leave q by moving down");
});

test("moveProject moves the whole block past its neighbour", () => {
  const out = moveProject(blocks(), "p", -1);
  assert.deepEqual(ids(applyBlocks(gallery, out)), ["b:p", "c:p", "a", "d", "e:q"]);
  assert.equal(moveProject(blocks(), "p", -1) && moveProject(out, "p", -1), null);
});

test("moveProject: two empty blocks trade places, an empty one never climbs above an anchored one", () => {
  const two = [P("p"), P("q"), P("r"), P("s")];
  const b = editorBlocks(gallery, two);
  const out = moveProject(b, "s", -1);
  assert.deepEqual(out.slice(-2).map((x) => x.projectId), ["s", "r"]);
  assert.equal(moveProject(b, "r", -1), null);
});

test("moveToProject appends the image to that project's block, wherever it came from", () => {
  const out = moveToProject(blocks(), 0, "q");
  assert.deepEqual(ids(applyBlocks(gallery, out)), ["b:p", "c:p", "d", "e:q", "a:q"]);
  const fromProject = moveToProject(blocks(), 1, "r");
  assert.deepEqual(ids(applyBlocks(gallery, fromProject)), ["a", "c:p", "d", "e:q", "b:r"]);
  assert.deepEqual(moveToProject(blocks(), 1, "p"), blocks(), "already there: unchanged");
});

test("moveToProject: the last image out of a block leaves the block, empty, in place", () => {
  const out = moveToProject(blocks(), 4, "p");
  assert.deepEqual(out.map((x) => (x.kind === "project" ? `[${x.projectId}:${x.indices.length}]` : x.index)), [0, "[p:3]", 3, "[q:0]", "[r:0]"]);
});

test("removeFromProject lands the image directly below its block", () => {
  const out = removeFromProject(blocks(), 1);
  assert.deepEqual(ids(applyBlocks(gallery, out)), ["a", "c:p", "b", "d", "e:q"]);
  assert.deepEqual(removeFromProject(blocks(), 0), blocks(), "a loose row is left alone");
});

test("dissolveProject ungroups in place and drops the block", () => {
  const out = dissolveProject(blocks(), "p");
  assert.deepEqual(ids(applyBlocks(gallery, out)), ["a", "b", "c", "d", "e:q"]);
  assert.equal(out.some((x) => x.kind === "project" && x.projectId === "p"), false);
  assert.equal(dissolveProject(blocks(), "r").length, blocks().length - 1);
});

test("insertUploaded: into a project after its last image, otherwise at the end", () => {
  assert.deepEqual(ids(insertUploaded(gallery, img("n", "p"))), ["a", "b:p", "c:p", "n:p", "d", "e:q"]);
  assert.deepEqual(ids(insertUploaded(gallery, img("n"))), [...ids(gallery), "n"]);
  // A project with no image yet: the upload is its first, at the end of the list.
  assert.deepEqual(ids(insertUploaded(gallery, img("n", "r"))), [...ids(gallery), "n:r"]);
});

test("orderProjects follows the given order and keeps the rest in their old order", () => {
  const out = orderProjects(projects, ["r", "p"]);
  assert.deepEqual(out.map((p) => p.projectId), ["r", "p", "q"]);
});

test("projectLabel: the title for its lang, else 'Project n' counting untitled ones only", () => {
  const list = [P("p", { title: "Ribosome" }), P("q"), P("r", { titleDe: "Nur deutsch" }), P("s")];
  assert.equal(projectLabel(list, "p", "en", "Project {n}"), "Ribosome");
  assert.equal(projectLabel(list, "q", "en", "Project {n}"), "Project 1");
  assert.equal(projectLabel(list, "r", "en", "Project {n}"), "Nur deutsch");
  assert.equal(projectLabel(list, "s", "de", "Projekt {n}"), "Projekt 2");
  assert.equal(projectLabel(list, "ghost", "en", "Project {n}"), "Project ?");
});

test("affiliations round-trip: stored shapes become rows with a mode, rows become the two stored shapes", () => {
  const rows = editorAffiliations([{ name: "ETH", url: "ethz.ch" }, { memberUid: "u1", name: "Anna" }, { name: "Plain" }]);
  assert.deepEqual(rows, [
    { mode: "name", name: "ETH", url: "ethz.ch" },
    { mode: "member", name: "Anna", memberUid: "u1" },
    { mode: "name", name: "Plain" },
  ]);
  assert.deepEqual(affiliationRecords(rows), [{ name: "ETH", url: "ethz.ch" }, { memberUid: "u1", name: "Anna" }, { name: "Plain" }]);
});

test("affiliationRecords: a member row without a chosen member is nothing to credit; blank names go", () => {
  assert.deepEqual(
    affiliationRecords([
      { mode: "member", name: "Ann", memberUid: undefined },
      { mode: "name", name: "  " },
      { mode: "name", name: "X", url: "" },
    ]),
    [{ name: "X" }],
  );
});

test("toProjectRecord carries the fields and the converted affiliations", () => {
  const rec = toProjectRecord(P("p", { title: "T", link: "x.org", affiliations: [{ mode: "member", name: "Anna", memberUid: "u1" }] }));
  assert.deepEqual(rec, { projectId: "p", title: "T", link: "x.org", affiliations: [{ memberUid: "u1", name: "Anna" }] });
});

test("previewProjects: only projects an image names, credits resolved to slugs", () => {
  const list = [P("p", { affiliations: [{ mode: "member", name: "Anna", memberUid: "u1" }] }), P("r", { title: "Empty" })];
  const out = previewProjects("me", list, gallery, new Map([["u1", "anna"]]));
  assert.deepEqual(out.map((p) => p.id), ["p"]);
  assert.equal(out[0].affiliations[0].memberSlug, "anna");
});

test("emptiedStoredIds: stored projects nothing names, plus the ones deleted through the menu", () => {
  const stored = new Set(["p", "q", "r", "gone"]);
  assert.deepEqual(emptiedStoredIds(gallery, projects, stored, new Set(["gone", "never-stored"])), ["r", "gone"]);
});

test("sameIds compares order by imageId", () => {
  assert.equal(sameIds(gallery, [...gallery]), true);
  assert.equal(sameIds(gallery, [...gallery].reverse()), false);
  assert.equal(sameIds(gallery, gallery.slice(1)), false);
});

// ── Fix round 1 (review) ──────────────────────────────────

test("insertUploaded: an upload into a project that no longer exists arrives loose", () => {
  const known = [P("p")];
  assert.deepEqual(ids(insertUploaded(gallery, img("n", "gone"), known)), [...ids(gallery), "n"]);
  assert.deepEqual(ids(insertUploaded(gallery, img("n", "p"), known)), ["a", "b:p", "c:p", "n:p", "d", "e:q"]);
  assert.equal("projectId" in insertUploaded([], img("n", "gone"), known)[0], false);
});

test("writtenProjectIds: the projects a partly failed saveProjects did write", () => {
  const used = [P("a"), P("b"), P("c")];
  assert.deepEqual(writtenProjectIds(used, [{ projectId: "b", error: 1 }]), ["a", "c"]);
  assert.deepEqual(writtenProjectIds(used, []), ["a", "b", "c"]);
});

test("memberUidFor: a credit keeps its member while the text is the name it was stored with", () => {
  const options = [{ uid: "u-anna-2", name: "Anna Meier" }, { uid: "u-bob", name: "Bob" }];
  // Stored credit to a member who has since hidden their profile: not in the options, still kept.
  assert.equal(memberUidFor("Anna Meier", options, { name: "Anna Meier", memberUid: "u-anna-1" }), "u-anna-1");
  // Options not loaded yet: the stored credit is untouched.
  assert.equal(memberUidFor("Anna Meier", null, { name: "Anna Meier", memberUid: "u-anna-1" }), "u-anna-1");
  // Typing something else resolves afresh — against the list, or to nothing.
  assert.equal(memberUidFor("Bob", options, { name: "Anna Meier", memberUid: "u-anna-1" }), "u-bob");
  assert.equal(memberUidFor("Nobody", options, { name: "Anna Meier", memberUid: "u-anna-1" }), undefined);
  // A fresh row matches by exact name; nothing loaded means nothing matched.
  assert.equal(memberUidFor("Bob", options, { name: "Bob" }), "u-bob");
  assert.equal(memberUidFor("Bob", null, { name: "Bob" }), undefined);
});
