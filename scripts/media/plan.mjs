import { loadProjectCatalog } from './catalog.mjs';
import { buildPlan, mergeHumanDecisions, renderReviewCsv, renderSummaryMarkdown } from './plan-lib.mjs';
import { PROJECTS_FILE, readLocalOutput, redactErrorMessage, sha256File, writeLocalOutput } from './safety.mjs';

async function main() {
  if (process.argv.length !== 2) throw new Error('Usage: npm run media:plan');
  const sessionText = await readLocalOutput('session.json');
  const session = JSON.parse(sessionText);
  if (session.schemaVersion !== 1 || !Array.isArray(session.files)) {
    throw new Error('Unsupported or invalid .media-ingest/session.json; run media:scan again.');
  }

  const projectHashBefore = await sha256File(PROJECTS_FILE);
  if (session.projectCatalog?.sourceHash !== projectHashBefore) {
    throw new Error('projects.json changed since scan; rerun media:scan before planning.');
  }
  const catalog = await loadProjectCatalog();
  const priorReview = await readLocalOutput('review.csv', { optional: true });
  const humanDecisions = mergeHumanDecisions({
    previous: session.humanDecisions ?? [],
    reviewCsv: priorReview,
    files: session.files,
  });
  const updatedSession = { ...session, humanDecisions };
  const plan = buildPlan({ session: updatedSession, catalog, humanDecisions });

  await writeLocalOutput('session.json', `${JSON.stringify(updatedSession, null, 2)}\n`);
  await writeLocalOutput('plan.json', `${JSON.stringify(plan, null, 2)}\n`);
  await writeLocalOutput('review.csv', renderReviewCsv(plan));
  await writeLocalOutput('summary.md', renderSummaryMarkdown(plan));

  const projectHashAfter = await sha256File(PROJECTS_FILE);
  if (projectHashAfter !== projectHashBefore) throw new Error('projects.json changed during planning; output is invalid.');
  console.log(`Plan complete: ${plan.summary.matchedProjectCount} matched Projects; ${plan.summary.classificationCounts.ambiguous} ambiguous; ${plan.summary.classificationCounts.unmatched} unmatched.`);
  console.log('Local outputs: .media-ingest/plan.json, review.csv, summary.md');
  console.log('No production data or public assets were written.');
}

main().catch((error) => {
  console.error(`media:plan failed: ${redactErrorMessage(error)}`);
  process.exitCode = 1;
});
