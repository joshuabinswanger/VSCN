import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CORRESPONDENCE_LANGUAGE,
  toCommunityMailRecipient,
} from "../../scripts/lib/community-mailing.mjs";

test("community mailing export includes only explicit opt-ins", () => {
  assert.equal(toCommunityMailRecipient("unknown", { email: "unknown@example.test" }), null);
  assert.equal(toCommunityMailRecipient("opted-out", {
    email: "out@example.test", receiveCommunityEmails: false,
  }), null);
  assert.equal(toCommunityMailRecipient("string", {
    email: "string@example.test", receiveCommunityEmails: "true",
  }), null);
});

test("community mailing export uses the stored preference and a German legacy fallback", () => {
  assert.deepEqual(toCommunityMailRecipient("en-member", {
    displayName: "English member",
    email: " en@example.test ",
    receiveCommunityEmails: true,
    correspondenceLanguage: "en",
  }), {
    uid: "en-member",
    displayName: "English member",
    email: "en@example.test",
    correspondenceLanguage: "en",
  });
  assert.equal(toCommunityMailRecipient("legacy-language", {
    email: "legacy@example.test", receiveCommunityEmails: true,
  }).correspondenceLanguage, DEFAULT_CORRESPONDENCE_LANGUAGE);
  assert.equal(toCommunityMailRecipient("invalid-language", {
    email: "legacy@example.test", receiveCommunityEmails: true, correspondenceLanguage: "fr",
  }).correspondenceLanguage, "de");
});

test("community mailing export refuses opted-in records without an email", () => {
  assert.equal(toCommunityMailRecipient("missing-email", { receiveCommunityEmails: true }), null);
  assert.equal(toCommunityMailRecipient("empty-email", {
    receiveCommunityEmails: true, email: "   ",
  }), null);
});
test("community mailing excludes opted-in accounts pending deletion", () => {
  assert.equal(toCommunityMailRecipient("member", {
    receiveCommunityEmails: true,
    email: "member@example.test",
    status: "pendingDeletion",
  }), null);
  assert.equal(toCommunityMailRecipient("member", {
    receiveCommunityEmails: true,
    email: "member@example.test",
    status: "active",
  }).email, "member@example.test");
});