import { useEffect, useState } from 'preact/hooks';

/** Hash routes: #/today, #/today/2026-11-15, #/week/2026-11-15, #/me/2026-11-22, #/more, #/admin/members */
export interface Route {
  name: string;
  param: string | undefined;
}

export function parseHash(hash: string): Route {
  const [name = '', param] = hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'today', param: param || undefined };
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
