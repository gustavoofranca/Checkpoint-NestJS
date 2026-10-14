import { Outlet, Link } from 'react-router';
import { AccountMenu } from './AccountMenu';
import { SearchField } from './SearchField';

export function Layout() {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded-control bg-accent px-3 py-2 text-sm font-medium text-bg focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-30"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link to="/" className="shrink-0 text-base font-semibold tracking-tight">
            Checkpoint
          </Link>
          <div className="flex min-w-0 flex-1 justify-center">
            <SearchField />
          </div>
          <AccountMenu />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
