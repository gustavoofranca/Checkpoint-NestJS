import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveIndicator } from './save-indicator';

describe('SaveIndicator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows saving until the last overlapping save ends, then saved, then nothing', () => {
    vi.useFakeTimers();
    const indicator = new SaveIndicator();

    indicator.start();
    indicator.start();
    indicator.finish(true);
    expect(indicator.getSnapshot()).toBe('saving');

    indicator.finish(true);
    expect(indicator.getSnapshot()).toBe('saved');

    vi.advanceTimersByTime(2200);
    expect(indicator.getSnapshot()).toBe('idle');
  });

  it('reports a failed save', () => {
    const indicator = new SaveIndicator();

    indicator.start();
    indicator.finish(false);

    expect(indicator.getSnapshot()).toBe('failed');
  });
});
