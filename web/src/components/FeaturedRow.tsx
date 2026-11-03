import { useQuery } from '@tanstack/react-query';
import { featuredQuery } from '../api/queries';
import { GameCard } from './GameCard';

// The best-rated games, above the catalog grid. Hidden while it loads or if it fails: the grid
// below is the page's content, this row only adds rhythm.
export function FeaturedRow() {
  const featured = useQuery(featuredQuery);
  const games = featured.data?.data.filter((game) => game.rating.count > 0) ?? [];
  if (games.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="featured-heading" className="mb-8">
      <h2 id="featured-heading" className="font-display mb-3 text-lg font-bold">
        Top rated
      </h2>
      {/* contain: paint. Without it, Chrome counted the off-screen cards in the page's own scroll
          width (2528 px on a 1265 px page, measured) and the whole page scrolled sideways, even
          though this list is a scroll container. overflow: hidden on the section did not help. */}
      <ul className="scrollbar-none [contain:paint] -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {games.map((game) => (
          <GameCard key={game.id} game={game} featured />
        ))}
      </ul>
    </section>
  );
}
