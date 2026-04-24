import { useCallback } from 'react';
import { type PageData, useNavigationControls } from '../context/page-data';

function buildReqUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('_ui_next', '1');
    return u.pathname + u.search + u.hash;
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_ui_next=1`;
  }
}

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function useNavigate() {
  const { setData, setLoading, setError } = useNavigationControls();

  const navigate = useCallback(async (url: string) => {
    if (!isSameOrigin(url)) {
      window.location.href = url;
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fetchUrl = buildReqUrl(url);
      const res = await fetch(fetchUrl, { headers: { Accept: 'application/json', 'x-hydro-inject': 'uicontext,usercontext' } });
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      if (!res.ok) {
        throw new Error(`Navigation failed: ${res.status} ${res.statusText}`);
      }
      const data: PageData = await res.json();
      console.log('[Hydro] data received:', data);
      setData((prev) => (data.HYDRO_INJECTED ? data : { ...prev, ...data }));
      history.pushState(null, '', url);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      console.error('[Hydro] navigation error:', err);
      // Fall back to hard navigation on unexpected errors
      window.location.href = url;
    } finally {
      setLoading(false);
    }
  }, [setData, setLoading, setError]);

  return navigate;
}
