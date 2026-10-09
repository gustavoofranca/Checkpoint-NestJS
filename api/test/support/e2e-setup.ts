import { afterEach, expect } from 'vitest';
import { takeLeaks } from './response-leak-guard';

// Runs after every e2e test: fails it if any response it received carried a password or token
// hash (docs/PLAN.md, P2).
afterEach(() => {
  expect(takeLeaks(), 'responses that exposed a password or token hash').toEqual([]);
});
