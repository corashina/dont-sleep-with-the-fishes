# Test pruning: 2026-09-22

Removed exactly 200 executable test cases. The suite decreased from 1,338 to 1,138 cases.
Test files decreased from 171 to 163. No tests were added, skipped, or disabled.
Discovery settings and application code were not changed by this task.

## Selection

Ranked cases by their additional regression value relative to retained coverage.
This is a maintenance judgment, not a coverage or mutation-testing result.

Priority for removal:

1. Duplicate cases and combinations that exercise the same shared path.
2. Extra numeric, item, seed, and mirrored-position variants.
3. Helper checks covered by retained integration tests.
4. Developer preview checks and narrow display-copy assertions.
5. A shader check that translated source text and compared it with an old implementation.

Retained Heart of the Sea collection, reward UI, save progress, and Kraken ending tests.
Retained representative save validation, gameplay transitions, cancellation, resource ownership, and keyboard interaction tests.
The reduced suite no longer checks every removed item, input, or data variant separately.

## Removed cases by file

Counts include expanded parameterized cases. Reasons describe the removed groups and retained coverage.

| Test file | Removed | Reason |
| --- | ---: | --- |
| AmbientOcclusionQuality.test.ts | 1 | The SystemTuningPreference and SettingsMenu tests cover saved AO settings and application. |
| AnchorItem.test.ts | 2 | Keep anchor-specific drop placement; generic item return and trade tests cover other contexts. |
| BrowserPlaytest.test.ts | 9 | Remove developer-only malformed-query permutations; retain the production isolation check. |
| CarlitosState.test.ts | 8 | Remove repeated data variants; retain representative cases for this behavior. Retain long-run neglect bounds and care recovery; remove separate need permutations. Remove helper checks covered by retained session and UI integration tests. |
| CarlitosSurvival.test.ts | 4 | Remove repeated data variants; retain representative cases for this behavior. Keep invalid rest and care bounds; remove two malformed rest variants. |
| CloudImpostorLayout.test.ts | 1 | Remove a shader-to-JavaScript translation compared with a copied old implementation; retain geometry and shadow invariants. |
| collisions.test.ts | 6 | Keep bow/stern and both signs without all mirrored combinations. Full connected-room and exterior-circuit tests retain both sides. Remove repeated data variants; retain representative cases for this behavior. Remove ordering of two non-intersecting arc obstacles. Keep side and front axes; remove mirrored side window. |
| ConsumedItemReturn.test.ts | 18 | Remove repeated data variants; retain representative cases for this behavior. Keep one lab recovery path and all three consumed item types in the scene-cleanup test. |
| DayActionRules.test.ts | 8 | Session integration covers action gates, resource limits, optional loot, and required events. This file also repeats an identical supplies case. |
| DiveItems.test.ts | 4 | Calm and overcast use the same reward path. Retain a full save round trip and separate food/bait resource tests. Consumed slot reuse remains covered by survivalInventory. |
| DriftingLoot.test.ts | 3 | Retain all four supply kinds in DriftingSupplies session integration. |
| EerieMelodyPresentation.test.ts | 1 | Health delta does not affect fog lifecycle. |
| EndingStatistics.test.ts | 2 | Shared statistics panel; retain one navigation test and dedicated ending UI tests. |
| EventBundleManager.test.ts | 6 | Keep missing-model and missing-animation failures; remove asset-name permutations. |
| EventChoiceDismissal.test.ts | 18 | Keep click, Enter, and Space for one confirmation event; remove the event/choice Cartesian product. Keep all three input methods on chest retrieval; focused supplies use the same popup. |
| EventDepartureFade.test.ts | 1 | Remove repeated data variants; retain representative cases for this behavior. |
| EventPlayerOptions.test.ts | 3 | These choices are deterministic; a second random value repeats the same rule. |
| EventTest.test.ts | 3 | Remove developer preview stock and catalog-equality checks; retain real trade tests and item-lab heart tests. |
| FishingBackpack.test.ts | 2 | Keep one reward transaction; resource rewards remain covered by fishing and inventory tests. |
| FishingSession.test.ts | 2 | Keep non-positive and non-finite multiplier classes. |
| FixedStepClock.test.ts | 2 | Keep non-finite and negative delta classes alongside partial-frame behavior. |
| FogWeather.test.ts | 1 | Keep visibility limits once; phase/weather transitions retain integration tests. |
| FrozenPlaytest.test.ts | 6 | Remove repeated developer-server rebuild fixtures; retain static build, build-time integrity, and no-overwrite checks. Remove the polling variant of developer-server integrity checks. |
| GhostShipEvent.test.ts | 1 | Keep reusable and consumed signals; shotgun repeats the consumed branch. |
| GuideDescription.test.ts | 1 | Remove exact keyword-highlighting expectations for guide copy. |
| interaction.test.ts | 3 | Keep one open-shape pickup proxy; remove repeated item IDs. |
| ItemConditionAppearance.test.ts | 8 | Keep the two model-specific assertions and generic geometry ownership/repair; remove eight repetitions. |
| ItemRewards.test.ts | 3 | Owned reward filtering, full inventory, and weighted boundaries remain covered by chest, dive, trading, and inventory tests. |
| LighthouseEvent.test.ts | 1 | Keep reusable and consumed signal costs; remove the third authored constant. |
| menuLanguage.test.ts | 1 | Remove pointer-lock error copy translation detail; retain pointer-lock retry and gameplay language tests. |
| NetAttackPose.test.ts | 1 | Keep one side; remove the mirrored animation sample. |
| NetRestClearance.test.ts | 2 | Keep the rotated wave pose; remove two rigid-transform variants. |
| OceanOfBlood.test.ts | 4 | Duplicate shared event validator checks retained in survivalEvents. |
| OptionalLootDayActions.test.ts | 2 | Retain the complete chest sequence; supplies remain covered by session and phase tests. |
| OptionalLootUI.test.ts | 3 | Retain all three shared optional-loot UI behaviors once. |
| PlayerController.test.ts | 5 | Production layout routes remain covered in collisions and ShipNavigation. Keep unbounded yaw regression; remove mirrored direction. |
| QualityLanguage.test.ts | 1 | Remove quality-control label detail checks; retain live language lifecycle tests and settings application. |
| RunStatistics.test.ts | 2 | Keep missing, malformed numeric, wrong starting day, and duplicate-day history. |
| ScavengePhysics.test.ts | 2 | Keep both axes and signs without all mirrored boundary combinations. |
| ScavengeSession.test.ts | 3 | Keep single and bundle cache invalidation; all mutation methods retain blocked-state and transition tests. |
| SchoolOfFishBinoculars.test.ts | 2 | Remove repeated data variants; retain representative cases for this behavior. |
| SomethingUnderUs.test.ts | 4 | Keep event journaling once; eventTranslations retains complete multilingual catalog checks. Keep normal cost and minimum-energy clamp; remove the middle hunger value. Keep item and sleep exits; food uses the same diversion exit as bait. |
| SurvivalEndingPreview.test.ts | 2 | Shared developer preview transaction; retain one checkpoint-preservation test. |
| SurvivalEventFlow.test.ts | 6 | Retain orchestration once; item costs and event variants retain dedicated rule tests. |
| survivalEvents.test.ts | 3 | Keep out-of-range and non-integer rejection classes. Explicit undefined repeats the non-array guard. |
| SurvivalPhase.test.ts | 13 | Reduce the disposal/restart matrix; both cancellation modes remain covered across async boundaries. Keep every await boundary, with both disposal and restart represented. Keep held-item and dedicated-animation visibility paths; remove extra item/event pairings. Keep day and night choice restoration; remove the second night fixture. |
| SurvivalSaveStore.test.ts | 4 | Retain structural save validation; remove four authored display-text mismatch cases. |
| SurvivalSession.test.ts | 8 | The RNG and save contract does not depend on the starting hunger value. Keep absent and exhausted blockers; successful delegation and care rules have separate tests. Keep full repair, near-full clamp, and energy-limited repair; remove intermediate numeric variants. Keep rescued and dead terminal guards; sinking ending tests retain its lifecycle. |
| SurvivalUI.test.ts | 2 | The integration tests retain both rest-state messages; keep one disabled UI case. Keep the shared broken-item UI path once. |
| WaterQuality.test.ts | 1 | Simple preference wiring; retain SettingsMenu quality application and OceanOfBlood quality-switch regressions. |
| world.test.ts | 1 | The double-dispose test also includes the first disposal. |
| **Total** | **200** | |

## Verification

- Compared Vitest discovery results as multisets of file paths and expanded case names.
- Found 200 removed cases and zero added cases.
- Full Vitest run: 163 files passed; 1,138 cases passed.
- TypeScript: passed with no errors.
- ESLint: passed with no warnings.
- Git whitespace check: passed.

Existing application and test edits from earlier work were preserved.
