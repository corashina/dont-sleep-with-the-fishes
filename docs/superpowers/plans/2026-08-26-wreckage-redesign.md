# Wreckage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Wreckage as a starboard debris inspection event with shared focus UI, normal scuba entry, a three-second underwater wreck shot, and a reward paper after returning to the boat.

**Architecture:** Rename the drifting-only focus view and flow into shared focused-event components. Keep event-specific actions in `SurvivalEventFlow` and `WreckagePresentation`. Extend the dive presentation with one optional post-entry hold and remove the mixed underwater reveal path.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7, GLB assets through the existing Poly Pizza pipeline.

**Spec:** `docs/superpowers/specs/2026-08-26-wreckage-redesign-design.md`

## Global Constraints

- Keep Wreckage balance, costs, outcome weights, and recurrence unchanged.
- Keep Search Debris available without scuba gear.
- Keep Carlitos at three energy. Carlitos cannot dive.
- Keep the normal 5.8-second scuba entry pose and impact timing unchanged.
- Start the three-second wreck hold only after the normal scuba entry completes.
- Keep all surface debris on the starboard side.
- Use one box, one crate, one pallet, and five code-native planks.
- Use no underwater result reaction.
- Use the existing result paper after the default boat view returns.
- Remove obsolete drifting-only and underwater reveal paths. Add no compatibility layer.
- Add no package or sound asset.
- Add no reduced-motion variant.
- Allocate no object, array, vector, geometry, or material during frame updates.
- Preserve unrelated worktree changes. Stage only files from the active task.

## File Map

### New files

- `src/ui/FocusedEventView.ts`: Shared anchored choice paper for Drifting Loot and Wreckage.
- `src/survival/FocusedEventFlow.ts`: Shared focus camera and choice lifecycle.
- `tests/FocusedEventFlow.test.ts`: Shared flow ordering, lifecycle, and failure tests.
- `src/assets/models/events/wreckageBox.glb`: CC0 Wreckage box.
- `src/assets/models/events/wreckageCrate.glb`: CC0 Wreckage crate.
- `src/assets/models/events/wreckagePallet.glb`: CC0 Wreckage pallet.

### Removed files

- `src/ui/DriftingItemView.ts`: Replaced by `FocusedEventView.ts`.
- `src/survival/DriftingItemFlow.ts`: Replaced by `FocusedEventFlow.ts`.
- `tests/DriftingItemFlow.test.ts`: Replaced by `FocusedEventFlow.test.ts`.

### Modified files

- `scripts/poly-pizza-event-models.mjs`: Add the three approved Poly Pizza sources and limits.
- `scripts/event-model-lock.json`: Pin discovered source data and hashes.
- `src/assets/models/events/event-model-metadata.json`: Add generated model metadata.
- `src/assets/ATTRIBUTION.md`: Add CC0 attribution rows.
- `src/survival/eventModelManifest.ts`: Register three Wreckage model IDs and presentation settings.
- `src/survival/eventBundleManifest.ts`: Replace obsolete Wreckage model dependencies.
- `src/survival/eventCatalog.ts`: Define the inspectable event ID union and guard.
- `src/survival/BoatInteraction.ts`: Let event anchors focus any inspectable event.
- `src/survival/FocusedEventPresentation.ts`: Let interaction targets select a choice or open focus.
- `src/survival/BoatInteractionProjector.ts`: Project Wreckage focus targets.
- `src/survival/eventPresentationTypes.ts`: Expose dedicated interaction targets and roots.
- `src/survival/EventPresentationCoordinator.ts`: Forward dedicated interaction targets and roots.
- `src/survival/eventPresentationAdapters.ts`: Publish dedicated interaction data.
- `src/survival/BoatCameraController.ts`: Rename drifting-only focus camera methods.
- `src/survival/BoatWorld.ts`: Route shared focus camera, projection, and Wreckage actions.
- `src/ui/SurvivalUiViewModel.ts`: Add item-backed focused choices.
- `src/ui/SurvivalUI.ts`: Own and route the shared focused-event view.
- `src/ui/BoatAnchorView.ts`: Route shared focus IDs.
- `src/styles/main.css`: Rename drifting focus selectors to shared focus selectors.
- `src/survival/SurvivalPhase.ts`: Construct and wire `FocusedEventFlow`.
- `src/survival/SurvivalEventFlow.ts`: Build Wreckage choices and resolve focused actions.
- `src/survival/SurvivalSession.ts`: Emit reward summaries for Wreckage gains.
- `src/ui/SurvivalCoverViewModel.ts`: Permit the `WRECKAGE` result title.
- `src/survival/DivePresentation.ts`: Add the optional post-entry hold.
- `src/survival/DivePresentationController.ts`: Pass and time the hold without changing entry samples.
- `src/survival/events/wreckageChoreography.ts`: Remove obsolete search and underwater reaction beats.
- `src/survival/events/WreckagePresentation.ts`: Build surface debris, publish focus, and show the wreck hold.
- `tests/EventModelLibrary.test.ts`: Verify model IDs and presentation settings.
- `tests/EventBundleManager.test.ts`: Verify the exact Wreckage bundle.
- `tests/BoatInteractionProjector.test.ts`: Verify focus targets and projected IDs.
- `tests/EventPresentationRegistry.test.ts`: Verify dedicated target forwarding.
- `tests/BoatWorld.test.ts`: Verify shared focus camera and Wreckage world routing.
- `tests/SurvivalUI.test.ts`: Verify shared paper layout, costs, reasons, and item-backed clicks.
- `tests/SurvivalEventFlow.test.ts`: Verify all Wreckage focused choices and result ordering.
- `tests/SurvivalPhase.test.ts`: Verify complete event wiring and result display.
- `tests/SurvivalSession.test.ts`: Verify Wreckage reward summaries and unchanged balance.
- `tests/DivePresentationController.test.ts`: Verify unchanged entry and optional three-second hold.
- `tests/WreckagePresentation.test.ts`: Verify debris, visibility, camera hold, cleanup, and resource reuse.
- `tests/AudioSystem.test.ts`: Remove obsolete underwater reaction expectations and keep dive cleanup coverage.

