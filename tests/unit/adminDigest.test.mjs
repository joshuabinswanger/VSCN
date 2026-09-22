// The operator's digest (functions/src/notify.ts). Pure on purpose: the
// schedule in adminDigest.ts gathers the facts and hands over plain values,
// so this file needs no firebase-functions in node_modules to be tested here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminDigest, deliver } from "../../functions/src/notify.ts";

const created = new Date("2026-09-22T14:03:00Z");

const finished = {
  kind: "signup", uid: "abc123", email: "ada@example.org", createdAt: created, deleted: false, emailVerified: true,
  onboardingComplete: true, wantsToContribute: true, phoneGiven: false,
  profile: {
    displayName: "Ada Lovelace", memberType: "illustrator", role: "Scientific illustrator", affiliation: "ETH Zürich", location: "Zürich",
    portfolio: "ada.example.org", socialMedia: null, languages: ["en", "de"], openTo: ["commissions"], visualNeeds: [],
    primaryAudiences: ["researchers"], tags: ["anatomy", "botany"], bioLength: 240, active: true,
  },
  images: { gallery: 3, avatar: true },
  requestMessage: "Hello!\nLooking forward to it.",
};

const abandoned = {
  kind: "signup", uid: "zzz999", email: "bob@example.org", createdAt: created, deleted: false, emailVerified: false,
  onboardingComplete: false, wantsToContribute: false, phoneGiven: false, profile: null, images: { gallery: 0, avatar: false }, requestMessage: null,
};

const image = (over = {}) => ({
  kind: "image", imageId: "img1", uid: "abc123", ownerName: "Ada Lovelace", imageKind: "gallery", deleted: false,
  caption: "Heart, coronal", width: 3000, height: 2000, url: "https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fabc123%2Fgallery%2Fimg1.webp?alt=media",
  at: created, ...over,
});

test("nothing due, nothing sent", () => {
  assert.equal(adminDigest([], "vscn-39508"), null);
});

test("a finished signup is reported by NAME with what they entered, not merely that an address appeared", () => {
  const msg = adminDigest([finished], "vscn-39508");
  assert.equal(msg.subject, "VSCN: Ada Lovelace signed up");
  assert.match(msg.text, /Wizard:\s+finished/);
  assert.match(msg.text, /ada@example\.org\s+\(verified: yes\)/);
  assert.match(msg.text, /Type:\s+illustrator · Scientific illustrator/);
  assert.match(msg.text, /Where:\s+ETH Zürich, Zürich/);
  assert.match(msg.text, /Tags:\s+anatomy, botany/);
  assert.match(msg.text, /Images:\s+3 in the gallery, avatar yes/);
  assert.match(msg.text, /> Hello!\n> Looking forward to it\./);
  assert.match(msg.text, /https:\/\/vscn\.ch\/admin/);
});

test("an abandoned signup says so and falls back to the address, and dev mail is marked", () => {
  const msg = adminDigest([abandoned], "vscn-dev-f4b60");
  assert.equal(msg.subject, "[dev] VSCN: bob@example.org signed up");
  assert.match(msg.text, /Wizard:\s+NOT finished/);
  assert.match(msg.text, /Profile:\s+none written/);
  assert.match(msg.text, /verified: no/);
  assert.match(msg.text, /https:\/\/vscn-dev-f4b60\.web\.app\/admin/);
});

test("an account deleted again before the digest ran is reported as exactly that, with no profile guesswork", () => {
  const msg = adminDigest([{ ...abandoned, deleted: true }], "vscn-39508");
  assert.match(msg.text, /deleted again before this report ran/);
  assert.doesNotMatch(msg.text, /Wizard:/);
});

test("a gallery upload is one mail listing the images, each with its public URL", () => {
  const msg = adminDigest([image(), image({ imageId: "img2", caption: null, width: null, height: null })], "vscn-39508");
  assert.equal(msg.subject, "VSCN: 2 images from Ada Lovelace");
  assert.match(msg.text, /- Ada Lovelace: gallery 3000×2000 — "Heart, coronal"\n {2}https:\/\/firebasestorage/);
  assert.match(msg.text, /- Ada Lovelace: gallery\n/);
});

test("a single image and a signup share one subject; an image gone again is named, not linked", () => {
  const msg = adminDigest([finished, image({ deleted: true, url: null, ownerName: null })], "vscn-39508");
  assert.equal(msg.subject, "VSCN: Ada Lovelace signed up; an image from abc123");
  assert.match(msg.text, /- abc123: gallery image img1 — gone again before this report/);
});

test("many signups and several members' images collapse into counts in the subject", () => {
  const msg = adminDigest([finished, abandoned, { ...abandoned, uid: "c" }, image(), image({ uid: "q", ownerName: "Quinn" })], "vscn-39508");
  assert.equal(msg.subject, "VSCN: 3 people signed up; 2 images from 2 members");
});

test("deliver reports a failed send as false through onError, never as a throw — the queue retries, the member never notices", async () => {
  const errors = [];
  assert.equal(await deliver(async () => { throw new Error("535 authentication failed"); }, { subject: "S", text: "T" }, (d) => errors.push(d)), false);
  assert.match(errors[0], /535 authentication failed/);
  const sent = [];
  assert.equal(await deliver(async (m) => { sent.push(m); }, { subject: "S", text: "T" }), true);
  assert.deepEqual(sent, [{ subject: "S", text: "T" }]);
});
