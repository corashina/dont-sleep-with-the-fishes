# Don't Sleep With The Fishes — FPS Performance Statistics Design

- **Status:** Approved
- **Date:** 2026-07-13

## Goal

Show a small, always-visible frames-per-second (FPS) readout so playtesters can assess rendering performance during both the scavenging and lifeboat-survival phases.

## Scope

- Display only FPS. Frame time, memory usage, hardware data, persistence, and user-facing preferences are out of scope.
- The readout is created once for the complete game run, rather than being owned by either phase UI, so it stays present through the scavenging-to-survival handoff and terminal screens.
- The badge is non-interactive and does not affect pointer lock, keyboard focus, game input, or pause behavior.

## Approaches considered

1. **Persistent compact HUD badge — selected.** A small top-right readout is immediately available during play, costs almost no screen space, and remains independent from phase-specific UI lifecycles.
2. **Toggleable debug overlay.** This would keep the ordinary UI clean, but makes routine playtest checks slower and requires a toggle affordance or shortcut.
3. **Detailed diagnostics panel.** FPS, frame time, and memory data would be useful for deep profiling but are unnecessarily broad for the requested performance statistic.

## Architecture

`PerformanceStats` will be a focused DOM component in `src/ui/PerformanceStats.ts`. `Game` constructs it with the game mount after rendering is initialized, passes each raw animation-frame delta to it, and disposes it with the rest of the game. It has no dependency on `ScavengePhase`, `SurvivalPhase`, Three.js scenes, or gameplay state.

`Game.handleAnimationFrame()` will preserve the current clamped delta used by gameplay. It will separately send the *unclamped* clock delta to `PerformanceStats`, so an underperforming frame is reported honestly instead of being capped at the 20 FPS gameplay-simulation limit.

## FPS Sampling

- The badge begins as `FPS --` until it has collected a complete sample window.
- For each valid raw delta, the component accumulates elapsed seconds and the number of rendered frames.
- At least every 500 ms of accumulated active-render time, it publishes `Math.round(frameCount / elapsedSeconds)` and starts a fresh window. This keeps the number stable enough to scan while refreshing about twice per second.
- A non-finite or non-positive delta is ignored. A delta longer than 250 ms resets the active window and leaves the displayed value unchanged; this prevents browser tab suspension, debugger pauses, or background throttling from appearing as a misleading single-digit gameplay FPS reading.
- Sampling does not change the game clock, phase update scheduling, renderer configuration, or reduced-motion behavior.

## Interface and Presentation

The component exposes:

```ts
class PerformanceStats {
  constructor(mount: HTMLElement);
  recordFrame(deltaSeconds: number): void;
  dispose(): void;
}
```

It mounts one semantic output element containing a concise visual value, for example `FPS 60`. The element has an explicit accessible name such as `Rendering performance: 60 frames per second`; it is not a live region, so frequent diagnostic updates do not interrupt screen-reader users.

The stylesheet positions the badge at the top right of the game viewport. It is compact, high-contrast, and uses `pointer-events: none`. Its stacking position stays above the scavenging and survival interfaces, including their modal views, so the requested statistic is visible for the entire run without becoming an interactive control.

## Lifecycle and Failure Handling

- `Game` owns exactly one instance after successful initialization.
- Restarting a run reuses the same badge and continues collecting fresh frame samples; a stale partial sample window is not retained across a long pause because long gaps reset it.
- `Game.dispose()` always calls `PerformanceStats.dispose()`, which removes its element and makes future `recordFrame` calls harmless.
- If a render delta is unusable, the component ignores it rather than throwing or affecting gameplay.

## Testing

Add unit coverage in `tests/PerformanceStats.test.ts` for:

1. Initial markup, non-interactive presentation, and accessible label.
2. Reporting a rounded 60 FPS value after a 500 ms sequence of 60 Hz samples.
3. Deferring display changes until a full sampling window has elapsed, then starting a new window.
4. Ignoring invalid deltas and resetting on a long gap without producing a false low FPS value.
5. Removing the overlay and safely ignoring later samples after disposal.

Update the focused game lifecycle coverage only if needed to prove that `Game` creates the overlay from its mount, records raw rather than clamped deltas, and disposes it. Existing phase and gameplay tests must remain unchanged in intent because the statistic is presentation-only.

## Acceptance criteria

- A top-right `FPS <value>` badge appears once the game starts and remains visible across scavenging, survival, endings, and restarts.
- The displayed FPS is based on raw render-frame timing and refreshes at roughly two updates per second.
- Background-tab or debugger gaps do not yield a misleading low FPS value.
- The badge cannot receive focus or intercept clicks, and it does not generate screen-reader announcements on each refresh.
- Disposing the game removes the badge without leaking DOM nodes or listeners.
- The new unit tests and the existing project test suite pass.