---

### Task 1: Add the three approved debris models

**Files:**

- Modify: `scripts/poly-pizza-event-models.mjs`
- Modify: `scripts/event-model-lock.json`
- Create: `src/assets/models/events/wreckageBox.glb`
- Create: `src/assets/models/events/wreckageCrate.glb`
- Create: `src/assets/models/events/wreckagePallet.glb`
- Modify: `src/assets/models/events/event-model-metadata.json`
- Modify: `src/assets/ATTRIBUTION.md`
- Modify: `src/survival/eventModelManifest.ts`
- Modify: `src/survival/eventBundleManifest.ts`
- Test: `tests/EventModelLibrary.test.ts`
- Test: `tests/EventBundleManager.test.ts`

**Interfaces:**

- Produces: `EventModelId` values `wreckageBox`, `wreckageCrate`, and `wreckagePallet`.
- Produces: `EVENT_BUNDLE_SPECS.wreckage.models` with the ship and three new surface models.
- Consumes: The existing event model discovery, lock, conversion, metadata, and attribution pipeline.

- [ ] **Step 1: Write failing manifest and bundle tests**

Add these exact expectations:

```ts
expect(EVENT_MODEL_IDS).toEqual(expect.arrayContaining([
  'wreckageBox',
  'wreckageCrate',
  'wreckagePallet',
]));

expect(EVENT_MODEL_SPECS.wreckageBox).toMatchObject({
  targetLongestDimension: 0.9,
  rotation: [0, 0, 0],
  offset: [0, 0, 0],
});
expect(EVENT_MODEL_SPECS.wreckageCrate).toMatchObject({
  targetLongestDimension: 1.05,
  rotation: [0, 0, 0],
  offset: [0, 0, 0],
});
expect(EVENT_MODEL_SPECS.wreckagePallet).toMatchObject({
  targetLongestDimension: 1.8,
  rotation: [0, 0, 0],
  offset: [0, 0, 0],
});

expect(EVENT_BUNDLE_SPECS.wreckage).toEqual({
  models: ['containerShip', 'wreckageBox', 'wreckageCrate', 'wreckagePallet'],
  sounds: ['diveEntry', 'underwaterMovement', 'diveSurface'],
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
npx vitest run tests/EventModelLibrary.test.ts tests/EventBundleManager.test.ts
```

Expected: FAIL because the three IDs and bundle entries do not exist.

- [ ] **Step 3: Register the approved Poly Pizza pages**

Add these entries to `POLY_PIZZA_EVENT_MODEL_PAGES`:

```js
wreckageBox: 'https://poly.pizza/m/ykZ23x9d6p',
wreckageCrate: 'https://poly.pizza/m/3VGWnZPXmG',
wreckagePallet: 'https://poly.pizza/m/cUAsYHDqfD',
```

Add conservative triangle limits:

```js
wreckageBox: 2_000,
wreckageCrate: 2_000,
wreckagePallet: 3_000,
```

Replace the nested committed-hash conditional with one frozen hash record. This keeps each model entry explicit.

- [ ] **Step 4: Discover, pin, fetch, and process the models**

Run:

```powershell
node scripts/poly-pizza-event-models.mjs --discover
node scripts/poly-pizza-event-models.mjs --write-lock
npm run models:fetch:events
```

The commands must report Box by Kay Lousberg, Crate by Quaternius, and Pallet by Quaternius. Each license must be CC0 1.0.

- [ ] **Step 5: Register the runtime model specs**

Add the three IDs to `EVENT_MODEL_IDS`. Add these presentation records:

```ts
wreckageBox: {
  targetLongestDimension: 0.9,
  rotation: [0, 0, 0],
  offset: [0, 0, 0],
  maxTriangles: 2_000,
},
wreckageCrate: {
  targetLongestDimension: 1.05,
  rotation: [0, 0, 0],
  offset: [0, 0, 0],
  maxTriangles: 2_000,
},
wreckagePallet: {
  targetLongestDimension: 1.8,
  rotation: [0, 0, 0],
  offset: [0, 0, 0],
  maxTriangles: 3_000,
},
```

Wire their generated metadata with `checkedMetadata`. Update the Wreckage bundle to use only the ship and these three models.

