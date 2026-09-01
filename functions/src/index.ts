import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";

// Set with: npx -y firebase-tools@latest functions:secrets:set GITHUB_REBUILD_TOKEN
// Needs workflow-dispatch rights on the site repo. Never PUBLIC_* — the token
// must stay out of the client bundle.
const githubRebuildToken = defineSecret("GITHUB_REBUILD_TOKEN");

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
 * Dispatches the firebase-hosting-merge workflow so the static community
 * pages get rebuilt after a profile change. Callable from the client via the
 * Firebase Functions SDK; requires a signed-in user.
 */
export const requestRebuild = onCall(
  { secrets: [githubRebuildToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign-in required.");
    }

    const owner = githubOwner.value();
    const repo = githubRepo.value();
    const workflow = githubWorkflow.value();
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
      const body = await res.text();
      logger.error(`Rebuild dispatch failed: ${res.status}`, {
        uid: request.auth.uid,
        body,
      });
      throw new HttpsError("internal", "Rebuild dispatch failed.");
    }

    logger.info("Rebuild dispatched", {
      uid: request.auth.uid,
      workflow,
    });
    return { ok: true };
  }
);
