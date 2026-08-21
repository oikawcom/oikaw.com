import { extname } from 'node:path';

// Scores are grouped by independent evidence rather than accumulated filename
// trivia. High confidence requires at least two groups and a clear runner-up gap.
export const MATCH_POLICY = Object.freeze({
  scores: Object.freeze({
    exactIdentifier: 100,
    titleExactComponent: 44,
    titleContained: 32,
    artist: 18,
    artistMaximum: 28,
    year: 12,
    explicitType: 24,
    explicitVideoMedia: 10,
    contradiction: -26,
  }),
  minimumReasonableScore: 28,
  highMinimumScore: 55,
  highMinimumIndependentSignals: 2,
  highMinimumRunnerUpMargin: 14,
});

export function normalizeForMatch(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compact(value) {
  return normalizeForMatch(value).replaceAll(' ', '');
}

function pathEvidence(asset) {
  const components = asset.relativePath
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean)
    .map((component, index, all) => index === all.length - 1
      ? component.slice(0, Math.max(0, component.length - extname(component).length))
      : component);
  const normalizedComponents = components.map(normalizeForMatch).filter(Boolean);
  const normalizedPath = normalizeForMatch(components.join(' '));
  const compactPath = compact(components.join(' '));
  const words = new Set(normalizedPath.split(' ').filter(Boolean));
  return { normalizedComponents, normalizedPath, compactPath, words };
}

function explicitTypeHints(evidence) {
  const { normalizedPath, words } = evidence;
  const hints = new Set();
  if (normalizedPath.includes('cover art') || words.has('cover') || words.has('artwork') || words.has('jacket')) hints.add('Cover Art');
  if (normalizedPath.includes('music video') || words.has('mv') || words.has('mvs')) hints.add('Music Video');
  if (words.has('visualizer')) hints.add('Visualizer');
  if (words.has('promo') || words.has('promotion')) hints.add('Promo');
  if (words.has('broadcast')) hints.add('Broadcast');
  if (words.has('portrait') || words.has('headshot')) hints.add('Portrait');
  if (words.has('photo') || words.has('photography')) hints.add('Photo');
  if (words.has('logo')) hints.add('Logo');
  return hints;
}

function scoreProject(project, asset, evidence) {
  const signals = new Set();
  const reasons = [];
  const contradictions = [];
  let score = 0;

  const identifierValues = [project.id, project.slug].map(compact);
  const exactIdentifier = evidence.normalizedComponents.some((component) =>
    identifierValues.includes(component.replaceAll(' ', '')),
  );
  if (exactIdentifier) {
    score += MATCH_POLICY.scores.exactIdentifier;
    signals.add('identifier');
    reasons.push('path component equals normalized Project ID or slug');
  }

  const title = compact(project.title);
  if (title) {
    if (evidence.normalizedComponents.some((component) => compact(component) === title)) {
      score += MATCH_POLICY.scores.titleExactComponent;
      signals.add('title');
      reasons.push('title equals a path component');
    } else if (title.length >= 3 && evidence.compactPath.includes(title)) {
      score += MATCH_POLICY.scores.titleContained;
      signals.add('title');
      reasons.push('title occurs in relative path');
    }
  }

  let artistScore = 0;
  const matchedArtists = [];
  for (const artist of project.clientArtists) {
    const normalizedArtist = compact(artist);
    if (normalizedArtist.length >= 2 && evidence.compactPath.includes(normalizedArtist)) {
      artistScore = Math.min(MATCH_POLICY.scores.artistMaximum, artistScore + MATCH_POLICY.scores.artist);
      matchedArtists.push(artist);
    }
  }
  if (artistScore > 0) {
    score += artistScore;
    signals.add('artist');
    reasons.push(`client/artist matched: ${matchedArtists.join(', ')}`);
  }

  if (project.year && evidence.words.has(String(project.year))) {
    score += MATCH_POLICY.scores.year;
    signals.add('year');
    reasons.push(`year matched: ${project.year}`);
  }

  const typeHints = explicitTypeHints(evidence);
  if (typeHints.size > 0) {
    if (typeHints.has(project.type)) {
      score += MATCH_POLICY.scores.explicitType;
      signals.add('type');
      reasons.push(`explicit type hint matched: ${project.type}`);
    } else {
      score += MATCH_POLICY.scores.contradiction;
      contradictions.push(`path type hint conflicts with ${project.type}`);
    }
  }

  // A video file is useful independent evidence for Video. An image file is not
  // equivalent evidence for Image because Video Projects commonly have stills.
  if (asset.category === 'video') {
    if (project.media === 'Video') {
      score += MATCH_POLICY.scores.explicitVideoMedia;
      signals.add('media');
      reasons.push('video file agrees with Project media');
    } else {
      score += MATCH_POLICY.scores.contradiction;
      contradictions.push(`video file conflicts with ${project.media}`);
    }
  }

  return {
    project,
    score,
    independentSignals: [...signals],
    reasons,
    contradictions,
    exactIdentifier,
  };
}