- [ ] **Step 6: Verify the asset pipeline and focused tests**

Run:

```powershell
npm run models:check:events
npx vitest run tests/EventModelLibrary.test.ts tests/EventBundleManager.test.ts
```

Expected: all checks PASS. Confirm `ATTRIBUTION.md` contains the three CC0 rows and exact source URLs.

- [ ] **Step 7: Commit the asset layer**

```powershell
git add scripts/poly-pizza-event-models.mjs scripts/event-model-lock.json src/assets/models/events/wreckageBox.glb src/assets/models/events/wreckageCrate.glb src/assets/models/events/wreckagePallet.glb src/assets/models/events/event-model-metadata.json src/assets/ATTRIBUTION.md src/survival/eventModelManifest.ts src/survival/eventBundleManifest.ts tests/EventModelLibrary.test.ts tests/EventBundleManager.test.ts
git commit -m "feat: add wreckage debris models"
```

### Task 2: Replace drifting-only focus UI with shared focus UI

**Files:**

- Modify: `src/survival/eventCatalog.ts`
- Modify: `src/survival/BoatInteraction.ts`
- Modify: `src/survival/FocusedEventPresentation.ts`
- Modify: `src/survival/BoatInteractionProjector.ts`
- Create: `src/ui/FocusedEventView.ts`
- Remove: `src/ui/DriftingItemView.ts`
- Modify: `src/ui/SurvivalUiViewModel.ts`
- Modify: `src/ui/SurvivalUI.ts`
- Modify: `src/ui/BoatAnchorView.ts`
- Modify: `src/styles/main.css`
- Test: `tests/BoatInteractionProjector.test.ts`
- Test: `tests/SurvivalUI.test.ts`

**Interfaces:**

- Produces: `InspectableEventId = DriftingItemEventId | 'wreckage'`.
- Produces: `FocusedEventChoiceView` with `instanceId: ItemInstanceId | null`.
- Produces: `FocusedEventChoiceSelection` and `FocusedEventFocusView`.
- Produces: `FocusedEventView.show(view)`, `hide()`, `updateTarget()`, and choice callbacks.
- Consumes: Existing `ProjectedBoatBounds` and result-paper CSS treatment.

- [ ] **Step 1: Write failing shared UI and projector tests**

Test a Wreckage focus target and an item-backed Dive button:

```ts
const target: FocusedEventInteractionTarget = {
  id: 'event:wreckage',
  label: 'WRECKAGE',
  description: 'Inspect the floating debris.',
  focusEventId: 'wreckage',
  root: wreckageDebris,
};

ui.showFocusedEvent({
  eventId: 'wreckage',
  target: { x: 850, y: 360, width: 180, height: 110, depth: 2, visible: true },
  choices: [{
    id: 'dive',
    label: 'Dive Into Wreck',
    unavailableReason: null,
    energyCost: 3,
    energyOwner: 'player',
    instanceId: 'scubaSet-1',
  }],
});
```

Assert the projected anchor has `eventFocusId: 'wreckage'`. Assert the paper uses `dive-result__paper`, shows three energy symbols, and emits the exact scuba instance ID.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
npx vitest run tests/BoatInteractionProjector.test.ts tests/SurvivalUI.test.ts
```

Expected: FAIL because shared focus types and methods do not exist.

- [ ] **Step 3: Add inspectable event and focus target contracts**

Add this union and guard to `eventCatalog.ts`:

```ts
export type InspectableEventId = DriftingItemEventId | 'wreckage';

export function isInspectableEventId(eventId: string): eventId is InspectableEventId {
  return eventId === 'wreckage' || isDriftingItemEventId(eventId);
}
```

Change `BoatInteractionAnchor.eventFocusId` to `InspectableEventId`.

Change `FocusedEventInteractionTarget` into an exact union. A target opens a choice or opens focus, never both:

```ts
export type FocusedEventInteractionTarget = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly root: Object3D;
  readonly tooltip?: boolean;
  readonly minimumHitWidth?: number;
  readonly minimumHitHeight?: number;
} & (
  | { readonly choiceId: string; readonly focusEventId?: never }
  | { readonly focusEventId: InspectableEventId; readonly choiceId?: never }
);
```

Update `BoatInteractionProjector.installFocusedInteractionTargets()` to assign `eventChoiceId` or `eventFocusId` from this union.

- [ ] **Step 4: Create the shared focused-event choice model**

Add this UI-only type:

```ts
export interface FocusedEventChoiceView extends EventContextChoice {
  readonly instanceId: ItemInstanceId | null;
}

export type FocusedEventChoiceSelection = Pick<
  FocusedEventChoiceView,
  'id' | 'instanceId'
>;

export interface FocusedEventFocusView {
  readonly eventId: InspectableEventId;
  readonly choices: readonly FocusedEventChoiceView[];
  readonly target: ProjectedBoatBounds | null;
}
```

Create `FocusedEventView.ts` from the current drifting view. Rename public CSS and DOM names from `drifting-item-focus` to `focused-event-view`.

Use this callback:

```ts
onChoice: (choice: Pick<FocusedEventChoiceView, 'id' | 'instanceId'>) => void;
```

Store the rendered choice objects by ID. Do not read an item ID from untrusted DOM text.

- [ ] **Step 5: Replace the old view in `SurvivalUI`**

Use these public methods and callbacks:

```ts
onFocusedEventSelect: ((eventId: InspectableEventId) => void) | null;
onFocusedEventChoice: ((choice: FocusedEventChoiceSelection) => void) | null;
onFocusedEventBack: (() => void) | null;

