# Gameplay preparation verification — 2026-09-10

The menu loads its own assets. Gameplay entry prepares shared props, survival events, catches, endings, and audio.
These resources remain loaded until game disposal. Scene instances retain separate ownership.

A loading screen covers texture upload, shader compilation, and the first rendered frame.
Staged events also prepare their scene before reveal. Superseded preparation cannot start an obsolete phase.

## Automated checks

- TypeScript passed.
- ESLint passed with zero warnings.
- Vitest passed: 162 files, 1,639 tests.
- Production build passed. Vite still reports the large bundle warning.

Tests cover retained resources, retries, pending shutdown, prepared catch clones, and loading-screen lifetime.
They also cover cancelled preparation, failed preparation, and the complete event model catalogue.

## Browser check

Used a separate static production preview at port 4174.
After refresh, selected Leak through the backtick developer menu. Gameplay became ready and showed its actions.
Then selected Flowers and returned to Leak. Both scenes became ready.

Resource timing entries stayed at 180 across both later selections, including 95 GLB entries.
Neither later selection added resource requests. No new browser errors appeared in the corrected build.

The first browser check found an obsolete aggregate model limit. Loading the complete catalogue exceeded that limit.
Removed the aggregate limit; individual model budgets remain enforced. A regression test covers the complete catalogue.

This was a focused scene-entry check, not a full survival playtest or a frame-time benchmark.
Initial gameplay preparation still takes time. Retaining decoded audio increases session memory.

## Audio

See [the audio audit](AUDIO_SIZE_AUDIT_2026-09-10.md) for measured sizes and reduction candidates.
Audio files remain unchanged. Estimated savings require audio editing and listening checks.
