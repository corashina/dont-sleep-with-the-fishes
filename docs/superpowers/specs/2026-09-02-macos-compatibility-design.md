# macOS Compatibility Design

## Goal

Make the existing developer workflow run on macOS without changing game behavior.

The project must install, validate assets, test, and build on a GitHub macOS runner.

## Scope

This change covers:

- PowerShell command names in package scripts.
- Portable path handling in PowerShell asset scripts.
- The current failing test fixture.
- A macOS GitHub Actions verification job.

This change does not redesign audio, physics, rendering, gameplay, or Safari input.

## Tooling

All package scripts that run PowerShell will call PowerShell 7 through `pwsh`.

Each command will use `-NoProfile -File`. It will not use Windows execution-policy flags.

PowerShell scripts will use platform path APIs. They will not build guarded paths with hard-coded separators.

Existing containment checks will remain strict. They will compare full paths with the platform directory separator.

## Components

`package.json` owns the public developer commands.

PowerShell asset scripts own downloads, staging, validation, publication, and guarded cleanup.

Existing Node scripts own read-only model, texture, and thumbnail checks.

GitHub Actions owns repeatable macOS verification.

## Data Flow

A developer starts an asset task through Bun.

Bun starts `pwsh`. The PowerShell script resolves project, staging, and output paths with platform APIs.

The script validates each path before it moves or removes data. It then calls the existing Node processors.

The macOS CI job installs locked dependencies and runs read-only asset checks. It does not fetch or replace assets.

## Error Handling

Asset scripts keep `$ErrorActionPreference = 'Stop'`.

Unsafe path checks throw before any move or recursive removal.

Child Node failures remain fatal through `$LASTEXITCODE` checks.

CI stops when any command fails.

## Verification

The macOS job will use `macos-15` and Bun's official setup action.

It will run:

1. `bun install --frozen-lockfile`
2. PowerShell parser checks for every `.ps1` file
3. All committed model, texture, and thumbnail checks
4. ESLint
5. TypeScript
6. All Vitest tests
7. The production build

The current failing `GameLifecycle` fixture will receive the missing UI method. Production behavior will not change.

Local verification will run the same available checks before completion.

## Success Criteria

- No package script calls Windows PowerShell.
- No guarded PowerShell path uses a hard-coded directory separator.
- The existing Windows checks still pass.
- The macOS CI job passes on `macos-15`.
- The full test suite passes.
- The production build passes.
