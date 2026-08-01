# Test importance review

This review rates each test file. Tests in one file share one rating.

## Rating rules

- 5: Protects core rules, state, lifecycle, or deterministic simulation.
- 4: Protects input, physics, startup, ownership, or important system behavior.
- 3: Protects replaceable presentation, choreography, or cue routing.
- 2: Protects asset metadata, exact styling, or small formatting behavior.
- 1: Protects one cosmetic constant.

Files rated 1 through 3 were removed after this review.

## Rating 5

- `BoatBuoyancy.test.ts`
- `collisions.test.ts`
- `eventResolver.test.ts`
- `FishingCatalog.test.ts`
- `FishingSession.test.ts`
- `FixedStepClock.test.ts`
- `GameConstruction.test.ts`
- `GameDirector.test.ts`
- `GameLifecycle.test.ts`
- `InputController.test.ts`
- `interaction.test.ts`
- `LadderTraversal.test.ts`
- `launchGame.test.ts`
- `PlayerController.test.ts`
- `RunPressure.test.ts`
- `scavengeDeposit.test.ts`
- `scavengeEnding.test.ts`
- `ScavengePhysics.test.ts`
- `ScavengeSession.test.ts`
- `ShipLayout.test.ts`
- `sinking.test.ts`
- `survivalEvents.test.ts`
- `survivalInventory.test.ts`
- `SurvivalPhase.test.ts`
- `SurvivalSession.test.ts`
- `SurvivalUI.test.ts`
- `WaterExclusion.test.ts`
- `WaveField.test.ts`
- `world.test.ts`

## Rating 4

- `audioPreference.test.ts`
- `AudioSystem.test.ts`
- `BoatInteraction.test.ts`
- `BoatWorld.test.ts`
- `chest.test.ts`
- `EventModelLibrary.test.ts`
- `EventPhysicalResponse.test.ts`
- `EventPresentationCoordinator.test.ts`
- `eventPresentationOutcome.test.ts`
- `GameLoop.test.ts`
- `OceanRenderer.test.ts`
- `PhysicsRuntime.test.ts`
- `PropModelLibraryTextures.test.ts`
- `scavengeCatalog.test.ts`
- `scavengeRules.test.ts`
- `SceneResources.test.ts`
- `ShipItemPlacement.test.ts`
- `SurvivalEventModelLibrary.test.ts`
- `SystemScreen.test.ts`

## Rating 3 — removed

- `anglerfishSwarmChoreography.test.ts`
- `AnglerfishSwarmPresentation.test.ts`
- `audioManifest.test.ts`
- `ChestAttackPresentation.test.ts`
- `DangerousWatersPresentation.test.ts`
- `deathStareChoreography.test.ts`
- `DeathStarePresentation.test.ts`
- `FeaturedEventPresentations.test.ts`
- `HandymanPresentation.test.ts`
- `leakChoreography.test.ts`
- `LeakPresentation.test.ts`
- `MidnightTourPresentation.test.ts`
- `NightTraderPresentation.test.ts`
- `OtherPeoplePresentation.test.ts`
- `ScavengeAudio.test.ts`
- `schoolOfFishChoreography.test.ts`
- `SchoolOfFishPresentation.test.ts`
- `SkyboxMoonFace.test.ts`
- `snatcherChoreography.test.ts`
- `SnatcherPresentation.test.ts`
- `SupernaturalEventAnimator.test.ts`
- `supernaturalEventChoreography.test.ts`
- `SurvivalAudio.test.ts`
- `SurvivalPhaseAudio.test.ts`
- `WeatherEffectsAudio.test.ts`
- `WeatherEventAnimator.test.ts`
- `weatherEventChoreography.test.ts`
- `whirlpoolChoreography.test.ts`
- `WhirlpoolPresentation.test.ts`

## Rating 2 — removed

- `checkEventModels.test.ts`
- `eventModels.test.ts`
- `PostProcessingConsoleAudio.test.ts`
- `survivalJournal.test.ts`

## Rating 1 — removed

- `ItemAmbientOcclusion.test.ts`
