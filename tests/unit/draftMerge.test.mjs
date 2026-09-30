// The profile editor's tab draft, pure: what counts as unsaved and how a
// recovered draft folds onto the account's current state. /profile needs a
// session, so these are the rules a browser walk cannot reach locally
// (review 2026-09-28: "upload one image, leave" prompted and offered an empty
// draft; a restore replaced the gallery and orphaned an image uploaded since).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_MAX_AGE_MS,
  committedForNew,
  committedFromLoad,
  draftOffer,
  guardedLinkHref,
  leaveCopy,
  mergeDraftGallery,
  mergeDraftProjects,
  projectSignature,
  uncommittedWorks,
  workWords,
} from "../../src/lib/draftMerge.ts";

const work = (imageId, extra = {}) => ({ imageId, url: `u/${imageId}`, caption: "", width: 4, height: 3, ...extra });

test("committed membership and order are not unsaved; a typed caption is", () => {
  const a = work("a", { caption: "A" });
  const b = work("b", { caption: "B", tags: ["x"] });
  const committed = committedFromLoad([a, b]);
  assert.deepEqual(uncommittedWorks([a, b], committed), []);
  // A move stores its order at once; the dirty signature must not see it.
  assert.deepEqual(uncommittedWorks([b, a], committed), []);
  // A removal stores the array at once.
  assert.deepEqual(uncommittedWorks([b], committed), []);
  // Typing is Save's business.
  const edited = { ...a, caption: "A edited" };
  assert.deepEqual(uncommittedWorks([edited, b], committed), [{ imageId: "a", words: workWords(edited) }]);
  // Same tags in the same order are the same words; a reorder of the list is not.
  assert.deepEqual(uncommittedWorks([a, { ...b, tags: ["x"] }], committed), []);
  assert.equal(uncommittedWorks([a, { ...b, tags: ["x", "y"] }], committed).length, 1);
});

test("a work that just arrived is committed with its initial words, but not its block", () => {
  const committed = committedFromLoad([]);
  const video = work("v", { caption: "Platform title", embed: { provider: "youtube", videoId: "1" } });
  committed.set("v", committedForNew(video));
  // Upload one video, leave: nothing to prompt about.
  assert.deepEqual(uncommittedWorks([video], committed), []);
  // Dropped into a project: the record does not carry the block until Save.
  const inBlock = work("p", { projectId: "P" });
  committed.set("p", committedForNew(inBlock));
  assert.deepEqual(uncommittedWorks([inBlock], committed), [{ imageId: "p", words: workWords(inBlock) }]);
});

test("uncommitted works are keyed by id, sorted, independent of gallery order", () => {
  const committed = committedFromLoad([work("b"), work("a")]);
  const gallery = [work("b", { caption: "bb" }), work("a", { caption: "aa" })];
  const one = uncommittedWorks(gallery, committed);
  const two = uncommittedWorks(gallery.slice().reverse(), committed);
  assert.deepEqual(one.map((w) => w.imageId), ["a", "b"]);
  assert.deepEqual(JSON.stringify(one), JSON.stringify(two));
});

test("restore keeps the live gallery and applies the draft's words to works present in both", () => {
  // Live NOW: a (unchanged), c (uploaded since the draft), b removed since.
  const live = [work("a", { caption: "A", link: "old.example" }), work("c", { caption: "" })];
  const draft = [
    { imageId: "a", words: { ...workWords(live[0]), caption: "A typed", link: "", tags: ["t"] } },
    { imageId: "b", words: { ...workWords(work("b")), caption: "gone" } },
  ];
  const merged = mergeDraftGallery(live, draft, new Set());
  assert.deepEqual(merged.map((g) => g.imageId), ["a", "c"], "membership and order are the live ones");
  assert.equal(merged[0].caption, "A typed");
  assert.equal("link" in merged[0], false, "an emptied optional field is deleted, not written as ''");
  assert.deepEqual(merged[0].tags, ["t"]);
  assert.equal(merged[1].caption, "", "an image uploaded since the draft is untouched, not dropped");
  assert.equal(merged[0].url, "u/a", "non-word fields are the live record's");
});

