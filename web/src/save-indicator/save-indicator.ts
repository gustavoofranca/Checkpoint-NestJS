export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

const SAVED_VISIBLE_MS = 2200;

// The autosave indicator: anything the user saves (a review, a library status) reports here, and
// one indicator in the corner shows "Saving…" and then "Progress saved". Counting pending saves
// keeps it on "Saving…" while several overlap.
export class SaveIndicator {
  private state: SaveState = 'idle';
  private pending = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): SaveState => this.state;

  start(): void {
    this.pending += 1;
    clearTimeout(this.timer);
    this.set('saving');
  }

  finish(succeeded: boolean): void {
    this.pending = Math.max(this.pending - 1, 0);
    if (this.pending > 0) {
      return;
    }
    this.set(succeeded ? 'saved' : 'failed');
    this.timer = setTimeout(() => {
      this.set('idle');
    }, SAVED_VISIBLE_MS);
  }

  private set(state: SaveState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const saveIndicator = new SaveIndicator();
