# Mobile support validation

Date: 2026-09-28
Branch: `codex/mobile-support-implementation`

## Implemented behavior

- Landscape touch controls: move, look, jump, sprint, interact, pause, and intro skip.
- Touch item selection and fishing controls in survival mode.
- Rotation and app interruptions stop play. Resume requires an explicit action.
- Existing game pauses and open panels remain in place after a mobile interruption.
- Compact panels, scroll areas, safe-area spacing, and localized touch instructions.
- New coarse-pointer sessions use low rendering defaults and a device pixel ratio cap of 1.
- Valid saved graphics settings remain intact.

## Automated checks

- ESLint: passed with no warnings.
- TypeScript: passed.
- Production build: passed. The existing large-chunk warning remains.
- Full tests: 179 files and 1,222 tests passed after all fixes. Duration: 125.95 seconds.

Independent task reviews and the final branch review passed after fixes.

## Browser checks

Checked menu and rotation prompts in the Codex in-app Chromium browser.
Checked touch control bounds at 568x320, 844x390, 915x412, 1024x768, and 1366x1024.
Interact, Jump, and Sprint measured 64x64 pixels. Pause measured 72x48 pixels.
The guide close button measured 48x48 pixels on the short landscape layout.
A fishing component check at 1366x1024 confirmed one cast, a visible 48x48 Reel button, and one reel action.
All tested settings buttons, selects, sliders, and switches measured at least 48 pixels at 1366x1024.
The guide scrolled at 844x390. Its close button measured 48x48, and its page buttons measured 58x48.
A simulated 568x320 visible viewport at offset (30, 20) kept canvas, UI roots, crosshair, fishing target, and HUD aligned.
Restoring zero offsets restored the full 1366x1024 rectangle. The result panel stayed inside the smaller rectangle.
Component checks used the actual DOM view classes without a rendered game scene.

## Validation limits

The in-app browser disabled WebGL after repeated context loss during development reloads.
A new tab also failed to create a WebGL context. Full rendered-game checks could not finish.
The browser did not support native multi-touch injection. Automated input tests cover concurrent pointers and cancellation.
Physical iPhone, iPad, and Android checks remain pending. Phone GPU speed and thermal behavior are not measured.
Safe-area behavior on actual notched devices remains pending.

## Interaction decision

Expanded item targets reject taps when nearer solid geometry blocks the finger ray.
This prevents selection through boat objects. Some edge taps may need more precise aim.


## Remaining physical-device checklist

- Complete a touch run from the menu through scavenging, boat entry, fishing, events, and an ending.
- Check simultaneous movement, look, and actions on iOS Safari and Android Chrome.
- Check rotation, app switching, touch cancellation, browser bars, and screen safe areas.
- Measure at least 60 seconds each in menu, ship, boat, fishing, and demanding weather.
- Record device, browser, viewport, settings, median frame time, and 95th-percentile frame time.
- Target median frame time at or below 33.3 milliseconds. Report stalls separately.
