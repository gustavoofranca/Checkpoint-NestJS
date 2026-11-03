import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { session } from '../session/session-store';
import { useSession } from '../session/use-session';
import { buttonClass } from './Button';

const ITEM =
  'flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-raised';

export function AccountMenu() {
  const state = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  if (state.status === 'restoring') {
    return <div className="h-9 w-24 rounded-control bg-surface" aria-hidden />;
  }
  if (state.status === 'signed-out') {
    const onAuthPage = location.pathname === '/sign-in' || location.pathname === '/sign-up';
    const from = encodeURIComponent(
      onAuthPage
        ? (new URLSearchParams(location.search).get('from') ?? '/')
        : location.pathname + location.search,
    );
    return (
      <div className="flex shrink-0 items-center gap-2">
        <Link to={`/sign-in?from=${from}`} className={buttonClass('ghost')}>
          Sign in
        </Link>
        <Link
          to={`/sign-up?from=${from}`}
          className={`${buttonClass('primary')} hidden sm:inline-flex`}
        >
          Sign up
        </Link>
      </div>
    );
  }

  const { username } = state.account;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={`${buttonClass('ghost')} shrink-0`}>
        <span className="max-w-32 truncate">{username}</span>
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-20 min-w-44 rounded-card border border-border bg-surface p-1"
        >
          <DropdownMenu.Item className={ITEM} onSelect={() => void navigate(`/u/${username}`)}>
            <User size={16} strokeWidth={1.5} aria-hidden />
            Your profile
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={ITEM}
            onSelect={() => {
              void session.signOut().finally(() => {
                void navigate('/');
              });
            }}
          >
            <LogOut size={16} strokeWidth={1.5} aria-hidden />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
