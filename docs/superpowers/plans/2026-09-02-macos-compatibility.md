# macOS Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing asset tools, checks, tests, and production build pass on macOS without changing game behavior.

**Architecture:** Keep the PowerShell asset pipeline. Standardize its public commands on PowerShell 7, replace Windows path separators with platform path APIs, and verify the result on GitHub's `macos-15` runner. Add one small PowerShell checker for syntax and path safety.

**Tech Stack:** Bun, PowerShell 7, Node.js, TypeScript, Vitest, Vite, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-09-02-macos-compatibility-design.md`

## Global Constraints

- Do not redesign audio, physics, rendering, gameplay, or Safari input.
- Do not fetch or replace game assets during verification.
- Keep every existing containment guard strict.
- Use `pwsh -NoProfile -File` for all public PowerShell commands.
- Use `macos-15` for macOS CI.
- Preserve all unrelated worktree changes.
- Do not stage or commit existing user changes in runtime or test files.

## File Structure

- `package.json`: owns portable public commands.
- `scripts/check-powershell-portability.ps1`: checks PowerShell syntax, command names, and guarded path behavior.
- `scripts/texture-publication.ps1`: owns portable texture publication and cleanup guards.
- `scripts/fetch-*-models.ps1`: resolve model roots with platform path APIs.
- `scripts/fetch-ship-furniture.ps1`: resolves the ship model root with platform path APIs.
- `scripts/fetch-*-textures.ps1`: resolve texture roots with platform path APIs.
- `.github/workflows/deploy-pages.yml`: blocks deployment unless macOS verification passes.

---

### Task 1: Portable PowerShell Commands and Paths

**Files:**
- Create: `scripts/check-powershell-portability.ps1`
- Modify: `package.json:15-29`
- Modify: `scripts/texture-publication.ps1:1-60`
- Modify: `scripts/fetch-event-models.ps1:1-10`
- Modify: `scripts/fetch-fishing-models.ps1:1-6`
- Modify: `scripts/fetch-item-models.ps1:1-6`
- Modify: `scripts/fetch-menu-models.ps1:1-6`
- Modify: `scripts/fetch-ship-furniture.ps1:1-6`
- Modify: `scripts/fetch-lifeboat-textures.ps1:1-6`
- Modify: `scripts/fetch-ship-textures.ps1:1-6`

**Interfaces:**
- Consumes: PowerShell 7, `package.json`, and all `scripts/*.ps1` files.
- Produces: `bun run powershell:check`, portable asset task commands, and platform-safe guarded paths.

- [ ] **Step 1: Add the failing portability checker**

Create `scripts/check-powershell-portability.ps1`:

```powershell
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') |
  ConvertFrom-Json

$powerShellCommands = @(
  $package.scripts.PSObject.Properties |
    Where-Object { [string]$_.Value -match '\.ps1(?:\s|$)' }
)
foreach ($command in $powerShellCommands) {
  $value = [string]$command.Value
  if (-not $value.StartsWith('pwsh -NoProfile -File scripts/', [StringComparison]::Ordinal)) {
    throw "Package command $($command.Name) does not use portable PowerShell 7: $value"
  }
}

$parseFailures = @()
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    $file.FullName,
    [ref]$tokens,
    [ref]$errors
  ) | Out-Null
  foreach ($error in $errors) {
    $parseFailures += "$($file.Name): $($error.Message)"
  }
}
if ($parseFailures.Count -gt 0) {
  throw "PowerShell syntax errors:`n$($parseFailures -join "`n")"
}

$assetFetchFiles = Get-ChildItem -LiteralPath $PSScriptRoot -Filter 'fetch-*.ps1' -File
foreach ($file in $assetFetchFiles) {
  $source = Get-Content -Raw -LiteralPath $file.FullName
  if ($source.Contains('src\assets')) {
    throw "$($file.Name) contains a Windows-only asset path."
  }
}

$publicationPath = Join-Path $PSScriptRoot 'texture-publication.ps1'
$publicationSource = Get-Content -Raw -LiteralPath $publicationPath
if ($publicationSource.Contains("TrimEnd('\')") -or $publicationSource.Contains("+ '\'")) {
  throw 'texture-publication.ps1 contains a Windows-only path separator.'
}

. $publicationPath
$probeName = "dont-sleep-path-probe-$([Guid]::NewGuid().ToString('N'))"
$parent = Join-Path ([IO.Path]::GetTempPath()) $probeName
$inside = Join-Path $parent 'child'
Assert-ContainedPath -Parent $parent -Child $inside

$outside = [IO.Path]::GetFullPath((Join-Path $parent '..'))
$rejected = $false
try {
  Assert-ContainedPath -Parent $parent -Child $outside
} catch {
  $rejected = $true
}
if (-not $rejected) {
  throw 'Assert-ContainedPath accepted a path outside its parent.'
}

Write-Output "Verified $($powerShellCommands.Count) PowerShell commands and $($assetFetchFiles.Count) asset scripts."
```

- [ ] **Step 2: Run the checker and verify it fails**

Run on the current Windows host:

```powershell
powershell -NoProfile -File scripts/check-powershell-portability.ps1
```

Expected: FAIL on the first package command that uses `powershell -ExecutionPolicy Bypass`.

- [ ] **Step 3: Standardize package commands**

Add this command to `package.json`:

```json
"powershell:check": "pwsh -NoProfile -File scripts/check-powershell-portability.ps1"
```

Change every PowerShell asset command to this form:

```json
"models:fetch:items": "pwsh -NoProfile -File scripts/fetch-item-models.ps1"
```

Apply the same prefix to all five model fetch commands and both texture fetch commands.

- [ ] **Step 4: Replace Windows-only asset roots**

Replace each composite `src\assets` literal with `Path.Combine`.

Use this form for model scripts:

```powershell
$modelsRoot = [System.IO.Path]::Combine(
  $repositoryRoot,
  'src',
  'assets',
  'models'
)
```

Use this form for lifeboat textures:

```powershell
$runtimeDirectory = [System.IO.Path]::Combine(
  $projectRoot,
  'src',
  'assets',
  'lifeboat'
)
```

Use this form for ship textures:

```powershell
$runtimeDirectory = [System.IO.Path]::Combine(
  $projectRoot,
  'src',
  'assets',
  'ship'
)
```

- [ ] **Step 5: Make texture guards platform-safe**

Change both prefix calculations in `scripts/texture-publication.ps1` to use platform separators:

```powershell
$resolvedParent = [IO.Path]::GetFullPath($Parent).TrimEnd(
  [IO.Path]::DirectorySeparatorChar,
  [IO.Path]::AltDirectorySeparatorChar
) + [IO.Path]::DirectorySeparatorChar
```

```powershell
$resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd(
  [IO.Path]::DirectorySeparatorChar,
  [IO.Path]::AltDirectorySeparatorChar
) + [IO.Path]::DirectorySeparatorChar
```

- [ ] **Step 6: Run the portability checker and asset checks**

Run:

```powershell
powershell -NoProfile -File scripts/check-powershell-portability.ps1
node scripts/check-item-models.mjs
node scripts/check-ship-furniture.mjs
node scripts/check-fishing-models.mjs
node scripts/check-event-models.mjs
node scripts/check-menu-models.mjs
node scripts/check-lifeboat-textures.mjs
node scripts/check-ship-textures.mjs
node scripts/check-item-thumbnails.mjs
```

Expected: every command exits with code `0`.

- [ ] **Step 7: Commit only the portability changes**

```powershell
git add package.json scripts/check-powershell-portability.ps1 scripts/texture-publication.ps1 scripts/fetch-event-models.ps1 scripts/fetch-fishing-models.ps1 scripts/fetch-item-models.ps1 scripts/fetch-menu-models.ps1 scripts/fetch-ship-furniture.ps1 scripts/fetch-lifeboat-textures.ps1 scripts/fetch-ship-textures.ps1
git commit -m "fix: make asset tools portable to macOS"
```

### Task 2: macOS Deployment Gate

**Files:**
- Modify: `.github/workflows/deploy-pages.yml:16-52`

**Interfaces:**
- Consumes: `bun run powershell:check`, existing asset checks, Vitest, and the production build.
- Produces: a `verify-macos` job that must pass before deployment.

- [ ] **Step 1: Add the macOS verification job**

Add this job beside the existing Linux build job:

```yaml
  verify-macos:
    runs-on: macos-15
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Check PowerShell portability
        run: bun run powershell:check

      - name: Check committed assets
        run: |
          bun run models:check
          bun run thumbnails:check

      - name: Test
        run: bun run test

      - name: Build
        run: bun run build
```

- [ ] **Step 2: Block deployment on macOS verification**

Change the deploy dependency to:

```yaml
    needs: [build, verify-macos]
```

- [ ] **Step 3: Validate the workflow text**

Run:

```powershell
rg -n "verify-macos|macos-15|powershell:check|thumbnails:check|needs: \[build, verify-macos\]" .github/workflows/deploy-pages.yml
```

Expected: each required token appears once in the macOS job or deployment gate.

- [ ] **Step 4: Commit only the workflow**

```powershell
git add .github/workflows/deploy-pages.yml
git commit -m "ci: verify the project on macOS"
```

### Task 3: Full Verification

**Files:**
- Verify only: `tests/GameLifecycle.test.ts`
- Verify only: all files changed by Tasks 1 and 2

**Interfaces:**
- Consumes: the portable commands and macOS workflow.
- Produces: evidence that the current project passes all local checks without runtime changes.

- [ ] **Step 1: Confirm the existing test fixture remains present**

Run:

```powershell
rg -n "const ui = \{ showHandsFullNotice: vi\.fn\(\) \}" tests/GameLifecycle.test.ts
```

Expected: one match in the capacity rejection test. Do not stage this existing user change.

- [ ] **Step 2: Run lint and TypeScript**

Run:

```powershell
npx eslint . --max-warnings 0
npx tsc --noEmit
```

Expected: both commands exit with code `0`.

- [ ] **Step 3: Run the full test suite**

Run:

```powershell
npx vitest run
```

Expected: all test files and tests pass.

- [ ] **Step 4: Build the production site**

Run:

```powershell
npx vite build
```

Expected: Vite completes the production build with no errors.

- [ ] **Step 5: Check the final diff**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors. Only planned files appear in compatibility commits. Existing user changes remain unstaged and unchanged.
