import { applyDraft, clearDraft, readFilterState, writeFilterState } from './filter-state.mjs';
import {
  cloneSelection,
  selectedFilters,
  selectionsEqual,
  toggleSelection,
} from './works-filter.mjs';

export function setupFilterTray({ onApply, onDraftChange } = {}) {
  const root = document.querySelector('[data-filter-tray]');
  const applyButton = root?.querySelector('[data-apply-button]');
  const selectedButton = root?.querySelector('[data-selected-button]');
  const selectionTags = root?.querySelector('[data-selection-tags]');

  if (!root || !applyButton || !selectedButton || !selectionTags) return null;

  let state = readFilterState();

  const persist = () => {
    state = writeFilterState(state);
  };

  const render = () => {
    const dirty = !selectionsEqual(state.draft, state.applied);
    const appliedTags = selectedFilters(state.applied);
    const tags = selectedFilters(dirty ? state.draft : state.applied);
    const hasAppliedFilters = appliedTags.length > 0;

    applyButton.hidden = !dirty;
    selectedButton.hidden = dirty;
    selectedButton.disabled = !hasAppliedFilters;
    selectedButton.classList.toggle('has-applied', hasAppliedFilters);
    selectedButton.setAttribute(
      'aria-label',
      hasAppliedFilters ? 'Clear all selected filters' : 'Selected: All Works',
    );
    selectionTags.replaceChildren();

    if (!dirty && tags.length === 0) {
      const allWorks = document.createElement('span');
      allWorks.className = 'filter-summary-tag';
      allWorks.dataset.category = 'all';
      allWorks.textContent = 'All Works';
      selectionTags.append(allWorks);
      return;
    }

    for (const { category, value } of tags) {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'filter-summary-tag filter-tray-tag';
      tag.dataset.category = category;
      tag.textContent = value;
      tag.setAttribute('aria-label', `Remove ${value} filter`);
      tag.addEventListener('click', () => toggle(category, value));
      selectionTags.append(tag);
    }
  };

  const notifyDraftChange = () => {
    onDraftChange?.({
      draft: cloneSelection(state.draft),
      applied: cloneSelection(state.applied),
    });
  };

  const toggle = (category, value) => {
    state = {
      draft: toggleSelection(state.draft, category, value),
      applied: cloneSelection(state.applied),
    };
    persist();
    render();
    notifyDraftChange();
  };

  const clear = () => {
    state = clearDraft(state);
    persist();
    render();
    notifyDraftChange();
  };

  const apply = () => {
    state = applyDraft(state);
    persist();
    render();
    notifyDraftChange();
    onApply?.({
      draft: cloneSelection(state.draft),
      applied: cloneSelection(state.applied),
    });
  };

  applyButton.addEventListener('click', apply);
  selectedButton.addEventListener('click', clear);
  render();

  return {
    apply,
    clear,
    toggle,
    getState: () => ({
      draft: cloneSelection(state.draft),
      applied: cloneSelection(state.applied),
    }),
  };
}
