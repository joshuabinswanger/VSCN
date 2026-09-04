// Shared harness for the rules tests. Contexts use the COMPAT API
// (ctx.firestore().doc(path).set(...)), which is what rules-unit-testing hands
// back; the modular client SDK is not used here.
import { readFileSync } from "node:fs";
import { setLogLevel } from "firebase/firestore";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";

// The compat SDK logs every rejected write as a console error (that is what
// assertFails is asserting on) — silence it so `npm run test:rules` output
// stays readable as more assertFails cases are added.
setLogLevel("silent");

export { assertFails, assertSucceeds };

export const PROJECT_ID = "demo-vscn-rules";
export const OWNER = "owner-uid-000001";
export const OTHER = "other-uid-000002";
export const ADMIN = "admin-uid-000003";

/** Token claims for a verified member. Pass `{ admin: true }` for an admin. */
export function verified(uid, extra = {}) {
  return { email: `${uid}@example.test`, email_verified: true, ...extra };
}

/** Token claims for a member who signed up but never clicked the link. */
export function unverified(uid, extra = {}) {
  return { email: `${uid}@example.test`, email_verified: false, ...extra };
}

/** The one image id an unverified account may address, per kind. */
export function slot(uid, kind) {
  return `${uid}-${kind}`;
}

export async function setupEnv() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
}

/** Writes a document with rules disabled — for fixtures, never for assertions. */
export async function seed(env, path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

/** A valid private profile a verified owner may write today. */
export function minimalUser(uid) {
  return {
    displayName: "Test Member",
    photoURL: "",
    role: "Illustrator",
    bio: "Draws things.",
    portfolio: "",
    socialMedia: "",
    openTo: [],
    primaryAudiences: [],
    tags: [],
    gallery: [],
    phone: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
