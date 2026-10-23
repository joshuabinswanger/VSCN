// The gallery editor's carousel moves, pure: where a work lands when it steps,
// joins, leaves, or is handed a lead's words. /profile needs a session, so
// these are the rules a browser walk cannot reach locally.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseLeads } from "../../src/lib/carousels.ts";
import {
  dissolve,
  handOffLead,
  joinCarousel,
  moveCarousel,
  moveCarouselToProject,
  moveWork,
  projectCarouselIds,
  takeOut,
} from "../../src/lib/carouselEditor.ts";

const g = (id, projectId, carouselId, extra = {}) => ({
  id,
  projectId,
  ...(carouselId ? { carouselId } : {}),
  ...extra,
});
const ids = (gallery) => gallery.map((x) => x.id).join("");
const frozen = (gallery) => {
  gallery.forEach((x) => Object.freeze(x));
  return Object.freeze(gallery);
};

test("moveWork: a lone work steps over a whole 3-slide carousel in one press, both ways", () => {
  const gallery = [g("a", "P"), g("b", "P", "c1"), g("c", "P", "c1"), g("d", "P", "c1"), g("e", "P")];
  assert.equal(ids(moveWork(gallery, 0, 1)), "bcdae");
  assert.equal(ids(moveWork(gallery, 4, -1)), "aebcd");
});

test("moveWork: a carousel steps over a lone work as one unit (via its neighbour)", () => {
  const gallery = [g("a", "P"), g("b", "P", "c1"), g("c", "P", "c1")];
  assert.equal(ids(moveWork(gallery, 0, 1)), "bca");
});

test("moveWork: a slide swaps only with its sibling slide", () => {
  const gallery = [g("a", "P"), g("b", "P", "c1"), g("c", "P", "c1"), g("d", "P", "c1")];
  assert.equal(ids(moveWork(gallery, 2, 1)), "abdc");
  assert.equal(ids(moveWork(gallery, 2, -1)), "acbd");
});

test("moveWork: the first slide with delta -1, the last with +1, are null", () => {
  const gallery = [g("a", "P"), g("b", "P", "c1"), g("c", "P", "c1"), g("d", "P")];
  assert.equal(moveWork(gallery, 1, -1), null);
  assert.equal(moveWork(gallery, 2, 1), null);
});

test("moveWork: null at a project's edge", () => {
  const gallery = [g("a", "P"), g("b", "Q")];
  assert.equal(moveWork(gallery, 0, 1), null);
  assert.equal(moveWork(gallery, 1, -1), null);
  assert.equal(moveWork(gallery, 0, -1), null);
});

test("moveCarousel: steps over a work or a carousel, null at the project's edge", () => {
  const gallery = [g("a", "P", "c1"), g("b", "P", "c1"), g("c", "P"), g("d", "P", "c2"), g("e", "P", "c2"), g("f", "Q")];
  assert.equal(ids(moveCarousel(gallery, "c1", 1)), "cabdef");
  assert.equal(ids(moveCarousel(gallery, "c2", -1)), "abdecf");
  assert.equal(moveCarousel(gallery, "c1", -1), null);
  assert.equal(moveCarousel(gallery, "c2", 1), null);
  assert.equal(moveCarousel(gallery, "nope", 1), null);
});

test("joinCarousel: into a run at the end by default, at a position otherwise", () => {
  const gallery = [g("a", "P", "c1"), g("b", "P", "c1"), g("c", "P"), g("d", "P")];
  const end = joinCarousel(gallery, 3, { carouselId: "c1", projectId: "P" });
  assert.equal(ids(end), "abdc");
  assert.equal(end[2].carouselId, "c1");
  const mid = joinCarousel(gallery, 3, { carouselId: "c1", projectId: "P" }, 1);
  assert.equal(ids(mid), "adbc");
});

test("joinCarousel at position 0 makes the work the lead, and normaliseLeads moves the old lead's fields", () => {
  const gallery = [g("a", "P", "c1", { size: "s", textAfter: "T" }), g("b", "P", "c1"), g("c", "P")];
  const joined = joinCarousel(gallery, 2, { carouselId: "c1", projectId: "P" }, 0);
  assert.equal(ids(joined), "cab");
  const norm = normaliseLeads(joined);
  assert.equal(norm[0].size, "s");
  assert.equal(norm[0].textAfter, "T");
  assert.equal("size" in norm[1], false);
  assert.equal("textAfter" in norm[1], false);
});

test("joinCarousel: an empty carousel and a work already in the project keeps its place", () => {
  const gallery = [g("a", "P"), g("b", "P"), g("c", "P")];
  const out = joinCarousel(gallery, 1, { carouselId: "new", projectId: "P" });
  assert.equal(ids(out), "abc");
  assert.equal(out[1].carouselId, "new");
});

test("joinCarousel: an empty carousel in another project moves the work to that project's end", () => {
  const gallery = [g("a", "P"), g("b", "P"), g("x", "Q"), g("y", "Q"), g("z", "R")];
  const out = joinCarousel(gallery, 0, { carouselId: "new", projectId: "Q" });
  assert.equal(ids(out), "bxyaz");
  assert.equal(out[3].projectId, "Q");
  assert.equal(out[3].carouselId, "new");
});

