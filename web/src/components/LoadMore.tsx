import { useEffect, useRef } from 'react';
import { Button } from './Button';

interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
  // Load the next page when the button scrolls into view; the button stays as the fallback.
  automatic?: boolean;
}

export function LoadMore({ hasMore, loading, onLoad, automatic = false }: LoadMoreProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!automatic || !hasMore || loading || element === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoad();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [automatic, hasMore, loading, onLoad]);

  if (!hasMore) {
    return null;
  }
  return (
    <div className="mt-8 flex justify-center">
      <Button ref={ref} onClick={onLoad} disabled={loading}>
        {loading ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  );
}
