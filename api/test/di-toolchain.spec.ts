import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

@Injectable()
class Clock {
  now(): number {
    return Date.now();
  }
}

@Injectable()
class UsesClock {
  constructor(readonly clock: Clock) {}
}

// Guards the test toolchain: without emitted decorator metadata Nest cannot see the
// constructor parameter types and injects undefined instead of failing.
describe('dependency injection under Vitest', () => {
  it('injects constructor dependencies resolved from decorator metadata', async () => {
    const moduleRef = await Test.createTestingModule({ providers: [Clock, UsesClock] }).compile();

    expect(moduleRef.get(UsesClock).clock).toBeInstanceOf(Clock);
  });
});
