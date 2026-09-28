# Mobile support design

Date: 2026-09-28
Status: Written design awaiting review. Implementation has not started.

## Intent and approved scope

Make the full game playable by touch on mobile devices.
Cover the menu, scavenging, survival, fishing, events, settings, journals, and endings.
The user approved landscape gameplay and shared game logic with dedicated touch controls.
Preserve the illustrated sea style described in `VISUAL_STYLE_GUIDE.md`.

Assumed browser targets are iPhone and iPad Safari, plus Android Chrome.
Record exact browser and operating system versions during validation.
Support landscape layouts from 568 by 320 CSS pixels through tablet sizes.
Keep normal browser mode usable without fullscreen or an orientation-lock API.

## Approach

Use shared game actions with separate mouse, keyboard, and touch input sources.
Keep the existing gameplay rules, player collision system, and boat camera behavior.
Add touch controls only where the current controls need them.

Gesture-only controls would be harder to discover during timed scavenging.
A separate mobile game would duplicate gameplay and increase maintenance.
The shared approach gives each device suitable controls without duplicate game rules.

## Landscape and viewport

- Show a rotate prompt in portrait on devices using touch controls.
- Block game start while that prompt is visible.
- Pause an active session when the viewport changes to portrait.
- Clear held controls before showing the prompt.
- Return to a Resume screen after landscape returns. Do not resume automatically.
- Preserve a pause or open panel that existed before rotation.
- Keep unfinished events, fishing states, and inventory intact during rotation.
- Fit the canvas to the visible viewport when browser bars change size.
- Apply screen safe areas to controls, prompts, and panels.
- Keep projected item targets aligned with the resized canvas.

## Input and session control

Replace the assumption that pointer lock means the game is running.
Use explicit session start, pause, and resume actions.
Desktop mouse capture remains a desktop input condition.
Touch gameplay must never request pointer lock.

Detect touch capability and primary pointer type, rather than browser names.
Show touch controls by default for a coarse primary pointer.
An actual touch can select touch controls on a device with mixed input.
Do not change render defaults when the player switches input sources.
Keep mouse and keyboard actions available on devices with mixed input.

Each active finger owns one control until release or cancellation.
Use pointer capture for movement and look gestures.
Track fingers independently so movement, looking, and actions can run together.
Do not treat a camera drag as an interaction tap.
Do not fire both a touch action and a synthetic mouse action for one gesture.

Clear movement, look deltas, sprint state, and queued actions on interruption.
Interruptions include pause, rotation, lost focus, hidden documents, touch cancellation, and phase changes.
Lost pointer capture during active touch gameplay is also an interruption.
Pause gameplay after an unexpected touch cancellation. Require an explicit Resume action.
Opening a modal suspends world input until that modal closes.
Restarting a phase must remove old controls and event listeners.

## Scavenging controls

- Place a fixed movement stick in the lower left corner.
- Scale movement by stick distance after a small dead zone.
- Clamp the movement vector to prevent faster diagonal movement.
- Use the open area on the right for camera dragging.
- Exclude buttons and modal panels from the camera gesture area.
- Keep the crosshair as the interaction target.
- Provide Interact and Jump buttons near the right thumb.
- Provide a Sprint toggle beside the movement stick.
- Reset Sprint on pause, release of session control, or phase exit.
- Keep Pause available near the upper edge.
- Use the existing carry, pickup, deposit, ladder, and jump rules.
- Show touch instructions for the current interaction and game guide.

The movement stick and camera drag feed the existing player controller.
Touch controls must not move the player or resolve collisions directly.

## Survival controls

Keep the existing staged boat camera and focused event views.
Do not add a movement stick or free camera to survival.

- Tap an item to show its available actions and unavailable reasons.
- Keep action buttons near the item where space permits.
- Move the action panel inside the safe viewport when the item is near an edge.
- Provide visible controls for journal, pause, rear view, and return actions.
- Make event choices and item targeting work without hover or keyboard input.
- Keep returning from a focused event possible at the existing allowed times.
- Cast by tapping visible water. Reel through a large visible button during a bite.
- Keep all controls above the world surface in the input order.

Small world targets need touch hit areas at least 48 by 48 CSS pixels.
Use the existing projected bounds and hit tests as the target source.
Prefer a direct visible hit when expanded touch areas overlap.
Otherwise select the closest visible target within its expanded bounds.
Never activate an occluded item through another solid object.
If a target cannot be expanded safely, expose its action through the selected-item panel.

## Layout and language

- Give every touch button a hit area at least 48 by 48 CSS pixels.
- Keep adjacent hit areas separate.
- Keep the world center open during normal gameplay.
- Use compact status displays in short landscape viewports.
- Allow panel contents to scroll vertically when needed.
- Keep close and return controls visible and reachable.
- Prevent page scrolling and browser gestures on gameplay gesture surfaces.
- Preserve scrolling inside journals, guides, settings, and long choice panels.
- Keep focus, labels, and unavailable reasons clear.
- Add touch text in English, Polish, and Argentine Spanish through the existing language system.
- Use the existing artwork, fonts, materials, and button style.