showFocusedEvent(view: FocusedEventFocusView): void;
hideFocusedEvent(): void;
updateFocusedEventTarget(target: ProjectedBoatBounds | null): void;
```

Delete the drifting-only methods and callbacks. Update modal focus registration and `playEventChoiceBeat()` to use the shared view.

- [ ] **Step 6: Rename the CSS selectors without aliases**

Rename `.drifting-item-focus*` selectors to `.focused-event-view*`. Keep the paper treatment and anchored placement values unchanged.

Do not retain old selectors.

- [ ] **Step 7: Run the focused tests**

Run:

```powershell
npx vitest run tests/BoatInteractionProjector.test.ts tests/SurvivalUI.test.ts
```

Expected: all focused UI and projector tests PASS.

- [ ] **Step 8: Commit the shared UI layer**

```powershell
git add src/survival/eventCatalog.ts src/survival/BoatInteraction.ts src/survival/FocusedEventPresentation.ts src/survival/BoatInteractionProjector.ts src/ui/FocusedEventView.ts src/ui/DriftingItemView.ts src/ui/SurvivalUiViewModel.ts src/ui/SurvivalUI.ts src/ui/BoatAnchorView.ts src/styles/main.css tests/BoatInteractionProjector.test.ts tests/SurvivalUI.test.ts
git commit -m "refactor: share focused event UI"
```

### Task 3: Generalize the focus camera and lifecycle flow

**Files:**

- Create: `src/survival/FocusedEventFlow.ts`
- Remove: `src/survival/DriftingItemFlow.ts`
- Modify: `src/survival/BoatCameraController.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/survival/SurvivalEventFlow.ts`
- Create: `tests/FocusedEventFlow.test.ts`
- Remove: `tests/DriftingItemFlow.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/SurvivalEventFlow.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`

**Interfaces:**

- Produces: `FocusedEventFlow.enter()`, `choose()`, `back()`, `syncTarget()`, `clear()`, and `settleForVisibilityChange()`.
- Produces: `FocusedEventChoiceResolution` with event-owned animation and return hooks.
- Consumes: `InspectableEventId`, `FocusedEventChoiceView`, and shared UI methods from Task 2.

- [ ] **Step 1: Port the current flow tests under shared names**

Create `FocusedEventFlow.test.ts`. Keep all lifecycle, repeated-entry, cancellation, visibility, and cleanup tests.

Add Wreckage coverage with this resolution contract:

```ts
export type FocusedEventChoiceResolution =
  | { readonly accepted: false }
  | {
      readonly accepted: true;
      readonly playAnimation: () => Promise<void>;
      readonly afterAnimation: () => Promise<void>;
      readonly beforeReturn: () => Promise<void>;
      readonly afterReturn: () => Promise<void>;
      readonly clearEvent: () => void;
      readonly renderSnapshot: () => boolean;
      readonly presentTerminal: () => void;
    };
```

Assert this exact order:

```ts
expect(calls).toEqual([
  'confirm',
  'event-resolving',
  'busy',
  'beat:dive',
  'resolve:dive:scubaSet-1',
  'hide-focus',
  'animate',
  'after-animation',
  'before-return',
  'exit',
  'clear-event',
  'render',
  'after-return',
  'ready',
  'restore-focus',
]);
```

- [ ] **Step 2: Run the focused flow tests and confirm failure**

Run:

```powershell
npx vitest run tests/FocusedEventFlow.test.ts tests/BoatWorld.test.ts tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts
```

Expected: FAIL because `FocusedEventFlow` and shared world methods do not exist.

- [ ] **Step 3: Create `FocusedEventFlow`**

Port the operation-generation, pending-event, visibility, cleanup, target-sync, and focus-state logic from `DriftingItemFlow`.

Use this choice input:

```ts
import type { FocusedEventChoiceSelection } from '../ui/SurvivalUiViewModel';
```

Remove hard-coded `retrieve`, `delegate-carlitos`, and `sleep` checks. Accept a choice only when its ID and instance ID match the current rendered choice.

Use `resolution.playAnimation()` instead of world-specific branches.

Call `afterAnimation()` before the return starts. Drifting Loot uses this hook for its current reward timing. Wreckage uses a no-op.

- [ ] **Step 4: Rename the camera methods and state**

Rename these methods without wrappers:

```ts
beginFocusedEventView(target: Object3D): Promise<void>;
endFocusedEventView(): Promise<void>;
cancelFocusedEventView(): void;
updateFocusedEventView(delta: number, target: Object3D | null): void;
applyFocusedEventView(target: Object3D | null): void;
requiresFocusedEventTarget(): boolean;
```

Rename private drifting camera state to focused camera state. Keep duration, front-right position, easing, and target tracking unchanged.

- [ ] **Step 5: Generalize the world focus methods**

Replace `enterDriftingItemView()` and `exitDriftingItemView()` with:

```ts
enterFocusedEventView(eventId: InspectableEventId): Promise<void> {
  if (this.disposed || this.eventPresentationHost.activeEventId() !== eventId) {
    return Promise.resolve();
  }
  const target = this.eventPresentationHost.itemAimTarget();
  return target === null
    ? Promise.resolve()
    : this.cameraController.beginFocusedEventView(target);
}

