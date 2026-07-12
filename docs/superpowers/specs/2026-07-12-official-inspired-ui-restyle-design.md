# Official-Inspired UI Restyle Design

**Date:** 2026-07-12  
**Status:** Approved design, awaiting written-spec review

## Objective

Restyle every player-facing interface in both game phases so it shares the visual language of the current official *Don't Sleep With The Fishes* release while remaining an original implementation. The redesign covers the start screen, scavenging HUD, survival HUD, object tooltips, pause screens, fishing choices, events, outcomes, failures, and endings. Gameplay rules, controls, Three.js world behavior, and phase flow remain unchanged.

## Reference Validation

The design is based on current official storefront imagery from the developer's [itch.io page](https://dopplerghost.itch.io/dont-sleep-with-the-fishes) and the current [Steam release](https://store.steampowered.com/app/4834070/Dont_Sleep_With_The_Fishes/), checked on 2026-07-12.

The reference interface consistently uses:

- hand-inked status symbols such as a heart, stomach, and lightning bolts;
- a hanging pocket-watch countdown during evacuation;
- distressed, irregular white display lettering;
- rough timber labels for primary actions such as ending the day;
- sparse corner placement that leaves the 3D scene dominant;
- strong edge vignette, grain, and halftone-like surface texture;
- red and green text for dangerous binary decisions;
- dark cinematic overlays instead of software-style panels.

No official image, font, texture, logo, or other proprietary asset will be copied into the project. All artwork will be implemented as original inline SVG and CSS.

## Chosen Approach

Use a faithful, original CSS-and-SVG recreation. This approach provides the closest visual match without introducing raster-asset maintenance, remote runtime dependencies, or copied artwork.

Rejected alternatives:

- An asset-heavy raster facsimile would be harder to scale, theme, test, and maintain.
- A light reskin of the current layout would leave the interface visibly too polished and dashboard-like.

## Global Visual System

The interface uses a near-black and cold charcoal base with bone-white text. Blood red communicates danger and critical condition, ochre yellow communicates energy or urgency, muted sea blue supports neutral status, and green appears only for affirmative decisions or clearly beneficial outcomes.

A fixed, pointer-transparent presentation layer supplies a soft vignette, subtle repeating grain, and restrained halftone texture. These effects must not reduce text contrast or obscure interactive objects. Texture is generated with gradients and SVG filters rather than downloaded images.

Typography uses locally available handwritten or humanist system faces with deterministic fallbacks. Display text receives irregular spacing, layered ink-like shadows, and slight rotation only where legibility remains strong. Numeric values and shortcuts remain stable and easy to scan.

Controls use rough timber, painted board, paper scrap, or brush-stroke silhouettes instead of generic rectangles. Hover, pressed, disabled, critical, and keyboard-focus states remain visually distinct. Tactile feedback uses small translation and scale changes; reduced-motion mode removes nonessential movement and pulsing.

## Scavenging Interface

The scavenging HUD becomes sparse and scene-led:

- The countdown moves into an illustrated hanging pocket watch near the upper-right corner.
- Saved-supply count and carry weight become compact, rough-edged corner labels rather than dashboard blocks.
- Carried-item names remain visible beneath the carry label in a small handwritten stack.
- The crosshair remains faint and centered.
- Interaction prompts and save/drop/capacity feedback appear on dark brush-stroke strips near the center or lower center.
- Critical countdown and sinking states use red ink, restrained shake or pulse, and stronger vignette pressure.

The start, pause, failure, and result screens use asymmetric horror-poster compositions. Large distressed titles sit off-center over the live 3D scene, controls are presented as small painted key legends, and primary actions use timber or painted-board controls. Compatibility and pointer-lock errors use an illustrated warning treatment without changing their existing behavior.

## Survival Interface

The survival HUD adopts the official reference hierarchy while retaining all current data:

- Health, hunger, energy, and hull appear at the upper left as original hand-drawn symbols with adjacent numeric or fill indications.
- Health uses a heart, hunger a stomach, energy lightning, and hull a lifebuoy or damaged-boat mark.
- Day, phase, and weather become a battered journal marker at the upper right.
- Food, bait, repair material, and rescue progress appear as compact handwritten tallies beneath the primary condition row.
- The physical boat and projected item anchors remain the main inventory and action surface.
- End Day remains linked to the horizon hotspot and receives a timber-label presentation at the lower right when its projected control is visible.

Object tooltips use torn paper, dark cloth, or brush-stroke silhouettes with high-contrast text. They continue to show item name, action, shortcut, cost, effect, risk, remaining uses, and unavailable reason. Off-screen anchors stay hidden and noninteractive.

