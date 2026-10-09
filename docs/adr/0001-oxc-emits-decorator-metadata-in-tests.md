# 0001. Tests rely on Vitest's Oxc transform for decorator metadata

- Status: accepted
- Date: 2026-10-06

## Context

Nest resolves constructor dependencies from the `design:paramtypes` metadata that TypeScript
emits when `emitDecoratorMetadata` is on. Older Vitest versions transformed TypeScript with
esbuild, which does not emit that metadata, so `docs/CONVENTIONS.md` asked for the SWC plugin
(`unplugin-swc`).

Vitest 5.0.3 runs on Vite 8.3.3, which transforms TypeScript with Oxc. Oxc reads
`experimentalDecorators` and `emitDecoratorMetadata` from `tsconfig.json` and emits the metadata.

## Decision

Use Vitest's default transform. Do not install `unplugin-swc` or `@swc/core`.

`api/test/di-toolchain.spec.ts` is the guard: it asserts that a constructor dependency is
injected. It was checked in both directions:

| Run | Result |
|---|---|
| Project config | passes |
| Same test with `oxc.decorator.emitDecoratorMetadata: false` | fails: `expected undefined to be an instance of Clock` |

## Consequences

- Two fewer dev dependencies, one of them a native binary with a postinstall script
- The test toolchain now depends on `emitDecoratorMetadata` staying on in `tsconfig.json`.
  If it is removed, or a future Vitest changes its transform, the guard test fails first.

## Alternatives considered

- Keep `unplugin-swc`: works, but duplicates what the default transform already does