## Rendering and performance

Use the existing quality controls instead of adding a second graphics system.
On first use with a coarse primary pointer, choose low visual, water, shadow, and antialiasing settings.
Keep ambient occlusion in composite mode at its existing low quality.
Preserve each valid saved setting independently.
Storage failures must not prevent startup or changes within the current session.

Cap mobile device pixel ratio at 1 initially.
Keep the existing desktop pixel ratio cap.
Resize render targets only when their effective dimensions change.
Create controls and reusable input state once. Avoid allocations during frame updates.
Retain the existing audio unlock behavior through user interaction.
Do not replace collision geometry or remove gameplay objects to improve frame rate.

Measure the menu, ship, boat, fishing, and a demanding weather or event scene.
Use at least 60 seconds of active play per measured scene after loading completes.
Record device, browser, viewport, settings, median frame time, and 95th-percentile frame time.
Target a median frame time at or below 33.3 ms on each tested mobile device.
Report stalls and repeated slow frames separately from the median.
If the target fails, profile the measured bottleneck and change only the relevant rendering cost.
Do not add automatic quality switching without measured need and a separate design decision.

Desktop emulation validates layout and input. It cannot establish mobile GPU speed, heat, memory limits, or battery use.
If physical devices are unavailable, label mobile performance unverified and retain the device test checklist.

## Component boundaries

| Area | Responsibility and integration |
| --- | --- |
| Browser capabilities | Resolve initial input mode and mobile render defaults once. Observe actual input changes. |
| Viewport controller | Measure visible size, screen safe areas, and portrait state. Notify the game when these change. |
| Input controller | Merge input into movement, look, interaction, jump, and sprint actions. Clear state on interruption. |
| Touch controls view | Own control markup, pointer capture, labels, and finger assignments. Emit actions only. |
| Game and phase lifecycle | Own explicit start, pause, resume, rotation blocking, and phase cleanup. |
| Survival views | Adapt existing item, event, fishing, journal, and modal interactions for touch. |
| Quality preferences | Apply mobile defaults only to settings without valid saved values. |
| Renderer | Apply effective viewport dimensions and the mobile pixel ratio cap. |

Relevant existing files include `src/input/InputController.ts`, `src/player/PlayerController.ts`, and `src/game/GameLoop.ts`.
Lifecycle changes include `src/Game.ts`, `src/phases/MainMenuPhase.ts`, and `src/phases/ScavengePhase.ts`.
Survival changes use `src/survival/SurvivalPhase.ts`, its visibility controller, and the existing `src/ui/Survival*` views.
Layout changes use `index.html`, `src/styles/main.css`, and `src/styles/settings.css`.
Preferences and rendering remain within `src/rendering`, `src/browser`, and the existing settings system.
Choose final new module names during implementation planning.

## Validation

Only implement new tests rated 90 or above, as required by `AGENTS.md`.
Prefer behavioral tests for gameplay failures over tests that copy implementation details.

| Proposed test | Importance | Required result |
| --- | --- | --- |
| Start and resume with touch | 100 | Complete menu-to-scavenging entry without pointer lock. |
| Concurrent touch controls | 100 | Move, look, and interact together without duplicate actions. |
| Interruption and rotation | 100 | Clear held input, freeze gameplay, and require explicit resume. |
| Phase and modal isolation | 95 | No gameplay input leaks through panels or across phase changes. |
| Survival target selection | 95 | Touch selects visible targets without activating hidden items. |
| Fishing touch lifecycle | 95 | Cast, reel, collect, and exit once per intended action. |
| Quality preference handling | 90 | Apply mobile defaults while preserving valid saved settings. |
| Desktop control regression | 95 | Mouse capture, keyboard movement, pause, and resume remain functional. |

Run lint, TypeScript checks, relevant automated tests, and the production build after implementation.
Inspect small and large landscape layouts at 568x320, 844x390, 915x412, and 1024x768 CSS pixels.
Also inspect portrait rotation, screen safe areas, and browser bar size changes.
Verify menu, guide, settings, journal, trade, event choices, fishing results, and ending panels.
Check production model visibility and item target alignment at each viewport.

Complete a flow from game start through scavenging and boat entry using touch controls.
Exercise pickup, carrying, deposit, ladders, sprint, jumping, pause, and resume.
In survival, exercise item actions, rear view, fishing, events, journals, and an ending.
Use `docs/browser-playtesting.md` and the browser-playtest skill for AI survival playtest batches.
That workflow selects the tester count before launching a batch.
Keep test traffic excluded from production analytics through the existing development setup.

## Delivery boundaries

Implement in working layers: session control, scavenging touch, survival layout, then rendering validation.
Keep the game usable after each layer.
Do not add native packaging, offline installation, gamepad controls, portrait gameplay, or reduced-motion variants.
Do not add compatibility shims for obsolete input paths.
Do not change survival balance, collision rules, or event outcomes.
Report validated behavior, device measurements, and remaining device test limits separately.

## Review state

The user approved the landscape choice and the conversational design.
This document is the next review artifact.
Written-spec approval permits implementation planning, as required by the requested brainstorming skill.