test("restore's block membership: the draft's block if it still exists, else the record's own", () => {
  const live = [work("x", { projectId: "P" }), work("y"), work("z", { projectId: "P" })];
  const draft = [
    { imageId: "y", words: { ...workWords(live[1]), projectId: "P" } }, // moved into P, unsaved
    { imageId: "x", words: { ...workWords(live[0]), projectId: "GONE" } }, // into a block deleted since
    { imageId: "z", words: { ...workWords(live[2]), projectId: "" } }, // moved out, unsaved
  ];
  const merged = mergeDraftGallery(live, draft, new Set(["P"]));
  const byId = Object.fromEntries(merged.map((g) => [g.imageId, g.projectId]));
  assert.equal(byId.x, "P", "a block that no longer exists cannot be named; the record's stays");
  assert.equal(byId.y, "P");
  assert.equal(byId.z, undefined);
  // Members of a block stay adjacent, as at load.
  assert.deepEqual(merged.map((g) => g.imageId), ["x", "y", "z"]);
});

test("restore's projects: fields onto stored ones, deletions redone, elsewhere-deleted dropped, new kept", () => {
  const stored = (projectId, title) => ({ projectId, title, affiliations: [] });
  const live = [stored("P1", "old one"), stored("P2", "two"), stored("P4", "four")];
  const draft = {
    projects: [
      { ...stored("P1", "typed one"), affiliations: [{ mode: "name", name: "Lab" }] },
      stored("P3", "deleted elsewhere since"),
      stored("N1", "never saved"),
      // P2 absent: deleted in the draft. P4 absent and not in deletedProjectIds: unknown to the draft... kept.
    ],
    storedProjectIds: ["P1", "P2", "P3"],
    deletedProjectIds: ["P2"],
  };
  const { projects, deleted } = mergeDraftProjects(live, draft, new Set(["P1", "P2", "P4"]));
  assert.deepEqual(projects.map((p) => p.projectId), ["P1", "P4", "N1"]);
  assert.equal(projects[0].title, "typed one");
  assert.deepEqual(projects[0].affiliations, [{ mode: "name", name: "Lab" }]);
  assert.equal(projects[1].title, "four", "a project the draft never knew stays as loaded");
  assert.deepEqual(deleted, ["P2"], "the draft's deletion is made again for Save");
  // Copies, not the draft's own objects.
  projects[0].affiliations.push({ mode: "name", name: "x" });
  assert.equal(draft.projects[0].affiliations.length, 1);
});

test("project signature ignores order (a block move reorders and stores it)", () => {
  const a = { projectId: "a", affiliations: [] };
  const b = { projectId: "b", affiliations: [] };
  assert.equal(JSON.stringify(projectSignature([b, a])), JSON.stringify(projectSignature([a, b])));
});

test("the leave guard takes exactly the clicks the ClientRouter would", () => {
  const here = "https://vscn.ch/profile?x=1#work";
  const click = { button: 0, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false };
  const link = { href: "https://vscn.ch/community", target: "", download: false, reload: false };
  assert.equal(guardedLinkHref(link, click, here), "https://vscn.ch/community");
  assert.equal(guardedLinkHref({ ...link, href: "/de/profile" }, click, here), "https://vscn.ch/de/profile", "the EN/DE switch is a plain link");
  // Left alone: the page stays where it is, or the router would not handle it.
  assert.equal(guardedLinkHref(link, { ...click, button: 1 }, here), null);
  assert.equal(guardedLinkHref(link, { ...click, ctrlKey: true }, here), null);
  assert.equal(guardedLinkHref(link, { ...click, metaKey: true }, here), null);
  assert.equal(guardedLinkHref(link, { ...click, shiftKey: true }, here), null);
  assert.equal(guardedLinkHref(link, { ...click, altKey: true }, here), null);
  assert.equal(guardedLinkHref(link, { ...click, defaultPrevented: true }, here), null);
  assert.equal(guardedLinkHref({ ...link, target: "_blank" }, click, here), null);
  assert.equal(guardedLinkHref({ ...link, target: "_self" }, click, here), "https://vscn.ch/community");
  assert.equal(guardedLinkHref({ ...link, download: true }, click, here), null);
  assert.equal(guardedLinkHref({ ...link, reload: true }, click, here), null, "data-astro-reload is a full load: beforeunload's job");
  assert.equal(guardedLinkHref({ ...link, href: "https://example.org/" }, click, here), null);
  assert.equal(guardedLinkHref({ ...link, href: "" }, click, here), null);
  assert.equal(guardedLinkHref({ ...link, href: "https://vscn.ch/profile?x=1#account" }, click, here), null, "a hash on the same page moves nothing");
  assert.equal(guardedLinkHref({ ...link, href: "https://vscn.ch/profile?x=1" }, click, here), "https://vscn.ch/profile?x=1", "the same page without a hash is a soft reload");
  assert.equal(guardedLinkHref({ ...link, href: "https://vscn.ch/profile?x=2#work" }, click, here), "https://vscn.ch/profile?x=2#work");
});

