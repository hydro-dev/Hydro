import React, { useCallback, useMemo } from 'react';
import { useNavigate } from '../context/router';
import { useUrl } from '../hooks/use-url';
import { isSameOrigin } from '../utils/url';

export interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Pre-built href. Use this or `to`, not both. */
  href?: string;
  /** Route name to resolve via the route map. */
  to?: string;
  /** Params for route resolution when `to` is given. */
  params?: Record<string, string>;
}

function isModifiedEvent(e: React.MouseEvent): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

export const Link: React.FC<React.PropsWithChildren<LinkProps>> = ({ href, to, params, onClick, children, ...rest }) => {
  const buildUrl = useUrl();
  const navigate = useNavigate();

  const resolvedHref = useMemo(() => (to ? buildUrl(to, params) : (href ?? '#')), [buildUrl, href, to, params]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || isModifiedEvent(e)) return;
      if (!isSameOrigin(resolvedHref)) return;
      if (resolvedHref.startsWith('#')) return;
      const resolved = new URL(resolvedHref, window.location.href);
      if (resolved.pathname === window.location.pathname && resolved.hash) return;
      e.preventDefault();
      navigate(resolvedHref);
    },
    [onClick, resolvedHref, navigate],
  );

  return (
    <a href={resolvedHref} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};