test("joinCarousel: arriving from another carousel leaves it", () => {
  const gallery = [g("a", "P", "c1"), g("b", "P", "c1"), g("c", "P", "c2"), g("d", "P", "c2")];
  const out = joinCarousel(gallery, 0, { carouselId: "c2", projectId: "P" });
  assert.equal(ids(out), "bcda");
  assert.deepEqual(out.map((x) => x.carouselId), ["c1", "c2", "c2", "c2"]);
});

test("takeOut: the middle slide lands after the last remaining slide, id cleared", () => {
  const gallery = [g("a", "P", "c1"), g("b", "P", "c1"), g("c", "P", "c1"), g("d", "P")];
  const out = takeOut(gallery, 1);
  assert.equal(ids(out), "acbd");
  assert.equal("carouselId" in out[2], false);
  assert.equal(out[0].carouselId, "c1");
});

test("takeOut: the only slide keeps its place; a work with no carousel changes nothing", () => {
  const gallery = [g("a", "P"), g("b", "P", "c1"), g("c", "P")];
  const out = takeOut(gallery, 1);
  assert.equal(ids(out), "abc");
  assert.equal("carouselId" in out[1], false);
  assert.deepEqual(takeOut(gallery, 0), gallery);
});

test("dissolve: clears the id from every slide and keeps the order", () => {
  const gallery = [g("a", "P"), g("b", "P", "c1"), g("c", "P", "c1"), g("d", "P", "c2")];
  const out = dissolve(gallery, "c1");
  assert.equal(ids(out), "abcd");
  assert.deepEqual(out.map((x) => x.carouselId), [undefined, undefined, undefined, "c2"]);
  assert.equal("carouselId" in out[1], false);
});

test("moveCarouselToProject: the run, together, to the end of the target project", () => {
  const gallery = [g("a", "P", "c1"), g("b", "P", "c1"), g("c", "P"), g("x", "Q"), g("y", "Q"), g("z", "R")];
  const out = moveCarouselToProject(gallery, "c1", "Q");
  assert.equal(ids(out), "cxyabz");
  assert.deepEqual(out.map((x) => x.projectId), ["P", "Q", "Q", "Q", "Q", "R"]);
  assert.deepEqual(out.slice(3, 5).map((x) => x.carouselId), ["c1", "c1"]);
});

test("handOffLead: the lead's fields are copied onto the second slide, heir is its index", () => {
  const gallery = [g("x", "P"), g("a", "P", "c1", { size: "s", textAfter: "T", textAfterDe: "D" }), g("b", "P", "c1")];
  const { gallery: out, heir } = handOffLead(gallery, 1);
  assert.equal(heir, 2);
  assert.equal(out[2].size, "s");
  assert.equal(out[2].textAfter, "T");
  assert.equal(out[2].textAfterDe, "D");
});

test("handOffLead: a run of one has no heir", () => {
  const gallery = [g("a", "P", "c1", { size: "s" }), g("b", "P")];
  const { gallery: out, heir } = handOffLead(gallery, 0);
  assert.equal(heir, undefined);
  assert.deepEqual(out, gallery);
});

test("handOffLead: not the lead, or no fields to hand over, has no heir", () => {
  const gallery = [g("a", "P", "c1", { size: "s" }), g("b", "P", "c1"), g("c", "P", "c2"), g("d", "P", "c2")];
  assert.equal(handOffLead(gallery, 1).heir, undefined);
  assert.equal(handOffLead(gallery, 2).heir, undefined);
});

test("handOffLead: a lead with textAfterDe only gives the heir textAfterDe only", () => {
  const gallery = [g("a", "P", "c1", { textAfterDe: "D" }), g("b", "P", "c1")];
  const { gallery: out, heir } = handOffLead(gallery, 0);
  assert.equal(heir, 1);
  assert.equal(out[1].textAfterDe, "D");
  assert.equal("size" in out[1], false);
  assert.equal("textAfter" in out[1], false);
});

test("projectCarouselIds: display order of the project, then its local empties", () => {
  const gallery = [g("a", "P", "c2"), g("b", "Q", "q1"), g("c", "P", "c1"), g("d", "P", "c1"), g("e", "P")];
  const local = [
    { carouselId: "n1", projectId: "P" },
    { carouselId: "c1", projectId: "P" },
    { carouselId: "m1", projectId: "Q" },
  ];
  assert.deepEqual(projectCarouselIds(gallery, "P", local), ["c2", "c1", "n1"]);
  assert.deepEqual(projectCarouselIds(gallery, "Q", local), ["q1", "m1"]);
  assert.deepEqual(projectCarouselIds(gallery, "Z", []), []);
});

test("none of the moves mutates its input", () => {
  const gallery = frozen([g("a", "P", "c1", { size: "s" }), g("b", "P", "c1"), g("c", "P"), g("d", "Q")]);
  const snapshot = structuredClone(gallery);
  moveWork(gallery, 2, -1);
  moveWork(gallery, 0, 1);
  moveCarousel(gallery, "c1", 1);
  joinCarousel(gallery, 2, { carouselId: "c1", projectId: "P" }, 0);
  joinCarousel(gallery, 3, { carouselId: "new", projectId: "P" });
  takeOut(gallery, 0);
  dissolve(gallery, "c1");
  moveCarouselToProject(gallery, "c1", "Q");
  handOffLead(gallery, 0);
  projectCarouselIds(gallery, "P", []);
  assert.deepEqual(gallery, snapshot);
});