exitFocusedEventView(): Promise<void> {
  return this.disposed
    ? Promise.resolve()
    : this.cameraController.endFocusedEventView();
}
```

Use the shared method names in update, paused rendering, clear, and visibility paths.

- [ ] **Step 6: Wire the shared flow through phase and event flow**

Replace the drifting flow dependency with `focused: EventFocusedEventPort`.

Rename `focusDriftingItem()` to `focusEvent(eventId: InspectableEventId)`.

Wire `SurvivalUI.onFocusedEventSelect`, `onFocusedEventChoice`, and `onFocusedEventBack` to the shared flow.

Keep Drifting Loot resolution behavior inside `SurvivalEventFlow`. Return its current retrieve, Carlitos, and recede animations as `playAnimation` callbacks.

- [ ] **Step 7: Run focused flow regressions**

Run:

```powershell
npx vitest run tests/FocusedEventFlow.test.ts tests/BoatWorld.test.ts tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts tests/SurvivalUI.test.ts
```

Expected: all tests PASS. Drifting Loot must keep its existing camera and reward behavior.

- [ ] **Step 8: Commit the shared flow layer**

```powershell
git add src/survival/FocusedEventFlow.ts src/survival/DriftingItemFlow.ts src/survival/BoatCameraController.ts src/survival/BoatWorld.ts src/survival/SurvivalPhase.ts src/survival/SurvivalEventFlow.ts tests/FocusedEventFlow.test.ts tests/DriftingItemFlow.test.ts tests/BoatWorld.test.ts tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts
git commit -m "refactor: share focused event flow"
```

### Task 4: Rebuild the Wreckage surface presentation

**Files:**

- Modify: `src/survival/eventPresentationTypes.ts`
- Modify: `src/survival/EventPresentationCoordinator.ts`
- Modify: `src/survival/eventPresentationAdapters.ts`
- Modify: `src/survival/events/wreckageChoreography.ts`
- Modify: `src/survival/events/WreckagePresentation.ts`
- Test: `tests/EventPresentationRegistry.test.ts`
- Test: `tests/WreckagePresentation.test.ts`

**Interfaces:**

- Produces: One dedicated focus target named `event:wreckage` rooted at the complete debris group.
- Produces: Eight independently floating surface objects.
- Consumes: `wreckageBox`, `wreckageCrate`, and `wreckagePallet` from Task 1.

- [ ] **Step 1: Replace old presentation tests with approved behavior tests**

Delete tests for search pull, injury flash, loot glow, silt collapse, anglerfish, ghost, recovered debris, and imported leak planks.

Add tests for:

```ts
expect(created).toEqual([
  'containerShip',
  'wreckageBox',
  'wreckageCrate',
  'wreckagePallet',
]);
expect(debris.children).toHaveLength(8);
expect(debris.children.every((child) => child.position.x > 0)).toBe(true);
expect(new Box3().setFromObject(wreck).max.y).toBeLessThan(-0.5);
expect(presentation.interactionTargets()).toEqual([
  expect.objectContaining({
    id: 'event:wreckage',
    focusEventId: 'wreckage',
    root: debris,
  }),
]);
expect(presentation.interactionRoot('event:wreckage')).toBe(debris);
```

Spy on plank geometry and materials. Assert five planks share the same geometry and material array.

- [ ] **Step 2: Run Wreckage and registry tests and confirm failure**

Run:

```powershell
npx vitest run tests/WreckagePresentation.test.ts tests/EventPresentationRegistry.test.ts
```

Expected: FAIL because dedicated presentations do not publish focus targets and the old debris remains.

- [ ] **Step 3: Forward dedicated interaction data**

Add optional methods to `DedicatedEventPresentation`:

```ts
interactionTargets?(): readonly FocusedEventInteractionTarget[];
interactionRoot?(id: string): Object3D | null;
```

Forward them through `EventPresentationCoordinator`. Use the coordinator methods in `createDedicatedAdapter`.

Return an empty frozen list and `null` when a dedicated presentation does not supply them.

- [ ] **Step 4: Create one procedural plank resource**

Create one indexed `BufferGeometry` outside the frame loop. Use a shallow irregular prism with uneven ends.

Use two material groups:

```ts
const plankTopMaterial = new MeshStandardMaterial({
  color: 0x8a5a35,
  roughness: 0.92,
  metalness: 0,
  flatShading: true,
});
const plankSideMaterial = new MeshStandardMaterial({
  color: 0x5f3a24,
  roughness: 0.96,
  metalness: 0,
  flatShading: true,
});
```

Create five meshes from the same geometry and material array. Vary scale, yaw, and roll through authored transforms.

- [ ] **Step 5: Author the starboard debris layout**

Use these base positions:

```ts
const SURFACE_DEBRIS = Object.freeze([
  { kind: 'box',    x: 2.65, y: 0.04, z: -4.10, yaw:  0.34, scale: 0.82 },
  { kind: 'crate',  x: 4.15, y: 0.07, z: -5.25, yaw: -0.46, scale: 0.88 },
  { kind: 'pallet', x: 5.55, y: 0.02, z: -6.75, yaw:  0.72, scale: 0.92 },
  { kind: 'plank',  x: 3.05, y: 0.10, z: -5.65, yaw:  0.18, scale: 0.95 },
  { kind: 'plank',  x: 4.85, y: 0.06, z: -7.55, yaw: -0.62, scale: 0.78 },
  { kind: 'plank',  x: 2.75, y: 0.08, z: -7.95, yaw:  1.02, scale: 0.70 },
  { kind: 'plank',  x: 5.95, y: 0.03, z: -8.65, yaw: -0.20, scale: 0.62 },
  { kind: 'plank',  x: 3.95, y: 0.12, z: -9.20, yaw:  0.58, scale: 0.56 },
] as const);
```

Use deterministic phase `time * 0.9 + index * 1.47 + seedOffset * 0.23`. Update existing objects in place.

- [ ] **Step 6: Remove obsolete Wreckage actors and beats**

Keep only reveal, surface hold, leave, and underwater visibility state. Remove search motion, injury flash, recovered debris, barrel, silt, anglerfish, ghost, and their owned resources.

Make `react()` resolve without a Wreckage result animation.

Place the ship at `(0, -7.2, -11.5)`. Its complete world bounds must stay below `y = -0.5` after rotation.

- [ ] **Step 7: Publish the Wreckage focus target**

Return one frozen target:

```ts
{
  id: 'event:wreckage',
  label: 'WRECKAGE',
  description: 'Inspect the floating debris.',
  focusEventId: 'wreckage',
  root: this.debris,
  tooltip: false,
  minimumHitWidth: 96,
  minimumHitHeight: 72,
}
```

Set `itemAimTarget` to the debris center. Keep the ship hidden during reveal and focus.

- [ ] **Step 8: Run focused presentation tests**

Run:

```powershell
npx vitest run tests/WreckagePresentation.test.ts tests/EventPresentationRegistry.test.ts tests/BoatInteractionProjector.test.ts tests/EventBundleManager.test.ts
```

Expected: all tests PASS.

- [ ] **Step 9: Commit the rebuilt surface presentation**

```powershell
git add src/survival/eventPresentationTypes.ts src/survival/EventPresentationCoordinator.ts src/survival/eventPresentationAdapters.ts src/survival/events/wreckageChoreography.ts src/survival/events/WreckagePresentation.ts tests/EventPresentationRegistry.test.ts tests/WreckagePresentation.test.ts
git commit -m "feat: rebuild wreckage debris field"
```

### Task 5: Extend the normal dive with a post-entry wreck hold

**Files:**

- Modify: `src/survival/DivePresentation.ts`
- Modify: `src/survival/DivePresentationController.ts`
- Modify: `src/survival/SurvivalDayActionFlow.ts`
- Modify: `src/survival/events/WreckagePresentation.ts`
- Test: `tests/DivePresentationController.test.ts`
- Test: `tests/BoatWorld.test.ts`
- Test: `tests/WreckagePresentation.test.ts`

**Interfaces:**

- Produces: Optional `DivePostEntryHold` in `DivePlayOptions`.
- Consumes: Existing `sampleDivePose()` and `DIVE_ENTRY_DURATION_SECONDS` without changes.

- [ ] **Step 1: Write failing dive hold tests**

Use this option contract:

```ts
export interface DivePostEntryHold {
  readonly durationSeconds: number;
  readonly cameraWorldPosition: Readonly<Vector3>;
  readonly cameraWorldTarget: Readonly<Vector3>;
  readonly onStart: () => void;
}

