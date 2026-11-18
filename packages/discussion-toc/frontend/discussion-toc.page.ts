import './discussion-toc.css';

import { $, addPage, NamedPage } from '@hydrooj/ui-default';

interface Entry {
  heading: HTMLElement;
  level: number;
  text: string;
  links: HTMLAnchorElement[];
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function headingEntries(content: HTMLElement): Entry[] {
  const seen = new Set<string>();
  return [...content.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].filter((heading) =>
    heading.textContent.trim() && !heading.closest('pre,code,.table-of-contents')).map((heading, index) => {
    if (!heading.id || seen.has(heading.id) || document.getElementById(heading.id) !== heading) {
      let suffix = index + 1;
      while (document.getElementById(`discussion-heading-${suffix}`)) suffix++;
      heading.id = `discussion-heading-${suffix}`;
    }
    seen.add(heading.id);
    return { heading, level: Number(heading.tagName.slice(1)), text: heading.textContent.trim(), links: [] };
  });
}

function createDirectory(content: HTMLElement, sidebar: HTMLElement, layout: HTMLElement) {
  const entries = headingEntries(content);
  if (entries.length < 2) return () => {};
  layout.classList.add('discussion-layout-toc');
  sidebar.classList.add('discussion-sidebar-toc');
  const start = element('span', 'discussion-toc-target');
  const end = element('span', 'discussion-toc-target');
  const markerId = (base: string) => {
    let id = base;
    while (document.getElementById(id)) id += '-';
    return id;
  };
  start.id = markerId('discussion-start');
  end.id = markerId('discussion-end');
  content.prepend(start);
  content.append(end);
  const targets = [start, ...entries.map((entry) => entry.heading), end];
  for (const target of targets) target.classList.add('discussion-toc-target');

  const mobile = element('details', 'discussion-toc-mobile');
  const summary = element('summary', 'discussion-toc-toggle', '目录');
  mobile.append(summary);
  let active = -1;
  let frame = 0;
  const lists: HTMLOListElement[] = [];
  const offset = () => {
    const nav = document.querySelector<HTMLElement>('.nav');
    return (nav && getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().height : 0) + 16;
  };
  const jump = (target: HTMLElement, push = false) => {
    mobile.open = false;
    $('html,body').stop(true);
    // Instant navigation avoids fetching every lazy image along a long animated scroll.
    const top = target === start ? 0 : Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset());
    window.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
    if (push) {
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      const hash = `#${encodeURIComponent(target.id)}`;
      if (location.hash !== hash) history.pushState(history.state, '', hash);
    }
  };
  const makeLink = (target: HTMLElement, text: string, className: string) => {
    const link = element('a', className, text);
    link.href = `#${encodeURIComponent(target.id)}`;
    link.addEventListener('click', (event) => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      jump(target, true);
    });
    return link;
  };
  const makeNavigation = (mobileVersion = false) => {
    const nav = element('nav', `discussion-toc ${mobileVersion ? 'discussion-toc--mobile' : 'discussion-toc--desktop'}`);
    nav.setAttribute('aria-label', '文章目录');
    const title = element('div', 'discussion-toc-title');
    title.append(element('strong', '', '目录'), element('span', 'discussion-toc-count', `${entries.length} 节`));
    nav.append(title);
    const list = element('ol', 'discussion-toc-list');
    const minLevel = Math.min(...entries.map((entry) => entry.level));
    for (const entry of entries) {
      const item = element('li');
      const link = makeLink(entry.heading, entry.text, 'discussion-toc-link');
      link.style.setProperty('--toc-depth', String(entry.level - minLevel));
      link.title = entry.text;
      entry.links.push(link);
      item.append(link);
      list.append(item);
    }
    lists.push(list);
    nav.append(list);
    const shortcuts = element('div', 'discussion-toc-shortcuts');
    shortcuts.append(makeLink(start, '回到顶部', 'discussion-toc-shortcut'), makeLink(end, '到正文底部', 'discussion-toc-shortcut'));
    nav.append(shortcuts);
    return nav;
  };
  const desktop = makeNavigation();
  sidebar.append(desktop);
  mobile.append(makeNavigation(true));
  document.body.append(mobile);

  function update() {
    frame = 0;
    if (!content.isConnected) return;
    const top = offset();
    layout.style.setProperty('--discussion-toc-top', `${top}px`);
    const available = window.innerHeight - Math.max(top, desktop.getBoundingClientRect().top) - 120;
    layout.style.setProperty('--discussion-toc-list-height', `${Math.max(120, available)}px`);
    let current = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].heading.getBoundingClientRect().top <= top + 8) current = i;
      else break;
    }
    if (active === current) return;
    if (entries[active]) for (const link of entries[active].links) link.removeAttribute('aria-current');
    active = current;
    for (const link of entries[current].links) link.setAttribute('aria-current', 'location');
    for (const list of lists) {
      if (!list.clientHeight) continue;
      const link = list.querySelector<HTMLElement>('[aria-current]');
      const box = link.getBoundingClientRect();
      const viewport = list.getBoundingClientRect();
      if (box.top < viewport.top || box.bottom > viewport.bottom) list.scrollTop += box.top - viewport.top - list.clientHeight / 3;
    }
  }
  function schedule() {
    frame ||= requestAnimationFrame(update);
  }
  const fragment = (event?: Event) => {
    const raw = location.hash.slice(1);
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch { /* An unrelated malformed hash should not break navigation. */ }
    const target = targets.find((node) => node.id === raw || node.id === decoded);
    if (target) {
      if (event?.type === 'hashchange') event.stopImmediatePropagation();
      jump(target);
    }
  };
  const closeOutside = (event: PointerEvent) => {
    if (mobile.open && !mobile.contains(event.target as Node)) mobile.open = false;
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && mobile.open) {
      mobile.open = false;
      summary.focus();
    }
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', fragment, true);
  window.addEventListener('popstate', fragment);
  document.addEventListener('pointerdown', closeOutside);
  document.addEventListener('keydown', closeOnEscape);
  const resize = new ResizeObserver(schedule);
  resize.observe(content);
  schedule();
  const initial = requestAnimationFrame(() => fragment());
  let readyFrame = 0;
  const pageReady = () => { readyFrame = requestAnimationFrame(() => fragment()); };
  $(document).on('vjPageFullyInitialized.discussionToc', pageReady);
  return () => {
    cancelAnimationFrame(initial);
    cancelAnimationFrame(readyFrame);
    cancelAnimationFrame(frame);
    resize.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('hashchange', fragment, true);
    window.removeEventListener('popstate', fragment);
    document.removeEventListener('pointerdown', closeOutside);
    document.removeEventListener('keydown', closeOnEscape);
    $(document).off('vjPageFullyInitialized.discussionToc', pageReady);
    mobile.remove();
    desktop.remove();
    start.remove();
    end.remove();
    layout.classList.remove('discussion-layout-toc');
    sidebar.classList.remove('discussion-sidebar-toc');
    for (const entry of entries) entry.heading.classList.remove('discussion-toc-target');
  };
}

let dispose: (() => void) | undefined;
function initialize() {
  dispose?.();
  const content = document.querySelector<HTMLElement>('.topic__content');
  const sidebar = document.querySelector<HTMLElement>('[data-discussion-sidebar]');
  const layout = document.querySelector<HTMLElement>('[data-discussion-layout]');
  if (content && sidebar && layout) dispose = createDirectory(content, sidebar, layout);
}

addPage(new NamedPage('discussion_detail', () => {
  initialize();
  $(document).off('vjContentNew.discussionToc').on('vjContentNew.discussionToc', initialize);
  $(document).off('vjContentRemove.discussionToc').on('vjContentRemove.discussionToc', (event) => {
    if ((event.target as Node).contains(document.querySelector('.topic__content'))) dispose?.();
  });
}));
