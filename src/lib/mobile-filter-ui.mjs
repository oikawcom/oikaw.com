import { selectedFilters } from './works-filter.mjs';

export const mobileLayoutMediaQuery = '(max-width: 52rem)';

export function setupMobileFilterUI({ trayController } = {}) {
  const dialog = document.querySelector('[data-mobile-filter-dialog]');
  const openButtons = [...document.querySelectorAll('[data-mobile-filter-open]')];
  const closeButton = dialog?.querySelector('[data-mobile-filter-close]');
  const clearButton = dialog?.querySelector('[data-mobile-filter-clear]');
  const applyButton = dialog?.querySelector('[data-mobile-filter-apply]');
  const draftTags = dialog?.querySelector('[data-mobile-filter-draft-tags]');
  const appliedRoot = document.querySelector('[data-mobile-applied-filters]');
  const appliedTags = appliedRoot?.querySelector('[data-mobile-applied-tags]');

  if (
    !(dialog instanceof HTMLDialogElement) ||
    !closeButton ||
    !clearButton ||
    !applyButton ||
    !draftTags ||
    !trayController
  ) {
    return null;
  }

  let returnFocus = null;
  const mobileLayout = window.matchMedia(mobileLayoutMediaQuery);

  const setExpanded = (expanded) => {
    for (const button of openButtons) {
      button.setAttribute('aria-expanded', String(expanded));
    }
  };

  const renderApplied = (applied = trayController.getState().applied) => {
    if (!appliedRoot || !appliedTags) return;
    const filters = selectedFilters(applied);
    appliedRoot.hidden = filters.length === 0;
    appliedTags.replaceChildren();

    for (const { category, value } of filters) {
      const tag = document.createElement('span');
      tag.className = 'filter-summary-tag';
      tag.dataset.category = category;
      tag.textContent = value;
      appliedTags.append(tag);
    }
  };

  const renderDraft = (draft = trayController.getState().draft) => {
    const filters = selectedFilters(draft);
    draftTags.replaceChildren();

    for (const { category, value } of filters) {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'filter-summary-tag filter-tray-tag';
      tag.dataset.category = category;
      tag.textContent = value;
      tag.setAttribute('aria-label', `Remove ${value} filter`);
      tag.addEventListener('click', () => trayController.toggle(category, value));
      draftTags.append(tag);
    }
  };

  const open = (trigger) => {
    if (!mobileLayout.matches || dialog.open) return;
    returnFocus = trigger;
    document.documentElement.classList.add('is-mobile-filter-open');
    dialog.showModal();
    setExpanded(true);
    closeButton.focus();
  };

  const close = ({ restoreFocus = true } = {}) => {
    if (!restoreFocus) returnFocus = null;
    if (dialog.open) dialog.close();
  };

  for (const button of openButtons) {
    button.addEventListener('click', () => open(button));
  }

  closeButton.addEventListener('click', () => close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  });
  clearButton.addEventListener('click', () => {
    trayController.clear();
    renderDraft();
  });
  applyButton.addEventListener('click', () => {
    trayController.apply();
    renderApplied();
    renderDraft();
    close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('is-mobile-filter-open');
    setExpanded(false);
    returnFocus?.focus();
    returnFocus = null;
  });
  mobileLayout.addEventListener('change', ({ matches }) => {
    if (matches) return;
    document.documentElement.classList.remove('is-mobile-filter-open');
    setExpanded(false);
    close({ restoreFocus: false });
  });

  renderApplied();
  renderDraft();
  setExpanded(false);

  return { close, open, renderApplied, renderDraft };
}
