import { prospectiveCount } from './works-filter.mjs';

export function setupWorksFilter({ trayController } = {}) {
  const filterRoot = document.querySelector('[data-filter-root]');
  const filterScroll = filterRoot?.querySelector('[data-filter-scroll]');
  const filterFade = filterRoot?.querySelector('[data-filter-fade]');

  if (!filterRoot || !trayController) return null;

  let projects = [];
  try {
    projects = JSON.parse(filterRoot.dataset.projects ?? '[]');
  } catch {
    projects = [];
  }

  const updateScrollFade = () => {
    if (!filterScroll || !filterFade) return;
    const hasOverflow = filterScroll.scrollHeight > filterScroll.clientHeight + 1;
    const isAtEnd =
      filterScroll.scrollTop + filterScroll.clientHeight >=
      filterScroll.scrollHeight - 1;
    filterFade.classList.toggle('is-visible', hasOverflow && !isAtEnd);
  };

  const update = (draft = trayController.getState().draft) => {
    for (const button of filterRoot.querySelectorAll('[data-filter-tag]')) {
      const category = button.dataset.category ?? '';
      const value = button.dataset.value ?? '';
      const selected = (draft[category] ?? []).includes(value);
      const count = prospectiveCount(projects, draft, category, value);
      const countElement = button.querySelector('[data-filter-count]');

      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !selected && count === 0;
      if (countElement) countElement.textContent = String(count);
    }
  };

  for (const toggle of filterRoot.querySelectorAll('[data-filter-toggle]')) {
    toggle.addEventListener('click', () => {
      const panelId = toggle.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      const symbol = toggle.querySelector('[data-filter-symbol]');

      toggle.setAttribute('aria-expanded', String(!expanded));
      if (panel) panel.hidden = expanded;
      if (symbol) symbol.textContent = expanded ? '+' : '−';
      requestAnimationFrame(updateScrollFade);
    });
  }

  for (const button of filterRoot.querySelectorAll('[data-filter-tag]')) {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      trayController.toggle(
        button.dataset.category ?? '',
        button.dataset.value ?? '',
      );
    });
  }

  filterScroll?.addEventListener('scroll', updateScrollFade, { passive: true });
  window.addEventListener('resize', updateScrollFade, { passive: true });

  update();
  updateScrollFade();

  return { update, updateScrollFade };
}