export interface DivePlayOptions {
  readonly onWaterImpact: () => void;
  readonly postEntryHold?: DivePostEntryHold;
}
```

Test these times:

```ts
controller.update(0, 5.79);
expect(onStart).not.toHaveBeenCalled();

controller.update(0, 0.01);
expect(onStart).toHaveBeenCalledOnce();
expect(diveSettled).toBe(false);

controller.update(0, 2.99);
expect(diveSettled).toBe(false);

controller.update(0, 0.01);
await dive;
expect(diveSettled).toBe(true);
```

Also keep a no-hold test that resolves at exactly 5.8 seconds.

- [ ] **Step 2: Run dive tests and confirm failure**

Run:

```powershell
npx vitest run tests/DivePresentationController.test.ts tests/WreckagePresentation.test.ts tests/BoatWorld.test.ts
```

Expected: FAIL because `postEntryHold` does not exist.

- [ ] **Step 3: Implement the hold state without changing entry sampling**

Track `entryElapsed`, `holdElapsed`, and `holdStarted` in `DivePresentation`.

During entry, keep this call unchanged:

```ts
sampleDivePose(Math.min(entryElapsed, DIVE_ENTRY_DURATION_SECONDS), this.pose);
```

When entry reaches 5.8 seconds:

1. Resolve immediately when no hold exists.
2. Call `onStart()` once when a hold exists.
3. Hide goggles, water veil, and bubbles.
4. Convert `cameraWorldPosition` into the camera parent's local space.
5. Point the camera at `cameraWorldTarget`.
6. Hold the exact pose for `durationSeconds`.
7. Resolve after the hold ends.

Do not call `sampleDivePose()` with hold time.

- [ ] **Step 4: Remove the obsolete mixed reveal option**

Delete `revealUnderwaterScene` from the option, presentation state, veil calculation, day action call sites, and tests.

The standard day dive passes only `onWaterImpact`.

- [ ] **Step 5: Configure Wreckage's three-second shot**

Use stable world-space values:

```ts
const WRECK_CAMERA_POSITION = new Vector3(4.2, -3.4, -4.3);
const WRECK_CAMERA_TARGET = new Vector3(0, -7.2, -11.5);
```

Pass:

```ts
postEntryHold: {
  durationSeconds: 3,
  cameraWorldPosition: WRECK_CAMERA_POSITION,
  cameraWorldTarget: WRECK_CAMERA_TARGET,
  onStart: () => this.showUnderwaterWreck(),
},
```

`showUnderwaterWreck()` hides the surface debris and shows only the submerged ship.

- [ ] **Step 6: Verify camera, item, cancellation, and visibility cleanup**

Add tests for clear, replacement, disposal, hidden document, and `onStart()` failure.

Each path must restore the captured camera and selected scuba item once. Keep the first error after cleanup.

- [ ] **Step 7: Run focused dive tests**

Run:

```powershell
npx vitest run tests/DivePresentationController.test.ts tests/WreckagePresentation.test.ts tests/BoatWorld.test.ts tests/SurvivalDayActionFlow.test.ts
```

Expected: all tests PASS. The standard dive snapshots must remain unchanged through 5.8 seconds.

- [ ] **Step 8: Commit the dive extension**

```powershell
git add src/survival/DivePresentation.ts src/survival/DivePresentationController.ts src/survival/SurvivalDayActionFlow.ts src/survival/events/WreckagePresentation.ts tests/DivePresentationController.test.ts tests/WreckagePresentation.test.ts tests/BoatWorld.test.ts tests/SurvivalDayActionFlow.test.ts
git commit -m "feat: add wreckage dive hold"
```

### Task 6: Resolve Wreckage choices and show the result after return

**Files:**

- Modify: `src/survival/SurvivalSession.ts`
- Modify: `src/survival/SurvivalEventFlow.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/ui/SurvivalCoverViewModel.ts`
- Modify: `src/survival/events/WreckagePresentation.ts`
- Modify: `tests/SurvivalSession.test.ts`
- Modify: `tests/SurvivalEventFlow.test.ts`
- Modify: `tests/SurvivalPhase.test.ts`
- Modify: `tests/BoatWorld.test.ts`
- Modify: `tests/AudioSystem.test.ts`

**Interfaces:**

- Produces: Four focused Wreckage choices, including one item-backed Dive choice.
- Produces: Wreckage reward summaries for resource and item gains.
- Produces: `RewardResultView` title `WRECKAGE`.
- Consumes: Shared focus resolution hooks from Task 3 and dive hold from Task 5.

- [ ] **Step 1: Write failing choice and result-order tests**

Build these exact focused choices:

```ts
[
  { id: 'search', label: 'Search Debris', energyCost: 2, instanceId: null },
  { id: 'delegate-carlitos', label: 'Send Carlitos', energyCost: 3, instanceId: null },
  { id: 'dive', label: 'Dive Into Wreck', energyCost: 3, instanceId: 'scubaSet-1' },
  { id: 'leave', label: 'Leave', instanceId: null },
]
```

Test missing energy, missing scuba, broken scuba, hidden Carlitos, and unavailable Carlitos reasons.

For Search, assert no presentation animation occurs before `beforeReturn`.

For Dive, assert the exact instance ID reaches `playEventItemUse`.

For Search, Carlitos, and Dive, assert this order:

```ts
expect(calls).toEqual(expect.arrayContaining([
  'action-complete',
  'cover:true',
  'exit-focus',
  'clear-event',
  'render-default',
  'settle-covered',
  'cover:false',
  'show-result',
]));
```

For Leave, assert no result paper and no energy change.

- [ ] **Step 2: Run focused event and session tests and confirm failure**

Run:

```powershell
npx vitest run tests/SurvivalSession.test.ts tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts tests/BoatWorld.test.ts
```

Expected: FAIL because Wreckage does not use shared focus and emits no reward summary.

- [ ] **Step 3: Build all focused Wreckage choices**

Add a pure `focusedChoicesFor(event, snapshot)` helper in `SurvivalEventFlow`.

For item choices, select the first sorted usable instance of the required item. Keep the button visible when no instance exists. Set `instanceId: null` and add `Requires usable scuba gear.` to its unavailable reason.

Combine item requirements, player energy, and Carlitos availability. Keep item-backed choices out of the boat supply anchors while focus is open.

- [ ] **Step 4: Generalize event reward summaries**

Rename `driftingItemRewardSummary()` to `eventRewardSummary()`.

Keep current Drifting Loot behavior. Add Wreckage for `search`, `delegate-carlitos`, and `dive`.

Return resource summaries for added food, bait, or repair material. Return the gained item ID for Wreckage item mutations. Return fallback food when the item slot is occupied. Return `undefined` for damage, pressure, empty, and leave outcomes.

- [ ] **Step 5: Implement event-owned focused animations**

Return these `playAnimation` callbacks:

```ts
search: async () => undefined,
delegateCarlitos: () => world.playEventChoice('wreckage', 'delegate-carlitos'),
dive: () => world.playEventItemUse('wreckage', 'dive', scubaInstanceId),
leave: () => world.playEventChoice('wreckage', 'leave'),
```

Start normal dive audio before Dive. Finish or cancel it through existing dive cleanup paths.

Do not call `reactToEventOutcome()` for an underwater Wreckage result animation.

- [ ] **Step 6: Add covered return hooks and result formatting**

For Wreckage, use:

```ts
beforeReturn: () => ui.setSleepCovered(true),
afterReturn: async () => {
  await renderAndSettleCoveredScene(generation);
  await ui.setSleepCovered(false);
  if (choiceId !== 'leave' && !terminal) {
    await ui.showRewardResult({
      title: 'WRECKAGE',
      reward: outcome.rewardSummary ?? null,
      lines: outcome.rewardSummary === undefined ? [outcome.message] : [],
    });
  }
},
```

Add a second line `Your scuba gear broke.` when the selected scuba condition changes from usable to broken.

Add `WRECKAGE` to `RewardResultView.title`.

- [ ] **Step 7: Remove old Wreckage result audio and reaction tests**

Keep dive entry, underwater movement, surface, cancel, and clear coverage.

Delete tests that expect loot, collapse, creature, or ghost reaction audio after the underwater hold.

- [ ] **Step 8: Run focused integration tests**

Run:

```powershell
npx vitest run tests/FocusedEventFlow.test.ts tests/SurvivalSession.test.ts tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts tests/BoatWorld.test.ts tests/WreckagePresentation.test.ts tests/AudioSystem.test.ts
```

Expected: all tests PASS.

- [ ] **Step 9: Commit the complete Wreckage flow**

```powershell
git add src/survival/SurvivalSession.ts src/survival/SurvivalEventFlow.ts src/survival/SurvivalPhase.ts src/survival/BoatWorld.ts src/ui/SurvivalCoverViewModel.ts src/survival/events/WreckagePresentation.ts tests/SurvivalSession.test.ts tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts tests/BoatWorld.test.ts tests/AudioSystem.test.ts
git commit -m "feat: focus and resolve wreckage event"
```

### Task 7: Verify cleanup, regressions, build, and visual result

**Files:**

- Modify only files with failing Wreckage or shared-focus verification.
- Test: all affected tests.

**Interfaces:**

- Consumes: All prior task interfaces.
- Produces: A tested production build and browser-verified Wreckage flow.

- [ ] **Step 1: Run formatting and static checks**

Run:

```powershell
git diff --check
npm run typecheck
npm run models:check:events
```

Expected: all commands PASS.

- [ ] **Step 2: Run the focused regression set**

Run:

```powershell
npx vitest run tests/EventModelLibrary.test.ts tests/EventBundleManager.test.ts tests/BoatInteractionProjector.test.ts tests/FocusedEventFlow.test.ts tests/SurvivalUI.test.ts tests/DivePresentationController.test.ts tests/WreckagePresentation.test.ts tests/SurvivalSession.test.ts tests/SurvivalEventFlow.test.ts tests/SurvivalPhase.test.ts tests/BoatWorld.test.ts tests/AudioSystem.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Run the full suite and production build**

