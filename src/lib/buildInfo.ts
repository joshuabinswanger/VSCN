// WHICH BUILD AM I LOOKING AT.
//
// The public directory and every member page are a BUILD-TIME SNAPSHOT of
// Firestore (see the dual data path in CLAUDE.md), so the age of the snapshot
// is load-bearing information — and until 2026-09-03 nothing on the page said
// what it was. Answering "is the deployed site current?" meant counting sitemap
// entries, grepping the HTML for marker classes and asking the Hosting API for
// a release time, and getting it wrong sends you hunting a data bug that is
// really a stale build.
//
// So Layout stamps the commit and the build time into every page's <head>.
// One `curl … | grep build-` now answers it.
//
// Evaluated ONCE per build: this is module scope, and Astro imports it once
// into a single Layout — not per page. `git` is shelled out for exactly the two
// facts it can give and nothing else.
import { execSync } from "node:child_process";

/** Short SHA of the commit the site was built from, or a stand-in. */
export const BUILD_COMMIT: string = resolveCommit();

/** ISO instant the build started (i.e. when this module was first evaluated). */
export const BUILD_TIME: string = new Date().toISOString();

function resolveCommit(): string {
  // CI hands the SHA over in the environment and often builds from a shallow
  // or detached checkout, so the env var is tried FIRST — asking git there can
  // answer for the wrong ref.
  const fromEnv = process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    // `git describe`'s --dirty, so a build made from an edited tree cannot be
    // mistaken for the commit it was based on. That case is the whole reason a
    // stamp is worth having during a review pass.
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim()
      .concat(isDirty() ? "-dirty" : "");
  } catch {
    // No git, no env: a tarball build. Say so rather than inventing a SHA —
    // "unknown" is a fact, a wrong SHA is a lie that costs someone an hour.
    return "unknown";
  }
}

function isDirty(): boolean {
  try {
    return (
      execSync("git status --porcelain", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().length > 0
    );
  } catch {
    return false;
  }
}
