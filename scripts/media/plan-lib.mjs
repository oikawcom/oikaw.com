import { createHash } from 'node:crypto';

import { matchInventory, normalizeForMatch } from './match.mjs';

const naturalCollator = new Intl.Collator('und', { numeric: true, sensitivity: 'base' });
const REVIEW_COLUMNS = [
  'status',
  'project_id',
  'slug',
  'title',
  'candidate_relative_path',
  'candidate_role',
  'score_confidence',
  'reason',
  'deferred_hit',
  'review_state',
  'human_decision',
  'source_fingerprint',
];

export function fingerprintLabel(asset) {
  return `${asset.fingerprint.kind}:${asset.fingerprint.value}`;
}

function decisionKey(path, projectId) {
  return `${path}\u001f${projectId ?? ''}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(value); value = ''; }
    else if (character === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function fromSpreadsheetSafe(value) {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

export function decisionsFromReviewCsv(text) {
  if (!text) return [];
  const rows = parseCsv(text);
  const header = rows.shift() ?? [];
  const indexes = Object.fromEntries(header.map((name, index) => [name, index]));
  if (indexes.human_decision === undefined) return [];
  return rows
    .map((row) => ({
      candidateRelativePath: fromSpreadsheetSafe(row[indexes.candidate_relative_path] ?? ''),
      projectId: fromSpreadsheetSafe(row[indexes.project_id] ?? ''),
      decision: row[indexes.human_decision]?.trim() ?? '',
      sourceFingerprint: row[indexes.source_fingerprint] ?? '',
    }))
    .filter(({ candidateRelativePath, decision }) => candidateRelativePath && decision);
}

export function mergeHumanDecisions({ previous = [], reviewCsv = null, files }) {
  const merged = new Map();
  for (const decision of previous) {
    if (decision?.candidateRelativePath && decision?.decision) {
      merged.set(decisionKey(decision.candidateRelativePath, decision.projectId), { ...decision });
    }
  }
  for (const decision of decisionsFromReviewCsv(reviewCsv)) {
    merged.set(decisionKey(decision.candidateRelativePath, decision.projectId), {
      ...decision,
      recordedAt: new Date().toISOString(),
    });
  }

  const fileByPath = new Map(files.map((file) => [file.relativePath, file]));
  return [...merged.values()]
    .map((decision) => {
      const current = fileByPath.get(decision.candidateRelativePath);
      const currentFingerprint = current ? fingerprintLabel(current) : null;
      const stale = !current || currentFingerprint !== decision.sourceFingerprint;
      return {
        ...decision,
        stale,
        staleReason: stale
          ? current ? 'source-fingerprint-changed' : 'source-file-no-longer-present'
          : null,
      };
    })
    .sort((left, right) => naturalCollator.compare(left.candidateRelativePath, right.candidateRelativePath));
}

function filenameHints(asset) {
  const normalized = normalizeForMatch(asset.basename);
  const words = new Set(normalized.split(' ').filter(Boolean));
  return {
    thumbnail: ['thumb', 'thumbnail', 'cover', 'hero'].some((hint) => words.has(hint)),
    poster: words.has('poster'),
  };
}

export function describeCrop(asset) {
  const sourceRatio = asset.metadata?.aspectRatio;
  if (!sourceRatio) {
    return {
      display: 'WORKS 4:3 with object-fit: cover',
      sourceAspectRatio: null,
      predictedCropSeverity: 'unknown',
      retainedFractionEstimate: null,
      review: 'crop-review-required',
    };
  }
  const targetRatio = 4 / 3;
  const retained = sourceRatio > targetRatio ? targetRatio / sourceRatio : sourceRatio / targetRatio;
  const cropped = 1 - retained;
  // >35% projected loss is deliberately conservative: no focal-point analysis
  // exists in a dry run, so an extreme portrait/landscape must be seen by Human.
  const severity = cropped > 0.35 ? 'severe' : cropped > 0.18 ? 'moderate' : 'low';
  return {
    display: 'WORKS 4:3 with object-fit: cover',
    sourceAspectRatio: sourceRatio,
    predictedCropSeverity: severity,
    retainedFractionEstimate: Number(retained.toFixed(3)),
    review: severity === 'severe' ? 'crop-review-required' : 'review-during-pilot',
  };
}

function derivativeAdvice(asset, roles) {
  const width = asset.metadata?.width ?? null;
  return {
    sourceDimensions: width && asset.metadata?.height
      ? { width, height: asset.metadata.height }
      : null,
    expectedDisplayClass: roles.includes('thumbnail')
      ? 'WORKS 4:3 thumbnail'
      : 'detail content image (current layout is approximately 1120 CSS px at its wide class)',
    suggestedOutputClass: roles.includes('thumbnail')
      ? 'one WORKS derivative; exact dimensions/format/quality TBD after pilot'
      : 'candidate 1x/2x detail classes; exact widths/format/quality TBD after pilot',
    upscaleReview: width === null
      ? 'unknown-source-dimensions'
      : width < 1120 ? 'source-below-current-wide-detail-class'
        : width < 2240 ? 'source-may-not-support-2x-wide-class'
          : 'no-obvious-upscale-needed-for-candidate-classes',
    transparency: asset.metadata?.hasAlpha ?? null,
    unusualAspectRatio: describeCrop(asset).predictedCropSeverity === 'severe',
    specificationStatus: 'advisory-only; physical derivatives are outside this tool',
  };
}

function rolesForAsset(asset, groupImages) {
  if (asset.category === 'video') return ['video-source-candidate'];
  if (asset.category !== 'image') return ['derivative-source-review'];
  const roles = ['gallery-image'];
  const hints = filenameHints(asset);
  if (hints.poster) roles.push('poster');
  if (groupImages.length === 1 || hints.thumbnail) roles.push('thumbnail');
  return roles;
}

function planMatchedProjects(matches) {
  const groups = new Map();
  for (const match of matches) {
    if (!['exact', 'high'].includes(match.classification) || !match.project) continue;
    const group = groups.get(match.project.id) ?? { project: match.project, matches: [] };
    group.matches.push(match);
    groups.set(match.project.id, group);
  }

  return [...groups.values()]
    .sort((left, right) => left.project.id.localeCompare(right.project.id))
    .map(({ project, matches: projectMatches }) => {
      const images = projectMatches
        .filter(({ asset }) => asset.category === 'image')
        .sort((left, right) => naturalCollator.compare(left.asset.relativePath, right.asset.relativePath));
      const ordered = [...projectMatches].sort((left, right) => {
        if (left.asset.category === 'image' && right.asset.category === 'image') {
          return naturalCollator.compare(left.asset.relativePath, right.asset.relativePath);
        }
        return naturalCollator.compare(left.asset.relativePath, right.asset.relativePath);
      });
      const assets = ordered.map((match) => {
        const candidateRoles = rolesForAsset(match.asset, images.map(({ asset }) => asset));
        return {
          relativePath: match.asset.relativePath,
          fingerprint: match.asset.fingerprint,
          category: match.asset.category,
          size: match.asset.size,
          sourceMetadata: match.asset.metadata,
          match: {
            classification: match.classification,
            score: match.score,
            confidence: match.confidence,
            reasons: match.reasons,
          },
          candidateRoles,
          galleryOrderCandidate: match.asset.category === 'image'
            ? images.findIndex(({ asset }) => asset.relativePath === match.asset.relativePath) + 1
            : null,
          crop: match.asset.category === 'image' ? describeCrop(match.asset) : null,
          derivativeAdvice: match.asset.category === 'image'
            ? derivativeAdvice(match.asset, candidateRoles)
            : null,
          videoReview: match.asset.category === 'video'
            ? 'Hosting/delivery URL requires separate Human decision; master must not enter Git.'
            : null,
        };
      });
      const thumbnailCandidates = assets.filter(({ candidateRoles }) => candidateRoles.includes('thumbnail'));
      return {
        project,
        thumbnailSelection: thumbnailCandidates.length === 1
          ? 'single-candidate-for-human-review'
          : thumbnailCandidates.length > 1 ? 'human-selection-required' : 'human-selection-required-no-filename-hint',
        assets,
      };
    });
}

export function buildPlan({ session, catalog, humanDecisions = [] }) {
  const matches = matchInventory(session.files, catalog.initial, catalog.deferred);
  const projects = planMatchedProjects(matches);
  const matchedProjectIds = new Set(projects.map(({ project }) => project.id));
  const noSourceProjects = catalog.initial
    .filter(({ id }) => !matchedProjectIds.has(id))
    .map(({ id, slug, title }) => ({ id, slug, title }));
  const classificationCounts = Object.fromEntries(
    ['exact', 'high', 'ambiguous', 'unmatched'].map((classification) => [
      classification,
      matches.filter((match) => match.classification === classification).length,
    ]),
  );
  const matchedImageCount = projects.reduce(
    (total, project) => total + project.assets.filter(({ category }) => category === 'image').length,
    0,
  );
  const projectsWithImage = projects.filter((project) =>
    project.assets.some(({ category }) => category === 'image')).length;
  const staleDecisionCount = humanDecisions.filter(({ stale }) => stale).length;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    productionWritesSupported: false,
    source: { rootRecorded: false, inventoryDigest: session.inventoryDigest },
    projectCatalog: {
      source: 'src/data/projects.json',
      sourceHash: session.projectCatalog.sourceHash,
      initialReleaseCount: catalog.initial.length,
      deferredCount: catalog.deferred.length,
    },
    summary: {
      sourceFileCount: session.files.length,
      categoryCounts: Object.fromEntries(['image', 'video', 'master', 'unsupported'].map((category) => [
        category,
        session.files.filter((file) => file.category === category).length,
      ])),
      classificationCounts,
      matchedProjectCount: matchedProjectIds.size,
      projectWithNoSourceCandidateCount: noSourceProjects.length,
      deferredHitCount: matches.filter(({ deferredHit }) => deferredHit).length,
      suspiciousOrUnsupportedCount:
        session.files.filter(({ category }) => ['master', 'unsupported'].includes(category)).length +
        session.skippedLinks.length,
      predictedPublicImageCount: matchedImageCount + projectsWithImage,
      predictedPublicImageCountBasis: 'one detail candidate per matched image plus one possible WORKS derivative per Project with images; advisory only',
      grossSourceSize: session.files.reduce((sum, { size }) => sum + size, 0),
      staleDecisionCount,
    },
    noSourceProjects,
    projects,
    matches: matches.map((match) => ({
      relativePath: match.asset.relativePath,
      fingerprint: match.asset.fingerprint,
      category: match.asset.category,
      classification: match.classification,
      project: match.project,
      score: match.score,
      confidence: match.confidence,
      reasons: match.reasons,
      contradictions: match.contradictions,
      candidates: match.candidates.map(({ project, score, independentSignals, reasons, contradictions }) => ({
        project,
        score,
        independentSignals,
        reasons,
        contradictions,
      })),
      deferredHit: match.deferredHit,
    })),
    humanDecisions,
    warnings: [
      ...session.warnings,
      ...session.skippedLinks.map((link) => ({ code: link.reason, relativePath: link.relativePath })),
      ...(session.capabilities.sharp.available ? [] : [{ code: 'sharp-unavailable-image-metadata-unknown' }]),
      ...(session.files.some(({ category }) => category === 'video')
        ? [{ code: 'video-hosting-requires-human-decision' }]
        : []),
      ...(staleDecisionCount > 0 ? [{ code: 'stale-human-decisions', count: staleDecisionCount }] : []),
    ],
  };
}

function spreadsheetSafe(value) {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const text = spreadsheetSafe(value).replaceAll('"', '""');
  return `"${text}"`;
}

function humanDecisionFor(decisions, relativePath, projectId) {
  return decisions.find((decision) =>
    decision.candidateRelativePath === relativePath &&
    (decision.projectId ?? '') === (projectId ?? ''),
  );
}

export function renderReviewCsv(plan) {
  const roles = new Map();
  for (const project of plan.projects) {
    for (const asset of project.assets) roles.set(asset.relativePath, asset.candidateRoles.join('|'));
  }
  const rows = [];
  for (const match of plan.matches) {
    const candidateRows = match.classification === 'ambiguous'
      ? match.candidates.slice(0, 3)
      : [{ project: match.project, score: match.score, reasons: match.reasons }];
    for (const candidate of candidateRows) {
      const project = candidate.project;
      const decision = humanDecisionFor(plan.humanDecisions, match.relativePath, project?.id);
      rows.push({
        status: match.classification,
        project_id: project?.id ?? '',
        slug: project?.slug ?? '',
        title: project?.title ?? '',
        candidate_relative_path: match.relativePath,
        candidate_role: roles.get(match.relativePath) ?? '',
        score_confidence: `${candidate.score ?? match.score}/${match.confidence}`,
        reason: [...(candidate.reasons ?? match.reasons), ...match.contradictions].join('; '),
        deferred_hit: match.deferredHit?.project?.id ?? '',
        review_state: decision?.stale ? 'stale-decision-review-required' : decision ? 'decided' : 'needs-review',
        human_decision: decision?.decision ?? '',
        source_fingerprint: fingerprintLabel({ fingerprint: match.fingerprint }),
      });
    }
  }
  return [
    REVIEW_COLUMNS.map(csvCell).join(','),
    ...rows.map((row) => REVIEW_COLUMNS.map((column) => csvCell(row[column])).join(',')),
  ].join('\n') + '\n';
}

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

export function renderSummaryMarkdown(plan) {
  const { summary } = plan;
  const warnings = plan.warnings.length > 0
    ? plan.warnings.map((warning) => `- ${warning.code}${warning.count ? ` (${warning.count})` : ''}`).join('\n')
    : '- none';
  const noSourceProjects = plan.noSourceProjects.length > 0
    ? plan.noSourceProjects.map(({ id, slug, title }) => `- ${id} | ${slug} | ${title}`).join('\n')
    : '- none';
  return `# Media ingestion dry-run summary

This is a diagnostic plan only. It does not approve publication or write production data/assets.

## Inventory

- Source files: ${summary.sourceFileCount}
- Images: ${summary.categoryCounts.image}
- Videos: ${summary.categoryCounts.video}
- Master files: ${summary.categoryCounts.master}
- Unsupported/unknown: ${summary.categoryCounts.unsupported}
- Gross source size: ${formatBytes(summary.grossSourceSize)}

## Matching

- Exact: ${summary.classificationCounts.exact}
- High: ${summary.classificationCounts.high}
- Ambiguous: ${summary.classificationCounts.ambiguous}
- Unmatched: ${summary.classificationCounts.unmatched}
- Matched Projects: ${summary.matchedProjectCount}
- Projects with no source candidate: ${summary.projectWithNoSourceCandidateCount}
- Deferred hits (excluded from planning): ${summary.deferredHitCount}

## Planning

- Predicted public image count: ${summary.predictedPublicImageCount}
- Basis: ${summary.predictedPublicImageCountBasis}
- Suspicious / unsupported count: ${summary.suspiciousOrUnsupportedCount}
- Stale Human decisions: ${summary.staleDecisionCount}
- Derivative dimensions, formats, quality, crop method, and hosting remain unapproved until Pilot.

## Projects with no source candidate

${noSourceProjects}

## Warnings

${warnings}
`;
}

export function makeSessionId(inventoryDigest) {
  return createHash('sha256').update(`media-ingest-session-v1\0${inventoryDigest}`).digest('hex').slice(0, 16);
}
