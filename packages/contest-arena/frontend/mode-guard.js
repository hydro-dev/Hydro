(() => {
  'use strict';
  if (window.__hgnuArenaModeGuard) return;
  window.__hgnuArenaModeGuard = true;
  let timer, checking = false, stopped = false;
  async function check() {
    if (checking || stopped) return;
    checking = true;
    let delay = 10000;
    try {
      const response = await fetch('/arena-mode/status', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const data = await response.json();
        if (data.active && typeof data.redirect === 'string' && data.redirect.startsWith('/d/')) {
          const target = new URL(data.redirect, location.origin);
          const nativePath = target.pathname.replace(/^\/d\/[^/]+/, '');
          const current = location.pathname;
          const isOwnArena = [target.pathname, nativePath].some(path => current === path || current.startsWith(`${path}/`));
          if (!isOwnArena) { stopped = true; clearTimeout(timer); location.replace(data.redirect); return; }
        } else if (data.startsAt && data.startsAt > data.now) delay = Math.min(delay, Math.max(50, data.startsAt - data.now));
      }
    } catch { /* The server enforces the mode independently of this timer. */ }
    finally { checking = false; clearTimeout(timer); if (!stopped) timer = setTimeout(check, delay); }
  }
  window.addEventListener('pageshow', () => { stopped = false; check(); });
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  check();
})();
