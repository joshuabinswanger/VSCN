import { test } from "node:test";
import assert from "node:assert/strict";
import { isProfileVisible } from "../../src/lib/profileVisibility.ts";

test("moderation excludes a member regardless of their publishing preference", () => {
  for (const active of [undefined, true, false]) {
    assert.equal(isProfileVisible({ active, moderationHidden: true }), false);
  }
});

test("removing moderation preserves the member's own visibility choice", () => {
  assert.equal(isProfileVisible({ active: false, moderationHidden: false }), false);
  assert.equal(isProfileVisible({ active: true, moderationHidden: false }), true);
  assert.equal(isProfileVisible({}), true);
});
