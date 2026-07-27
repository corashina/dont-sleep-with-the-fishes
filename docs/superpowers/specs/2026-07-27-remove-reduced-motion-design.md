# Remove Reduced-Motion Support

## Goal

Remove reduced-motion support and its plumbing from the game. Every player
receives the authored normal-motion presentation, including the two-second
survival-event outcome hold and both 2.5-second black fades.

This supersedes all earlier survival-event requirements that collapse
transitions or holds when `prefers-reduced-motion` is active.

## Runtime and Type Removal

- Stop querying `matchMedia('(prefers-reduced-motion: reduce)')`.
- Remove `reducedMotion` from `PhaseContext`, scavenging and survival visual
  state, test dependency types, constructors, and update/render method
  parameters.
- Delete all reduced-motion branches instead of retaining a permanently false
  flag.
- Remove reduced-motion constants that become unused.

The resulting TypeScript API must have no reduced-motion parameter to pass,
store, or synchronize.

## Authored Motion Paths

Keep the existing full-motion branch everywhere:

- scavenging camera shake;
- ship rigging, ship smoke, deposited-item smoke, and post-processing grain;
- lifeboat secondary motion, spray, cues, fishing camera/cast/reel/miss motion,
  bubbles, ripples, line arcs, and catch swing;
- generated-item use animation and survival-event tableau reveal/reaction;
- contextual-choice beats, fishing fades, sleep/event covers, quiet-night
  holds, and event-outcome holds.

No timings or amplitudes change except that the former reduced-motion
alternative is removed.

## CSS

Delete every `@media (prefers-reduced-motion: reduce)` block from
`src/styles/main.css`. Normal animation and transition declarations remain
unchanged.

In particular, `.sleep-cover` always transitions opacity over 2.5 seconds;
the media query may no longer collapse it to 1ms.

## Lifecycle and Performance

Existing lifecycle ownership remains unchanged: UI timers and transition
listeners still settle on supersession/disposal, and phase generation guards
still prevent stale continuation.

The removal must not add allocations or setup to frame-update paths. It should
simplify each frame path to its existing normal-motion expression.

## Testing and Verification

- Replace tests that select reduced-motion branches with normal-motion
  behavior tests or remove them when the normal path is already covered.
- Update fixtures and mocks to the parameter-free APIs.
- Preserve transition timing, cancellation, event ordering, resource
  ownership, and full-motion effect coverage.
- Run the full test suite, typecheck, and production build.
- Verify source and tests contain no `reducedMotion`,
  `REDUCED_TRANSITION_MS`, or `prefers-reduced-motion` references.
- In the live game, verify End Day visibly fades to black, the event is staged
  while black, and resolving the event visibly fades to black before the next
  day scene is swapped and revealed.
