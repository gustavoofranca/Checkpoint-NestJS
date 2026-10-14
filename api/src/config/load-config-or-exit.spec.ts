import { afterEach, describe, expect, it, vi } from 'vitest';
import { testEnv } from '../../test/support/test-config';
import { loadConfigOrExit } from './load-config-or-exit';

class ExitCalled extends Error {}

describe('loadConfigOrExit', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function stubEnv(env: Record<string, string | undefined>): void {
    for (const [name, value] of Object.entries(env)) {
      vi.stubEnv(name, value);
    }
  }

  it('returns the config when the environment is valid', () => {
    stubEnv(testEnv({ PORT: '4100' }));

    expect(loadConfigOrExit().port).toBe(4100);
  });

  it('prints the problems and exits with code 1 when the environment is invalid', () => {
    stubEnv(testEnv({ JWT_SECRET: undefined }));
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new ExitCalled();
    });

    expect(() => loadConfigOrExit()).toThrow(ExitCalled);
    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET: is required'));
  });
});
