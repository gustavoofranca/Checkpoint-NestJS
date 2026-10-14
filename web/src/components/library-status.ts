import { CircleSlash, Flag, Gamepad2, Layers, type LucideIcon } from 'lucide-react';
import type { LibraryStatus } from '../api/types';

interface StatusStyle {
  label: string;
  icon: LucideIcon;
  // Full class names, so Tailwind finds them in the source: the text colour, a pressed status
  // button, and the active tab of the profile library.
  text: string;
  pressed: string;
  activeTab: string;
}

// Each status keeps one colour and one icon everywhere it appears (docs/DESIGN.md, Colour).
export const STATUS: Record<LibraryStatus, StatusStyle> = {
  PLAYING: {
    label: 'Playing',
    icon: Gamepad2,
    text: 'text-playing',
    pressed: 'border-playing bg-playing/12 text-playing',
    activeTab: 'data-[state=active]:text-playing',
  },
  BACKLOG: {
    label: 'Backlog',
    icon: Layers,
    text: 'text-backlog',
    pressed: 'border-backlog bg-backlog/12 text-backlog',
    activeTab: 'data-[state=active]:text-backlog',
  },
  COMPLETED: {
    label: 'Completed',
    icon: Flag,
    text: 'text-completed',
    pressed: 'border-completed bg-completed/12 text-completed',
    activeTab: 'data-[state=active]:text-completed',
  },
  DROPPED: {
    label: 'Dropped',
    icon: CircleSlash,
    text: 'text-dropped',
    pressed: 'border-dropped bg-dropped/12 text-dropped',
    activeTab: 'data-[state=active]:text-dropped',
  },
};