test("a stored draft is offered only when it holds words the page does not", () => {
  const now = 1_000_000;
  const page = { version: 2, now, serverUpdatedAt: 500_000, current: JSON.stringify({ fields: { role: "loaded" } }) };
  const draft = { version: 2, at: now - 60_000, loadedAt: 500_000, value: { fields: { role: "typed" } } };
  assert.deepEqual(draftOffer(draft, page), { kind: "restore", newer: false });
  // Nothing, wrong shape, another version, expired: no banner.
  assert.deepEqual(draftOffer(null, page), { kind: "none" });
  assert.deepEqual(draftOffer("x", page), { kind: "none" });
  assert.deepEqual(draftOffer({ ...draft, version: 1 }, page), { kind: "none" });
  assert.deepEqual(draftOffer({ ...draft, at: now - DRAFT_MAX_AGE_MS }, page), { kind: "none" });
  // The words are on the page already (saved since, here or elsewhere): a Restore would change nothing.
  assert.deepEqual(draftOffer({ ...draft, value: { fields: { role: "loaded" } } }, page), { kind: "none" });
  // Only account settings or a chosen file were unsaved: the reminder, no Restore.
  assert.deepEqual(draftOffer({ ...draft, value: null }, page), { kind: "unkept" });
});

test("the conflict warning compares the server stamp with the copy the draft was based on, not the last keystroke", () => {
  const now = 1_000_000;
  const current = JSON.stringify({ role: "loaded" });
  const value = { role: "typed" };
  // Loaded at T0, saved elsewhere at T2, typed at T3 > T2: still a conflict.
  const t0 = 100_000, t2 = 200_000, t3 = 300_000;
  assert.deepEqual(draftOffer({ version: 2, at: t3, loadedAt: t0, value }, { version: 2, now, serverUpdatedAt: t2, current }), { kind: "restore", newer: true });
  // This tab's own save: loadedAt is refreshed to its clock, at or after the stamp it wrote.
  assert.deepEqual(draftOffer({ version: 2, at: t3, loadedAt: t2 + 900, value }, { version: 2, now, serverUpdatedAt: t2, current }), { kind: "restore", newer: false });
  // Two seconds of clock slack, as before.
  assert.deepEqual(draftOffer({ version: 2, at: t3, loadedAt: t0, value }, { version: 2, now, serverUpdatedAt: t0 + 1500, current }), { kind: "restore", newer: false });
  // Never saved when the draft was written; any stamp now means a save since.
  assert.deepEqual(draftOffer({ version: 2, at: t3, loadedAt: null, value }, { version: 2, now, serverUpdatedAt: t2, current }), { kind: "restore", newer: true });
  assert.deepEqual(draftOffer({ version: 2, at: t3, loadedAt: null, value }, { version: 2, now, current }), { kind: "restore", newer: false });
  // A draft from before loadedAt existed falls back to the old rule.
  assert.deepEqual(draftOffer({ version: 2, at: t3, value }, { version: 2, now, serverUpdatedAt: t2, current }), { kind: "restore", newer: false });
  assert.deepEqual(draftOffer({ version: 2, at: t0, value }, { version: 2, now, serverUpdatedAt: t2, current }), { kind: "restore", newer: true });
});

test("the leave dialog promises a draft only when one was written, and names uploads first", () => {
  const labels = { leave: "kept", leaveUnkept: "lost", leaveBusy: "uploads" };
  assert.equal(leaveCopy({ busy: false, kept: true }, labels), "kept");
  assert.equal(leaveCopy({ busy: false, kept: false }, labels), "lost", "storage refused it, or only account fields changed");
  assert.equal(leaveCopy({ busy: true, kept: true }, labels), "uploads");
  assert.equal(leaveCopy({ busy: true, kept: false }, labels), "uploads");
  // A caller with only the one sentence keeps it.
  assert.equal(leaveCopy({ busy: true, kept: false }, { leave: "kept" }), "kept");
  assert.equal(leaveCopy({ busy: false, kept: false }, { leave: "kept" }), "kept");
});
