import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";

// Set with: npx -y firebase-tools@latest functions:secrets:set GITHUB_REBUILD_TOKEN
// Needs workflow-dispatch rights on the site repo. Never PUBLIC_* — the token
// must stay out of the client bundle. Every function that calls
// dispatchRebuild() must list this secret in its options.
export const githubRebuildToken = defineSecret("GITHUB_REBUILD_TOKEN");

// Non-secret params, loaded from functions/.env at deploy time.
const githubOwner = defineString("GITHUB_OWNER");
const githubRepo = defineString("GITHUB_REPO");

// Which workflow this deployment rebuilds. Defaults to the production deploy so
// existing prod behaviour is unchanged; the dev project overrides both in
// functions/.env.vscn-dev-f4b60 so a staging save never dispatches a
// production deploy.
const githubWorkflow = defineString("GITHUB_WORKFLOW", {
  default: "firebase-hosting-merge.yml",
});
const githubRef = defineString("GITHUB_REF", { default: "main" });

/**
 * Dispatches the hosting workflow so the static pages get rebuilt. Best-effort
 * for internal callers: returns false and logs rather than throwing, because a
 * deletion that succeeded should not be reported as failed over a rebuild.
 */
export async function dispatchRebuild(): Promise<boolean> {
  const owner = githubOwner.value();
  const repo = githubRepo.value();
  const workflow = githubWorkflow.value();
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubRebuildToken.value()}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: githubRef.value() }),
      }
    );
    if (!res.ok) {
      logger.error(`Rebuild dispatch failed: ${res.status}`, { body: await res.text() });
      return false;
    }
    logger.info("Rebuild dispatched", { workflow });
    return true;
  } catch (err) {
    logger.error("Rebuild dispatch threw", { err: String(err) });
    return false;
  }
}

/**
 * Callable from the client via the Firebase Functions SDK after a profile
 * change; requires a signed-in user. Behaviour unchanged from before the split.
 */
export const requestRebuild = onCall({ secrets: [githubRebuildToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  const ok = await dispatchRebuild();
  if (!ok) throw new HttpsError("internal", "Rebuild dispatch failed.");
  logger.info("Rebuild requested", { uid: request.auth.uid });
  return { ok: true };
});
