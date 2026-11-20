import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';

function level(count: number | null) {
  if (count === null) return 'missing';
  if (!count) return '0';
  if (count === 1) return '1';
  if (count < 4) return '2';
  if (count < 7) return '3';
  return '4';
}

export default new NamedPage('user_detail', () => {
  const view = document.querySelector<HTMLElement>('[data-external-oj-activity]');
  const selector = view?.querySelector<HTMLSelectElement>('#external-oj-source');
  const detail = view?.querySelector<HTMLElement>('.external-oj-activity__day-detail');
  if (!view || !selector || !detail) return;
  const labels = JSON.parse(view.dataset.ojLabels) as string[];
  const cells = [...view.querySelectorAll<HTMLButtonElement>('[data-oj-day]')].map((button) => ({
    button,
    counts: JSON.parse(button.dataset.ojCounts) as (number | null)[],
  }));
  if (!cells.length) return;
  const calendar = view.querySelector<HTMLElement>('.external-oj-activity__overflow');
  const openRecent = () => { if (calendar) calendar.scrollLeft = calendar.scrollWidth; };
  $(view.closest('.section__tab-main')).on('vjContentShow', openRecent);
  openRecent();
  let current = cells.length - 1;
  let selected = false;
  const describe = (count: number | null) => count === null ? '暂无数据' : `${count} 题`;
  function showDay(index: number) {
    cells[current].button.tabIndex = -1;
    cells[current].button.setAttribute('aria-pressed', 'false');
    current = index;
    selected = true;
    const { button, counts } = cells[index];
    button.tabIndex = 0;
    button.setAttribute('aria-pressed', 'true');
    const heading = document.createElement('strong');
    heading.textContent = button.dataset.ojDay;
    const list = document.createElement('ul');
    labels.forEach((label, i) => {
      const line = document.createElement('li');
      line.textContent = `${label}：${describe(counts[i])}`;
      list.append(line);
    });
    detail.replaceChildren(heading, list);
  }
  selector.addEventListener('change', () => {
    for (const { button, counts } of cells) {
      const count = selector.value === 'all'
        ? (counts.some((n) => n !== null) ? counts.reduce<number>((a, b) => a + (b ?? 0), 0) : null)
        : counts[Number(selector.value)] ?? null;
      button.dataset.ojLevel = level(count);
      button.setAttribute('aria-label', `${button.dataset.ojDay}，${describe(count)}`);
      button.title = `${button.dataset.ojDay} · ${describe(count)}`;
    }
    if (selected) showDay(current);
  });
  cells.forEach(({ button }, i) => {
    button.title = button.getAttribute('aria-label');
    button.addEventListener('click', () => showDay(i));
    button.addEventListener('keydown', (event) => {
      const offset = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
      if (offset === undefined) return;
      event.preventDefault();
      const target = Math.min(cells.length - 1, Math.max(0, i + offset));
      showDay(target);
      cells[target].button.focus();
    });
  });
});