## Dialogs and Terminal Screens

Fishing choices, events, outcomes, pause, and endings use a cinematic darkened backdrop rather than centered software cards. Headings use distressed white lettering and supporting copy remains readable at normal body sizes.

Binary event decisions use red for refusal or danger and green for affirmative action when semantically correct. Item choices and neutral actions use timber or paper controls. Color is never the only state indicator: text, shape, focus outline, and disabled treatment remain present.

Modal focus trapping, focus restoration, Escape behavior, number shortcuts, Tab order, live regions, and screen-reader labels remain unchanged. Empty event-item states and unavailable actions provide explicit copy.

## Component Responsibilities

- `src/ui/uiArtwork.ts` owns original inline SVG markup and a small typed API for the status, watch, journal, and warning symbols.
- `src/ui/GameUI.ts` owns the scavenging HUD and its start, pause, failure, and result markup while preserving existing callbacks and data attributes.
- `src/ui/SurvivalUI.ts` owns the survival status layout, projected controls, tooltips, dialogs, announcements, and endings while preserving existing interaction contracts.
- `src/styles/main.css` owns the complete visual system, responsive placement, interaction states, texture layers, and reduced-motion behavior.
- Existing gameplay, phase, survival, world, and renderer modules remain outside the visual-restyle scope.

## Data and Interaction Flow

Existing snapshots continue to drive the interface. `GameUI.render` formats scavenging time, sinking label, carry state, and saved count exactly as before. `SurvivalUI.render` continues to update meters, loose stores, day, phase, weather, projected anchors, and availability.

The artwork module returns static, decorative SVG markup. Dynamic values remain text nodes owned by the existing UI classes. Decorative SVG uses `aria-hidden="true"`; existing text and ARIA labels remain the accessible source of truth.

No new global state, third-party dependency, network request, or runtime asset loader is introduced.

## Responsive and Motion Behavior

The milestone remains desktop-first. Layout will be verified at 1280x720 and 1920x1080. At narrower desktop widths, labels condense and tallies wrap without covering the central interaction area. The interface must avoid clipping at 100% browser zoom.

When `prefers-reduced-motion: reduce` is active, shaking, drifting texture, pulsing, and animated tooltip movement are removed. Opacity and color changes may remain when required to communicate state.

## Error and Edge States

- Pointer-lock denial remains actionable and clearly visible on start and pause screens.
- Critical time, health, hunger, energy, and hull states use both icon treatment and text.
- Depleted supplies remain subdued but legible and expose their unavailable reason.
- Missing fishing or diving tools keep the corresponding actions unavailable.
- Hidden or behind-camera projected anchors cannot receive input.
- Empty event choices continue to offer Endure.
- Long item or event text wraps within the viewport.
- High-contrast focus outlines remain visible over every texture and scene brightness.

## Testing and Verification

Unit tests will be added before production changes to verify:

- the artwork module returns the expected semantic icon variants;
- decorative SVG is hidden from accessibility APIs;
- the scavenging watch, carry, saved, prompt, and feedback regions retain their data hooks;
- the survival icon regions retain meter values, danger markers, and loose-store values;
- all dialog buttons, callbacks, focus traps, shortcuts, live regions, and disposal behavior remain intact;
- no remote UI asset or third-party UI dependency is introduced.

Existing tests must continue to pass. Type checking and the production build must succeed.

Browser verification will inspect:

- scavenging start, active HUD, pause, critical countdown, failure, and result states;
- survival daytime HUD, projected tooltips, unavailable and depleted actions, fishing choice, event, outcome, pause, ending, and critical meter states;
- keyboard focus, Tab order, Escape behavior, and reduced-motion presentation;
- 1280x720 and 1920x1080 layouts against the validated official visual characteristics.

## Acceptance Criteria

1. Every player-facing screen in both phases uses the approved illustrated survival-horror visual system.
2. The HUD hierarchy clearly resembles the validated official reference language without copying official assets.
3. The 3D scene remains visually dominant and interactive boat objects remain unobstructed.
4. All current gameplay behavior, callbacks, shortcuts, focus rules, ARIA labels, and announcements remain functional.
5. Critical, unavailable, empty, disabled, hover, active, and focus states are complete and legible.
6. Reduced-motion behavior removes nonessential UI animation.
7. No third-party UI library, remote runtime dependency, or proprietary game asset is added.
8. Automated tests, type checking, production build, and browser visual checks pass.
