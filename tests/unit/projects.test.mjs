// The one module every surface asks about projects: the build, the member
// page, the editor preview, the lightbox and the structured data. Pure, so
// each rule is pinned here once rather than per renderer.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toProfileProject, ownProjects, contiguousOrder, groupWorks, inheritedSiteLink,
  projectTitle, projectDescription, resolveMemberCredits, affiliationHref,
  projectSlideData, projectFields, editorBlocks, emptyProjectIds,
} from "../../src/lib/projects.ts";

const UID = "owner-uid-000001";
const rec = (projectId, extra = {}) => ({ projectId, ownerUid: UID, ...extra });

test("toProfileProject trims, links through workLink, and splits the two affiliation shapes", () => {
  const p = toProfileProject(rec("p1", {
    title: "  Ribosome  ", description: "", link: "lab.example.org/r",
    affiliations: [
      { name: "ETH Zürich", url: "ethz.ch" },
      { name: "Plain Org" },
      { name: "Not a link", url: "nolink" },
      { memberUid: "anna-uid", name: "Anna Meier" },
      { name: "   " },
    ],
  }));
  assert.equal(p.id, "p1");
  assert.equal(p.title, "Ribosome");
  assert.equal("description" in p, false);
  assert.equal(p.link, "https://lab.example.org/r");
  assert.deepEqual(p.affiliations, [
    { name: "ETH Zürich", href: "https://ethz.ch" },
    { name: "Plain Org" },
    { name: "Not a link" },
    { name: "Anna Meier", memberUid: "anna-uid" },
  ]);
});

test("ownProjects ignores someone else's project", () => {
  const out = ownProjects(UID, [rec("mine"), { projectId: "theirs", ownerUid: "other" }]);
  assert.deepEqual(out.map((p) => p.id), ["mine"]);
});

test("contiguousOrder gathers each group at its first member and keeps loose items in place", () => {
  const items = ["a:p", "b", "c:q", "d:p", "e", "f:q"].map((s) => ({ id: s[0], g: s.split(":")[1] }));
  const out = contiguousOrder(items, (i) => i.g);
  assert.deepEqual(out.map((i) => i.id), ["a", "d", "b", "c", "f", "e"]);
});

test("groupWorks: loose runs, project blocks, unknown projects read as loose", () => {
  const works = [
    { id: 1 }, { id: 2, projectId: "p" }, { id: 3, projectId: "p" },
    { id: 4, projectId: "ghost" }, { id: 5 },
  ];
  const sections = groupWorks(works, [toProfileProject(rec("p", { title: "P" }))]);
  assert.deepEqual(sections.map((s) => [s.project?.id ?? null, s.works.map((w) => w.id)]), [
    [null, [1]], ["p", [2, 3]], [null, [4, 5]],
  ]);
});

test("groupWorks gathers a non-contiguous project at its first image", () => {
  const works = [{ id: 1, projectId: "p" }, { id: 2 }, { id: 3, projectId: "p" }];
  const sections = groupWorks(works, [toProfileProject(rec("p"))]);
  assert.deepEqual(sections.map((s) => [s.project?.id ?? null, s.works.map((w) => w.id)]), [
    ["p", [1, 3]], [null, [2]],
  ]);
});

test("inheritedSiteLink: the image's own link wins, else the project's, else none", () => {
  assert.equal(inheritedSiteLink("https://me.ch/w", { link: "https://lab.org" }), "https://me.ch/w");
  assert.equal(inheritedSiteLink(undefined, { link: "https://lab.org" }), "https://lab.org");
  assert.equal(inheritedSiteLink(undefined, undefined), undefined);
});

test("title and description fall back both ways", () => {
  assert.equal(projectTitle({ title: "EN" }, "de"), "EN");
  assert.equal(projectTitle({ titleDe: "DE" }, "en"), "DE");
  assert.equal(projectTitle({ title: "EN", titleDe: "DE" }, "de"), "DE");
  assert.equal(projectTitle({}, "en"), undefined);
  assert.equal(projectDescription({ description: "d" }, "de"), "d");
});

test("member credits link only while the member is in the directory", () => {
  const p = toProfileProject(rec("p", { affiliations: [{ memberUid: "anna", name: "Anna" }, { memberUid: "gone", name: "Gone" }] }));
  const resolved = resolveMemberCredits(p, new Map([["anna", "anna-meier"]]));
  assert.equal(affiliationHref(resolved.affiliations[0], "en"), "/members/anna-meier");
  assert.equal(affiliationHref(resolved.affiliations[0], "de"), "/de/members/anna-meier");
  assert.equal(affiliationHref(resolved.affiliations[1], "en"), undefined);
});

test("projectSlideData: title, link and affiliations for a lightbox trigger", () => {
  const p = resolveMemberCredits(toProfileProject(rec("p", {
    title: "P", titleDe: "P-de", link: "lab.org",
    affiliations: [{ name: "ETH", url: "ethz.ch" }, { memberUid: "anna", name: "Anna" }],
  })), new Map([["anna", "anna-meier"]]));
  assert.deepEqual(projectSlideData(p, "de"), {
    project: "P-de",
    projectLink: "https://lab.org",
    affiliations: JSON.stringify([{ name: "ETH", href: "https://ethz.ch" }, { name: "Anna", href: "/de/members/anna-meier" }]),
  });
  assert.deepEqual(projectSlideData(undefined, "en"), {});
  assert.deepEqual(projectSlideData(toProfileProject(rec("p")), "en"), {});
});

test("projectFields trims, drops empties, strips schemes and caps affiliations", () => {
  const out = projectFields({
    title: "  T ", titleDe: "", description: " ", link: " https://lab.org/x ",
    affiliations: [
      { name: " ETH ", url: "https://ethz.ch" }, { name: "", url: "x.ch" }, { name: "Plain", url: " " },
      { memberUid: "anna", name: " Anna " },
      ...Array.from({ length: 12 }, (_, i) => ({ name: `Org ${i}` })),
    ],
  });
  assert.equal(out.title, "T");
  assert.equal("titleDe" in out, false);
  assert.equal("description" in out, false);
  assert.equal(out.link, "lab.org/x");
  assert.equal(out.affiliations.length, 10);
  assert.deepEqual(out.affiliations.slice(0, 3), [
    { name: "ETH", url: "ethz.ch" }, { name: "Plain" }, { memberUid: "anna", name: "Anna" },
  ]);
  assert.equal("affiliations" in projectFields({ affiliations: [{ name: "" }] }), false);
});

test("editorBlocks: loose rows, project blocks in gallery order, empty projects last", () => {
  const gallery = [{}, { projectId: "p" }, { projectId: "p" }, { projectId: "ghost" }, {}];
  const blocks = editorBlocks(gallery, [{ projectId: "p" }, { projectId: "empty" }]);
  assert.deepEqual(blocks, [
    { kind: "image", index: 0 },
    { kind: "project", projectId: "p", indices: [1, 2] },
    { kind: "image", index: 3 },
    { kind: "image", index: 4 },
    { kind: "project", projectId: "empty", indices: [] },
  ]);
  assert.deepEqual(emptyProjectIds(gallery, [{ projectId: "p" }, { projectId: "empty" }]), ["empty"]);
});