export function matchAsset(asset, projects) {
  const evidence = pathEvidence(asset);
  const candidates = projects
    .map((project) => scoreProject(project, asset, evidence))
    .sort((left, right) => right.score - left.score || left.project.id.localeCompare(right.project.id));
  const exactCandidates = candidates.filter(({ exactIdentifier }) => exactIdentifier);

  if (exactCandidates.length === 1) {
    const winner = exactCandidates[0];
    return {
      classification: 'exact',
      project: winner.project,
      score: winner.score,
      confidence: 1,
      reasons: winner.reasons,
      contradictions: winner.contradictions,
      candidates: candidates.slice(0, 3),
    };
  }
  if (exactCandidates.length > 1) {
    return {
      classification: 'ambiguous',
      project: null,
      score: exactCandidates[0].score,
      confidence: 0,
      reasons: ['normalized identifier matched more than one Project'],
      contradictions: [],
      candidates: exactCandidates.slice(0, 3),
    };
  }

  const winner = candidates[0];
  const runnerUp = candidates[1];
  if (!winner || winner.score < MATCH_POLICY.minimumReasonableScore) {
    return {
      classification: 'unmatched',
      project: null,
      score: winner?.score ?? 0,
      confidence: 0,
      reasons: ['no candidate met the minimum evidence threshold'],
      contradictions: winner?.contradictions ?? [],
      candidates: candidates.slice(0, 3),
    };
  }

  const margin = winner.score - (runnerUp?.score ?? 0);
  const isHigh =
    winner.score >= MATCH_POLICY.highMinimumScore &&
    winner.independentSignals.length >= MATCH_POLICY.highMinimumIndependentSignals &&
    margin >= MATCH_POLICY.highMinimumRunnerUpMargin &&
    winner.contradictions.length === 0;
  if (isHigh) {
    return {
      classification: 'high',
      project: winner.project,
      score: winner.score,
      confidence: Number(Math.min(0.99, 0.65 + margin / 200 + winner.independentSignals.length / 20).toFixed(3)),
      reasons: [...winner.reasons, `runner-up margin ${margin}`],
      contradictions: [],
      candidates: candidates.slice(0, 3),
    };
  }

  return {
    classification: 'ambiguous',
    project: null,
    score: winner.score,
    confidence: 0,
    reasons: [
      ...winner.reasons,
      `not auto-resolved: ${winner.independentSignals.length} independent signal(s), runner-up margin ${margin}`,
    ],
    contradictions: winner.contradictions,
    candidates: candidates.slice(0, 3),
  };
}

export function matchInventory(files, initialProjects, deferredProjects = []) {
  return files.map((asset) => {
    const result = matchAsset(asset, initialProjects);
    const deferred = deferredProjects.length > 0 ? matchAsset(asset, deferredProjects) : null;
    const deferredHit = deferred && deferred.classification !== 'unmatched'
      ? {
          classification: deferred.classification,
          score: deferred.score,
          project: deferred.project ?? deferred.candidates[0]?.project ?? null,
          reason: deferred.reasons.join('; '),
        }
      : null;
    return { asset, ...result, deferredHit };
  });
}
