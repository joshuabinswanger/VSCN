import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";

const githubPat = defineSecret("GITHUB_PAT");

// Replace with your actual GitHub owner and repo name.
const GITHUB_OWNER = "joshuabinswanger";
const GITHUB_REPO = "VSCN";
const WORKFLOW_FILE = "deploy.yml";
const BRANCH = "main";

/**
 * Fires when a new user document is created in Firestore.
 * Triggers a GitHub Actions workflow_dispatch to rebuild and redeploy the site,
 * so the new member appears on the community page within ~2 minutes.
 */
export const onUserCreated = onDocumentCreated(
  { document: "users/{uid}", secrets: [githubPat] },
  async () => {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubPat.value()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: BRANCH }),
    });

    if (!res.ok) {
      console.error(
        "Failed to trigger GitHub Actions:",
        res.status,
        await res.text(),
      );
    } else {
      console.log("GitHub Actions deploy triggered for new user.");
    }
  },
);
