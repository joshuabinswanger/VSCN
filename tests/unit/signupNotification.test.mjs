// The admin ping on account creation (functions/src/notify.ts). Pure on
// purpose: the trigger in authTriggers.ts hands over values and a fetch, so
// this file needs no firebase-functions in node_modules to be tested from here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signupNotification, sendViaBrevo, parseSender } from "../../functions/src/notify.ts";

const created = new Date("2026-09-10T14:03:00Z");

test("the subject says someone STARTED signing up, because Auth-create fires at wizard step 1", () => {
  const msg = signupNotification({ email: "ada@example.org", uid: "abc123", createdAt: created, projectId: "vscn-39508" });
  assert.equal(msg.subject, "ada@example.org started signing up to VSCN");
});

test("the dev project is marked in the subject so the two inboxes' worth of mail stay tellable apart", () => {
  const msg = signupNotification({ email: "ada@example.org", uid: "abc123", createdAt: created, projectId: "vscn-dev-f4b60" });
  assert.equal(msg.subject, "[dev] ada@example.org started signing up to VSCN");
});

test("the body carries the address, the uid and the time, and points at the admin console", () => {
  const msg = signupNotification({ email: "ada@example.org", uid: "abc123", createdAt: created, projectId: "vscn-39508" });
  assert.match(msg.text, /ada@example\.org/);
  assert.match(msg.text, /abc123/);
  assert.match(msg.text, /2026-09-10T14:03:00/);
  assert.match(msg.text, /https:\/\/vscn\.ch\/admin/);
});

test("a missing email still produces a readable message rather than 'undefined started signing up'", () => {
  const msg = signupNotification({ email: undefined, uid: "abc123", createdAt: created, projectId: "vscn-39508" });
  assert.equal(msg.subject, "Someone started signing up to VSCN");
});

test("parseSender splits 'Name <addr>' into Brevo's two fields, and a bare address stands alone", () => {
  assert.deepEqual(parseSender("VSCN <notifications@vscn.ch>"), { name: "VSCN", email: "notifications@vscn.ch" });
  assert.deepEqual(parseSender("notifications@vscn.ch"), { email: "notifications@vscn.ch" });
});

test("sendViaBrevo POSTs the message to Brevo's transactional endpoint with the api-key header, sender → to", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 201, text: async () => "" }; };
  const ok = await sendViaBrevo(fakeFetch, { apiKey: "xkeysib-test", from: "VSCN <notifications@vscn.ch>", to: "josh@example.org" }, { subject: "S", text: "T" });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["api-key"], "xkeysib-test");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    sender: { name: "VSCN", email: "notifications@vscn.ch" },
    to: [{ email: "josh@example.org" }],
    subject: "S",
    textContent: "T",
  });
});

test("a non-2xx from Brevo is reported as false, never thrown — a broken key must not fail a signup", async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, text: async () => "Key not found" });
  const ok = await sendViaBrevo(fakeFetch, { apiKey: "x", from: "a@b", to: "c@d" }, { subject: "S", text: "T" });
  assert.equal(ok, false);
});

test("a fetch that throws is also reported as false", async () => {
  const fakeFetch = async () => { throw new Error("ENOTFOUND"); };
  const ok = await sendViaBrevo(fakeFetch, { apiKey: "x", from: "a@b", to: "c@d" }, { subject: "S", text: "T" });
  assert.equal(ok, false);
});
