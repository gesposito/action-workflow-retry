// https://docs.github.com/en/rest/reference/actions

const core = require("@actions/core");

const firebase = require("firebase/app");
require("firebase/firestore");

// most @actions toolkit packages have async methods
async function run() {
  try {
    // https://github.com/actions/toolkit/blob/main/packages/github/src/context.ts

    const maxAttemps = core.getInput("max_attemps");
    const githubToken = core.getInput("github_token");
    const firebaseProjectId = core.getInput("firebase_project_id");
    const firebaseApiKey = core.getInput("firebase_api_key");
    const owner = core.getInput("owner");
    const repo = core.getInput("repo");
    const run_id = core.getInput("run_id");

    // Initialize Firebase
    firebase.initializeApp({
      projectId: firebaseProjectId,
      apiKey: firebaseApiKey,
    });

    const { Octokit } = require("@octokit/core");
    const octokit = new Octokit({ auth: githubToken });

    const { data: run } = await octokit.request(
      `GET /repos/{owner}/{repo}/actions/runs/{run_id}`,
      {
        owner,
        repo,
        run_id,
      }
    );
    core.info(`Conclusion for run: ${run_id} was ${run.conclusion}`);

    // https://docs.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions
    // A unique number for each run within a repository. This number does not change if you re-run the workflow run.
    // github.run_id
    const attempt = await upsertAttempt(run_id);
    core.info(`Attempt: ${attempt}`);

    if (attempt > maxAttemps) {
      throw new Error(`Tried too many times`);
    }

    core.info(`Re-running: ${run_id}`);
    await octokit.request(
      `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun`,
      {
        owner,
        repo,
        run_id,
      }
    );
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();

async function upsertAttempt(run_id) {
  const db = firebase.firestore();
  const collectionRef = db.collection("workflows");
  const docRef = collectionRef.doc(`${run_id}`);
  const doc = await docRef.get();

  let attempt;
  if (!doc.exists) {
    attempt = 1;
    await docRef.set({
      attempt,
    });
  } else {
    attempt = (doc.data().attempt || 0) + 1;
    await docRef.update({ attempt });
  }

  return attempt;
}
