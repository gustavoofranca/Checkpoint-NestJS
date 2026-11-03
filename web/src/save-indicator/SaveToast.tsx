import { useSyncExternalStore } from 'react';
import { LogoMark } from '../components/LogoMark';
import { saveIndicator } from './save-indicator';

const MESSAGES = { saving: 'Saving…', saved: 'Progress saved', failed: 'Not saved' } as const;

export function SaveToast() {
  const state = useSyncExternalStore(saveIndicator.subscribe, saveIndicator.getSnapshot);
  return (
    // Always in the DOM, so screen readers announce each change.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-30"
    >
      {state !== 'idle' && (
        <div
          key={state}
          className="flex animate-toast-in items-center gap-2.5 rounded-card border border-border bg-raised py-2 pr-4 pl-3 text-sm shadow-lg shadow-black/40"
        >
          {state === 'saving' && (
            <span
              aria-hidden
              className="block size-3 animate-autosave rounded-[2px] border-2 border-accent"
            />
          )}
          {state === 'saved' && (
            <span className="text-accent">
              <LogoMark size={20} saving />
            </span>
          )}
          {state === 'failed' && (
            <span aria-hidden className="block size-3 rotate-45 rounded-[2px] bg-danger" />
          )}
          <span>{MESSAGES[state]}</span>
        </div>
      )}
    </div>
  );
}