Run:

```powershell
npm test
npm run build
```

Expected: full suite and production build PASS.

- [ ] **Step 4: Test the complete flow in the local browser**

Open `http://127.0.0.1:5176/dont-sleep-with-the-fishes/`.

Verify:

1. Wreckage debris appears only beside the starboard scuba area.
2. The eight pieces stay separated and float at the waterline.
3. The wreck is not visible before Dive.
4. Clicking debris moves the camera before the paper appears.
5. The paper matches Drifting Loot and anchors beside the debris.
6. Search costs two energy and works without scuba.
7. Carlitos costs three energy.
8. Dive costs three energy and uses usable scuba.
9. The normal scuba animation has no above-water clipping.
10. The camera then shows only the underwater wreck for three seconds.
11. The default boat view returns before the Wreckage result paper.
12. Search, Carlitos, Dive, and Leave each follow the approved result behavior.

- [ ] **Step 5: Fix only verified defects and rerun their tests**

For each defect, add or strengthen one failing test before changing code. Rerun that test, the focused set, and the build.

- [ ] **Step 6: Commit verification fixes when needed**

```powershell
git add --patch
git commit -m "fix: polish wreckage inspection flow"
```

Skip this commit when no verification defect exists.

- [ ] **Step 7: Record final evidence**

Capture the exact passing test count, build result, model check result, and browser observations in the implementation handoff.
