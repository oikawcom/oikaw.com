import {
  cloneSelection,
  createEmptySelection,
  selectionCategories,
} from './works-filter.mjs';

export const filterStateStorageKey = 'oikaw.works-filter.v2';

function normalizeSelection(value) {
  const source = value && typeof value === 'object' ? value : {};

  return Object.fromEntries(
    selectionCategories.map((category) => {
      const values = Array.isArray(source[category]) ? source[category] : [];
      return [
        category,
        [...new Set(values.filter((item) => typeof item === 'string' && item))],
      ];
    }),
  );
}

export function createFilterState({ draft, applied } = {}) {
  return {
    draft: normalizeSelection(draft ?? createEmptySelection()),
    applied: normalizeSelection(applied ?? createEmptySelection()),
  };
}

export function clearDraft(state) {
  return {
    draft: createEmptySelection(),
    applied: cloneSelection(state.applied),
  };
}

export function applyDraft(state) {
  const applied = cloneSelection(state.draft);
  return { draft: cloneSelection(applied), applied };
}

export function readFilterState(storage = globalThis.sessionStorage) {
  try {
    const stored = storage?.getItem(filterStateStorageKey);
    if (!stored) return createFilterState();
    const parsed = JSON.parse(stored);
    if (parsed?.version !== 2) return createFilterState();
    return createFilterState(parsed);
  } catch {
    return createFilterState();
  }
}

export function writeFilterState(state, storage = globalThis.sessionStorage) {
  const normalized = createFilterState(state);

  try {
    storage?.setItem(
      filterStateStorageKey,
      JSON.stringify({ version: 2, ...normalized }),
    );
  } catch {
    // The filter remains usable when storage is unavailable.
  }

  return normalized;
}
