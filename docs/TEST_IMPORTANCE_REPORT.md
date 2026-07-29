# Test importance report

Each test file has one importance rating.

- 5 protects core rules and state.
- 4 protects key flows and integration.
- 3 protects support behavior.
- 2 protects presentation or narrow contracts.
- 1 protects minor details or developer tools.

## 100 least useful tests

Rank 1 is least useful. A low rank does not mean that deletion is safe.

Ranks 1–21 were deleted on 2026-07-29. Their entries remain as an audit record.

Ranks 22–100 were deleted with all rating-2 files on 2026-07-29.

1. `PostProcessingConsole.test.ts` — groups event test scenes and enters only after explicit activation
2. `PostProcessingConsole.test.ts` — presents catalog weather in order and distinguishes effective from forced weather
3. `PostProcessingConsole.test.ts` — toggles with Backquote and routes controls without retaining listeners
4. `PerformanceStats.test.ts` — only records frames while visible and can be toggled at runtime
5. `itemThumbnailManifest.test.ts` — maps every scavenging item to one PNG asset
6. `PolyPizzaFishingModels.test.ts` — pins each selected source once and excludes non-matching submissions
7. `PolyPizzaFishingModels.test.ts` — keeps source identity, license, and geometry budgets pinned
8. `PolyPizzaFishingModels.test.ts` — matches runtime scale to existing food and catch size
9. `CaptainWhiskersModel.test.ts` — uses the lightweight Stripe model without viewer presentation nodes
10. `CaptainWhiskersModel.test.ts` — contains the required restrained idle animation
11. `Lifeboat.test.ts` — mounts the paddles lengthwise and rolled without side waterline strips
12. `Lifeboat.test.ts` — keeps the three seats and adds one bow-side display bench
13. `ShipRigging.test.ts` — builds one central mast with two distinct furled sails
14. `ShipRigging.test.ts` — binds each compact cloth roll with irregular rope ties
15. `ShipRigging.test.ts` — keeps every rolled sail vertex above cloth clearance with a narrow profile
16. `ShipRigging.test.ts` — keeps both furled sails settled against their ties
17. `ShipRigging.test.ts` — disposes every unique rig geometry exactly once
18. `BoatDepositSmoke.test.ts` — reuses one particle buffer for a short rising and fading puff
19. `BoatDepositSmoke.test.ts` — moves particles while the puff fades
20. `BoatDepositSmoke.test.ts` — restarts the same puff and hides it after its fixed lifetime
21. `BoatDepositSmoke.test.ts` — disposes its geometry and material exactly once
22. `BoatStorage.test.ts` — classifies every item on the approved support surface
23. `BoatStorage.test.ts` — uses canonical instance transforms for survival copies
24. `BoatStorage.test.ts` — uses the approved authored display poses
25. `BoatStorage.test.ts` — keeps Captain Whiskers supported on the forward starboard gunwale
26. `BoatStorage.test.ts` — keeps bait closest to the fishing rod
27. `BoatStorage.test.ts` — keeps every floor prop clear of the raised ribs
28. `BoatSupplyDisplay.test.ts` — layers ambient and selected poses over canonical supply transforms
29. `BoatSupplyDisplay.test.ts` — settles the generic fallback animation and restores its actor
30. `EventPresentationLayer.test.ts` — builds stable named tableaus and stages only the requested event
31. `EventPresentationLayer.test.ts` — omits dedicated drifting loot while restoring remaining tableaus on clear
32. `EventPresentationLayer.test.ts` — includes the approved identifying components in focused placeholder tableaus
33. `EventTest.test.ts` — derives ordered immutable options from the authored event catalog
34. `EventTest.test.ts` — creates one usable-by-default instance of every recoverable item
35. `ItemAmbientOcclusion.test.ts` — adds item meshes to the dedicated AO layer without hiding them from the beauty pass
36. `ItemAmbientOcclusion.test.ts` — keeps transparent collectible meshes out of the dedicated AO layer
37. `ItemAmbientOcclusion.test.ts` — adds opaque ship meshes as AO depth occluders but keeps glass transparent
38. `ItemAmbientOcclusion.test.ts` — runs full-resolution GTAO with visible screen-scaled item settings
39. `ItemAmbientOcclusion.test.ts` — uses half-resolution eight-sample AO for low quality
40. `ItemAmbientOcclusion.test.ts` — reconfigures existing targets for high quality without replacing the pass
41. `ItemAmbientOcclusion.test.ts` — supports composite, raw-buffer, and disabled comparison modes
42. `ItemAmbientOcclusion.test.ts` — updates AO intensity and radius from console controls
43. `ItemAmbientOcclusion.test.ts` — marks collectible clones without adding equipment to the AO layer
44. `PolyPizzaItemModels.test.ts` — pins the complete runtime item and practical-light set
45. `PolyPizzaItemModels.test.ts` — prioritizes Poly by Google where suitable and pins the requested lights
46. `PolyPizzaItemModels.test.ts` — pins the functionally selected survival item models
47. `PolyPizzaItemModels.test.ts` — presents the scuba gear upright with its base at the placement origin
48. `presentationWeather.test.ts` — lists the authored presentation choices in menu order
49. `presentationWeather.test.ts` — provides frozen profiles with distinct visual signatures and usable waves
50. `presentationWeather.test.ts` — makes rain, wind, and fog severe without blurring their roles
51. `presentationWeather.test.ts` — maps only authored survival events to presentation weather
52. `presentationWeather.test.ts` — prioritizes forced weather over event and normal weather
53. `PropAnimation.test.ts` — starts at a deterministic instance phase and advances independently
54. `PropAnimation.test.ts` — pauses while hidden and disposal is idempotent
55. `PropModelLibraryNormals.test.ts` — generates missing normals for lit prop materials
56. `ShipGeometry.test.ts` — shares the white wall finish with the hull and keeps timber floors separate
57. `ShipGeometry.test.ts` — maps the selected PBR sets to the cargo deck, rooms, and hull
58. `ShipGeometry.test.ts` — builds the narrowed 16.25 by 55 layered hull with timber deck
59. `ShipGeometry.test.ts` — extends the underwater hull through a deep chine to a narrow keel
60. `ShipGeometry.test.ts` — keeps the painted upper hull below the timber deck surface
61. `ShipGeometry.test.ts` — covers the full lifeboat station with emergency stripes up to the rail edge
62. `ShipGeometry.test.ts` — marks the lifeboat station center with large painted footprints
63. `ShipGeometry.test.ts` — uses each room finish consistently with metre-scaled upright wall UVs
64. `ShipGeometry.test.ts` — uses a plain dark transparent lifeboat station surface
65. `ShipGeometry.test.ts` — renders room panels as textured weathered warm white
66. `ShipGeometry.test.ts` — seats the captured front pane on the faceted wheelhouse outline
67. `ShipGeometry.test.ts` — adds authored exterior construction details
68. `ShipGeometry.test.ts` — does not place an alarm cylinder on the wheelhouse roof
69. `ShipGeometry.test.ts` — cuts paired framed round portholes into the transverse cabin walls
70. `ShipGeometry.test.ts` — projects room door frames on both wall faces and leaves the wheelhouse unframed
71. `ShipGeometry.test.ts` — uses 0.01 m visual overlaps at room and wheelhouse structural seams
72. `ShipGeometry.test.ts` — keeps room roofs and chimney-housing parts flush without intersecting volumes
73. `ShipGeometry.test.ts` — builds an upright faceted wheelhouse facade with captured glass and no inner rails
74. `ShipGeometry.test.ts` — covers the faceted wheelhouse with a clear overhanging roof
75. `ShipGeometry.test.ts` — keeps captain-room window glazing completely clear of mounted clutter
76. `survivalJournal.test.ts` — records utility salvage without calling it food or junk
77. `VisualQualityControl.test.ts` — exposes text, pressed state, focusable buttons, and immediate changes
78. `VisualQualityControl.test.ts` — offers a separate water quality choice
79. `WeatherEffects.test.ts` — authors severe rain streaks, fog veils, and wind-driven horizontal spray
80. `ShipGeometry.test.ts` — uses one wall-finished roof slab for each room
81. `BoatStorage.test.ts` — keeps production props separated on each support surface
82. `BoatStorage.test.ts` — rests every production prop on its support inside the hull
83. `BoatSupplyDisplay.test.ts` — does not mutate the stored ambient base pose
84. `BoatSupplyDisplay.test.ts` — pins the selected duplicate actor through lost sync and releases it on the next sync
85. `EventPresentationLayer.test.ts` — holds an authored reveal pose until its full animation completes
86. `WeatherEffects.test.ts` — shows only the authored optional layers for each distinct weather behavior
87. `WeatherEffects.test.ts` — adds one named root and applies every presentation weather profile
88. `WeatherEffects.test.ts` — renders the pooled opacity attribute as per-particle alpha
89. `SurvivalCameraLook.test.ts` — smoothly settles back to each frame authored camera pose after release
90. `ShipGeometry.test.ts` — keeps both loop doorways and the lifeboat rail opening clear
91. `ShipGeometry.test.ts` — renders the passage-facing walls inside the approved room bounds
92. `ShipGeometry.test.ts` — builds the deck hatch mesh without adding it to the collision pool
93. `ShipGeometry.test.ts` — limits the machinery-island collider to the box below the smokestacks
94. `EventPresentationLayer.test.ts` — samples the shared wave field without replacing pooled resources
95. `EventPresentationLayer.test.ts` — disposes every owned geometry and material exactly once
96. `WeatherEffects.test.ts` — reuses deterministically seeded particle attributes while following the camera
97. `WeatherEffects.test.ts` — consumes skipped lightning intervals instead of replaying them on later frames
98. `WeatherEffects.test.ts` — randomizes intermittent strikes and usually activates one prebuilt bolt
99. `WeatherEffects.test.ts` — disposes every owned resource exactly once
100. `BoatStorage.test.ts` — rejects malformed or out-of-range instance IDs
