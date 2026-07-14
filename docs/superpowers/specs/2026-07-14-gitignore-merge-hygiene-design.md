# Git Ignore and Merge Hygiene Design

## Goal

Keep generated, machine-local, and secret-bearing files out of version control before integrating the coastal-freighter branch into `master`.

## Selected scope

Preserve the existing ignore rules for dependencies, build output, coverage, Superpowers artifacts, worktrees, and log files. Add these project-standard rules:

- `*.err` for local development-server error streams such as `dev-server.err`.
- `.env` and `.env.*` for local environment and secret files.
- `!.env.example` so a documented environment template remains trackable.
- `.vite/` for Vite's local cache.
- `*.tsbuildinfo` for TypeScript incremental-build state.
- `.DS_Store` and `Thumbs.db` for macOS and Windows filesystem metadata.

Do not ignore `.vscode/` or `.idea/`; editor configuration may be intentionally shared and no such generated files are currently present.

## Verification and integration

After updating `.gitignore`, verify `dev-server.err` disappears from normal `git status`, ensure no intended source/test/documentation file is ignored, rerun type checking, the full test suite, and the production build, then commit the branch. Merge the named worktree branch into local `master`, rerun verification on the merged checkout, push `master`, and only then remove the owned `.worktrees/large-coastal-freighter` worktree and feature branch.

## Error handling

Stop before pushing if the commit, merge, verification, or remote update fails. Do not force-push, discard local changes, or delete the worktree until the merged result is verified and pushed successfully.
