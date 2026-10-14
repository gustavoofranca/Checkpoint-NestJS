import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

const DEBOUNCE_MS = 300;

// The search lives in the URL (?q=), so a search can be shared and survives a reload. Typing
// updates it after a pause; from another page it opens the catalog.
export function SearchField() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const current = location.pathname === '/' ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(current);
  // When the URL changes from elsewhere (a link, the back button), the field follows it. Adjusting
  // state while rendering, instead of in an effect, avoids a second render with the stale value.
  const [synced, setSynced] = useState(current);
  if (synced !== current) {
    setSynced(current);
    setValue(current);
  }

  useEffect(() => {
    const query = value.trim();
    if (query === current) {
      return;
    }
    const timer = setTimeout(() => {
      const next = new URLSearchParams(location.pathname === '/' ? params : undefined);
      if (query === '') {
        next.delete('q');
      } else {
        next.set('q', query);
      }
      const search = next.toString();
      void navigate(search === '' ? '/' : `/?${search}`, { replace: location.pathname === '/' });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [value, current, params, location.pathname, navigate]);

  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label htmlFor="search" className="sr-only">
        Search games
      </label>
      <Search
        size={16}
        strokeWidth={1.5}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
      />
      <input
        id="search"
        type="search"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        placeholder="Search games"
        maxLength={64}
        autoComplete="off"
        className="h-9 w-full rounded-control border border-border bg-surface pr-3 pl-9 text-sm text-text transition-colors duration-150 ease-out placeholder:text-muted hover:border-muted"
      />
    </form>
  );
}
