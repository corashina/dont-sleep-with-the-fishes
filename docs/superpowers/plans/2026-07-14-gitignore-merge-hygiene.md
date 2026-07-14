# Git Ignore and Merge Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved generated/local-file ignore rules, commit the completed coastal freighter, safely merge it into `master`, verify the merged result, push `origin/master`, and restore unrelated local work.

**Architecture:** Update only the repository-root `.gitignore`, then commit all remaining freighter source/tests/docs on the named feature branch. Because the `master` checkout contains unrelated tracked and untracked changes, preserve them in a named stash before pulling and merging; restore them after the verified merge is pushed, retaining the stash until restoration is confirmed conflict-free.

**Tech Stack:** Git, PowerShell, Bun 1.3.6, TypeScript, Vitest, Vite.

## Global Constraints

- Preserve every existing `.gitignore` rule.
- Keep `.env.example` trackable while ignoring `.env` and `.env.*` secrets.
- Do not ignore `.vscode/` or `.idea/`.
- Do not discard, overwrite, or commit the unrelated local changes currently present on `master`.
- Do not force-push.
- Stop before pushing if commit, merge, type checking, tests, or build fails.
- Remove the owned feature worktree and branch only after merge, verification, push, and unrelated-work restoration succeed.

---

### Task 1: Add project-standard ignore rules and commit the freighter branch

**Files:**

- Modify: `.gitignore`
- Commit existing approved changes under `README.md`, `src/`, `tests/`, and `docs/superpowers/`.

**Interfaces:**

- Consumes: the approved ignore-hygiene design and the reviewed coastal-freighter working tree.
- Produces: a clean `codex/large-coastal-freighter` branch whose generated/local files are ignored and whose implementation is fully committed.

- [ ] **Step 1: Confirm the escaping local artifact is not ignored**

Run:

```powershell
git check-ignore -q dev-server.err
```

Expected: exit code `1`, confirming `dev-server.err` currently escapes the ignore rules.

- [ ] **Step 2: Append the approved rules**

Add exactly this block after the existing entries in `.gitignore`:

```gitignore

# Local environment and tool state
*.err
.env
.env.*
!.env.example
.vite/
*.tsbuildinfo
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Verify ignore behavior**

Run:

```powershell
git check-ignore dev-server.err
git check-ignore --no-index .env .env.local .vite/cache 2>$null
git check-ignore -q --no-index .env.example
if ($LASTEXITCODE -eq 0) { throw '.env.example must remain trackable' }
git status --short
```

Expected: `dev-server.err`, `.env`, `.env.local`, and `.vite/cache` are ignored; `.env.example` is not ignored; all intended freighter source/test/docs files remain visible in status.

- [ ] **Step 4: Run fresh branch verification**

Run:

```powershell
bun run typecheck
bun run test
bun run build
```

Expected: type checking exits `0`, all `375` tests pass, and Vite completes the production build. The existing chunk-size advisory is non-failing.

- [ ] **Step 5: Commit the remaining branch changes**

Run:

```powershell
git add .gitignore README.md src tests docs/superpowers
git diff --cached --check
git commit -m "feat: complete coastal freighter overhaul"
git status --short
```

Expected: commit succeeds and feature-worktree status is clean; ignored `dev-server.err` is absent.

---

### Task 2: Preserve local master work, merge, verify, push, and clean up

**Files:**

- Preserve without committing: current modified/untracked files in `C:\Users\Tomasz\Documents\Projects\dont-sleep-with-the-fishes`.
- Merge: `codex/large-coastal-freighter` into `master`.

**Interfaces:**

- Consumes: clean feature branch `codex/large-coastal-freighter` and upstream `origin/master`.
- Produces: pushed `origin/master`, restored unrelated local changes, and removed owned feature worktree/branch.

- [ ] **Step 1: Capture the main checkout state and preserve it**

Run in the main checkout:

```powershell
git status --short
git stash push -u -m "codex-preserve-before-freighter-merge-2026-07-14"
git status --short
```

Expected: the named stash is created and `master` becomes clean. Do not proceed if any tracked or untracked entry remains.

- [ ] **Step 2: Fast-forward local master from the remote**

Run:

```powershell
git pull --ff-only origin master
```

Expected: success without a local merge commit. If the remote diverged, stop and inspect instead of forcing.

- [ ] **Step 3: Merge the feature branch**

Run:

```powershell
git merge --no-ff codex/large-coastal-freighter -m "Merge branch 'codex/large-coastal-freighter'"
```

Expected: merge succeeds. If conflicts occur, resolve only the feature/upstream committed changes, preserve both intended behaviors, and inspect `git diff --check` before continuing.

- [ ] **Step 4: Verify the merged result**

Run:

```powershell
bun run typecheck
bun run test
bun run build
git status --short
```

Expected: type checking and build exit `0`, all tests pass, and `master` has no uncommitted merge residue.

- [ ] **Step 5: Push master without force**

Run:

```powershell
git push origin master
```

Expected: `origin/master` advances to the verified merge commit.

- [ ] **Step 6: Restore unrelated local work safely**

Locate and apply the named stash without dropping it first:

```powershell
$stash = git stash list | Select-String 'codex-preserve-before-freighter-merge-2026-07-14' | Select-Object -First 1
if (-not $stash) { throw 'Preservation stash not found' }
$stashRef = ($stash.Line -split ':')[0]
git stash apply $stashRef
git diff --name-only --diff-filter=U
```

Expected: the original local modifications/untracked files return and the unmerged-path command prints nothing. If conflicts occur, keep the stash, resolve by preserving the restored local intent alongside the merged freighter behavior, and do not drop the stash until `git diff --name-only --diff-filter=U` is empty.

- [ ] **Step 7: Drop the confirmed preservation stash and clean up the owned worktree**

After restoration is conflict-free:

```powershell
git stash drop $stashRef
git worktree remove "C:\Users\Tomasz\Documents\Projects\dont-sleep-with-the-fishes\.worktrees\large-coastal-freighter"
git worktree prune
git branch -d codex/large-coastal-freighter
git status --short
```

Expected: the feature worktree and merged feature branch are removed; unrelated local work remains visible in the main checkout exactly as restored.
