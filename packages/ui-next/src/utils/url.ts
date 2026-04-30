export function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function buildReqUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('noTemplate', 'true');
    return u.pathname + u.search + u.hash;
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}noTemplate=true`;
  }
}
