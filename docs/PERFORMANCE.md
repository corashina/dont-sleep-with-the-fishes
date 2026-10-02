# Survival performance measurements

Measured on October 2, 2026. Baseline commit: `efc0af6bcc0e88b2a8d10ecf90b5ebafd8ff0133`.

Five changes remove repeated work: button checks, bone products, secondary-pass transforms, side-frame draws, and water-capture material setup.
Each change retains the same gameplay rules and graphics settings.
The initial overlap measurements and the follow-up measurements appear separately below.
Alternating local measurements saved about 0.25 ms per body sample and 0.17 ms across outline and AO captures.
Whole-game timing drift prevents a reliable overall CPU or FPS gain claim for the follow-up changes.
The latest round removes about 30 draws and reduces shader lookups from about 175 to 28 per frame.
Main-pass transform reuse was rejected after checking later scene changes. Its narrow probe did not prove general safety.

## Conditions and reproduction

| Condition | Value |
| --- | --- |
| CPU | Intel Core i7-11700K, 16 logical processors |
| GPU | NVIDIA GeForce RTX 4070 Ti, ANGLE D3D11, driver 32.0.16.1714 |
| System | Windows 10.0.26300, 31.89 GiB RAM |
| Browser | Headless Chrome 154.0.0.0, hardware WebGL2 |
| Viewport | 1920 by 1080, device pixel ratio 1 |
| Graphics | Default High visuals, water, and shadows; Low AA and AO; AO composite mode |
| Target | 1080p at 60 FPS, from `WATER_RENDERING.md` |
| Build | Minified Vite production build with `--mode playtest --sourcemap` |
| Scenarios | Day-one survival; the same survival scene with Thunderstorm weather forced |
| Sampling | Three fresh browser contexts per scenario, five-second warm-up, 15-second frame sample |
| CPU profiles | Separate ten-second recordings after run three, one-millisecond sampling |

The playtest mode enables the existing seeded entry. It does not run the development server.
Both scenarios use a stationary forward camera and animated gameplay scenes.
Storm adds rain, lightning, spray, and larger waves. It was not slower than normal survival on this GPU.

1. Build the baseline and changed source into separate output folders.
2. Serve each build with Vite preview, using ports 4173 and 4174.
3. Use fresh browser storage and the viewport above.
4. Open `/dont-sleep-with-the-fishes/?playtest=survival&seed=123&missing=cannedFood-1&missing=baitTin-1`.
5. Wait for the loading screen to disappear, then allow five seconds of warm-up.
6. Record 15 seconds without input. Repeat three times.
7. Repeat with the System Tuning weather override set to Thunderstorm.

The browser harness applies that override before loading through `dont-sleep-with-the-fishes.system-tuning`.
It wraps animation callbacks to record frame intervals and callback duration.
It counts WebGL draw calls and uses `EXT_disjoint_timer_query_webgl2` for asynchronous GPU timings.
CPU callback duration includes JavaScript and driver calls. It is wall time, not exclusive CPU execution time.
The heap figures cover JavaScript allocations. They exclude GPU, native, and decoded audio memory.

## Initial overlap measurements

Ranges below span the three runs, not uncertainty bounds. Times use milliseconds unless stated.

| Metric | Normal before | Normal after | Storm before | Storm after |
| --- | ---: | ---: | ---: | ---: |
| Median frame interval | 7.0 | 7.0 | 7.0 | 7.0 |
| p95 frame interval | 13.9 | 13.8 | 13.9 | 13.9 |
| Maximum frame interval | 14.1–21.0 | 14.0–14.1 | 14.1–20.8 | 14.1–14.2 |
| Frames above 16.67 ms per run | 0–4 | 0 | 0–1 | 0 |
| Frames above 33.34 / 50 ms | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Median CPU callback | 7.1–7.5 | 6.7–6.8 | 7.1–7.2 | 6.9–7.2 |
| p95 CPU callback | 9.1–9.7 | 7.9–8.1 | 7.9–9.0 | 8.3–9.1 |
| Median GPU time | 6.50–6.91 | 6.41–6.48 | 6.50–6.57 | 6.43–6.67 |
| p95 GPU time | 8.50–8.76 | 7.48–7.56 | 7.22–8.30 | 7.58–8.27 |
| Median draw calls | 757–758 | 757–758 | 752–753 | 752–753 |
| Heap at sample start, MB | 84.34–90.98 | 86.48–102.37 | 88.55–105.99 | 74.90–85.22 |
| Heap at sample end, MB | 59.23–77.56 | 62.19–76.36 | 67.88–77.70 | 57.44–78.01 |
| Navigation to ready, seconds | 3.92–13.19 | 3.88–13.50 | 3.82–5.04 | 3.76–4.99 |

Normal CPU medians fell by about 7% using the median of the three run medians: 7.2 to 6.7 ms.
Storm CPU medians fell from 7.2 to 7.1 ms, within run variation.
Frame intervals follow the browser's refresh cadence. The 0.1 ms normal p95 difference is not a material frame-time gain.
The code change does not reduce rendering work. Do not attribute GPU timing differences to a GPU optimization.

The first normal load in each batch took about 13 seconds; later loads took about four seconds.
Fresh browser contexts do not clear operating-system or driver caches. These results do not establish a loading improvement.
Heap changes include garbage collection. These short samples do not establish a memory improvement or absence of leaks.

## Confirmed costs and fix ranking

CPU trace totals below include callees. They overlap and must not be added.

| Rank | Code and evidence | Expected benefit, complexity, and risk | Decision |
| --- | --- | --- | --- |
| 1 | `BoatAnchorView.syncOverlapState`: 490 ms normal and 627 ms storm per ten-second baseline trace. Nested loops repeated `isCycleCandidate` and DOM `closest` checks. | Remove repeated eligibility work. Small change; low risk with control tests. | Implemented after design approval. |
| 2 | `CarlitosSeatPlacement.preparePlacement`: 1.13–1.28 seconds per trace. `measureBody` used 810–1,020 ms. | Cache repeated bone matrix products. Small helper; placement risk requires exact pose tests. | Implemented. Bounds still sample every vertex in the current pose. |
| 3 | Outline and AO captures repeated the preceding color pass transforms. The alternating probe found about 0.20 ms of avoidable CPU work. | Two state guards. Low complexity; incorrect restoration could affect later frames. | Implemented with success and failure checks. |
| 4 | `PostProcessingPipeline.render` and Three.js render paths: about 6.74–6.89 seconds per trace; 752–758 median frame draw calls. | Batching could reduce submission cost. Visual checks must cover shadows, water captures, and outlines. | Targeted side-frame batching is measured in the latest round below. |

References:

- [Overlap update](../src/ui/BoatAnchorView.ts), `syncOverlapState`, `isCycleCandidate`, and `isFocusableCommand`.
- [Frame loop](../src/Game.ts), `handleAnimationFrame`.
- [Renderer](../src/rendering/PostProcessingPipeline.ts), `render` and `configureScene`.
- [Carlitos placement](../src/survival/CarlitosSeatPlacement.ts), `preparePlacement` and `measureBody`.

The fix collects eligible anchor IDs once per update in one component-owned array.
The overlap loop retains the same geometry test, counts, shortcuts, and selection rules.
It rebuilds eligibility on each update, so hidden, disabled, removed, and event-locked controls cannot retain stale eligibility.
Disposal clears the array. No packages, gameplay rules, shaders, assets, or graphics settings changed.

| Sampled overlap CPU time | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Normal, ten-second trace | 489.61 ms | 39.00 ms | 92% |
| Storm, ten-second trace | 626.75 ms | 86.13 ms | 86% |

Trace durations ranged from 10.13 to 10.17 seconds. These are sampled totals, not exact per-call timings.
The measured local reduction supports retaining this small change, despite unchanged median frame intervals.

I then repeated the six baseline runs, giving a baseline → changed → baseline batch order.
Normal baseline CPU medians returned to 7.1–7.4 ms; storm medians ranged from 7.1–7.3 ms.
The repeated overlap traces used 463 ms normal and 641 ms storm, confirming the local cost reduction.
The repeated baseline had 13.9–14.0 ms p95 frame intervals, a 27.9 ms maximum, and no frames above 33.34 ms.
Normal baseline runs contained 4–20 frames above 16.67 ms; storm runs contained 0–1.
This repeat supports the normal CPU result. It also shows tail-latency noise, so sparse spikes are not a separate improvement claim.

## Rejected hypotheses and loading review

An in-browser probe disabled shadow updates during the AO normal pass, then restored them.
The pass still issued 74 draws and took about 0.28–0.31 ms. The probe showed no benefit.
No product code from that probe remains.

The loop also rewrites System Tuning time labels, but that path used only 13–20 ms per ten-second trace.
That cost did not justify another change.

The project uses Three.js 0.180.0 and deterministic Rapier 0.19.3.
Rapier loads through a dynamic import for physics. This survival baseline does not exercise ship physics.
[AssetDownloads](../src/app/AssetDownloads.ts) shares pending requests.
[AssetLoaders](../src/world/AssetLoaders.ts) uses Three.js loaders and revokes temporary texture URLs.
[PhaseResources](../src/app/PhaseResources.ts) retains resident assets until game disposal; phase leases protect pending loads.
Resident assets alone are not evidence of a leak.

The production build warns about large chunks: approximately 2.73 MB for game code and 2.28 MB for Rapier, before gzip.
Chunk splitting remains a loading hypothesis. No network or startup profile established its benefit in this task.

## Evidence and limits

Local evidence lives under `artifacts/performance-build/`, which Git excludes.
The folder contains the browser harness, baseline and changed builds, raw frame samples, CPU profiles, and screenshots.
Each run JSON includes resolution, browser identity, renderer identity, heap samples, loading time, and page errors.
`metadata.json` records the baseline commit, source diff hash, and JavaScript bundle hashes.
`profile.cjs` accepts an output folder name and server port. Use a new output name to preserve earlier measurements.

```powershell
node node_modules/vite/bin/vite.js build --mode playtest --sourcemap --outDir artifacts/performance-build/candidate/dist
node node_modules/vite/bin/vite.js preview --outDir artifacts/performance-build/candidate/dist --host 127.0.0.1 --port 4174 --strictPort
# Run in a second terminal:
node artifacts/performance-build/profile.cjs candidate 4174
```

## Verification

- Passed 46 tests across `SurvivalUI`, `HandymanPointerInteraction`, `UiScaleInteraction`, and `PopupClose`.
- Added one regression test, rated 95/100 before implementation, for hidden, disabled, restored, and removed overlapping controls.
- Passed the new test against baseline behavior before changing the overlap implementation.
- Passed TypeScript checks, ESLint with zero allowed warnings, the standard production build, and `git diff --check`.
- Checked ArrowRight overlap selection and journal open/close in both production playtest builds.
- Both builds selected the same overlapping item. The browser reported no page or console errors during these checks.
- Inspected normal and storm screenshots before and after. No visual regression was apparent.

Bun was unavailable on PATH. I ran the package script components through Node:

```powershell
node node_modules/vitest/vitest.mjs run tests/SurvivalUI.test.ts tests/HandymanPointerInteraction.test.ts tests/UiScaleInteraction.test.ts tests/PopupClose.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings 0
node node_modules/vite/bin/vite.js build --logLevel warn
git diff --check
```

The full suite was not run at this stage. The pre-push run below covers the final changes.

## Follow-up changes

The user approved both follow-up changes after the probes below.

| Candidate | Probe evidence | Preservation requirement |
| --- | --- | --- |
| Cache bone matrices during Carlitos body sampling | Nine skinned meshes contain 5,462 vertices and 35 bones each. Three alternating measurements took 0.74–0.92 ms without caching and 0.36–0.48 ms with caching. | Refresh matrices for each pose. Retain vertex sampling, morphs, weights, bind transforms, and exact bounds. |
| Reuse transforms for outline and AO captures | Outline capture CPU time fell from about 0.17–0.19 ms to 0.058 ms. AO normal capture fell from about 0.34–0.35 ms to 0.250 ms. | Reuse the preceding color pass transforms. Restore scene and camera update flags after success or failure. |

The Carlitos probe compared all sampled vertex positions at one live pose. Maximum difference was zero.
The timings include matrix preparation for each mesh, with 100 complete body samples per timing run.
This microbenchmark excludes bounds accumulation and gameplay updates. It cannot establish a frame-time improvement.

The render probe alternated baseline and experimental modes within the same production build.
It preserved the 11 outline draws and 74 AO normal draws. It measured CPU submission time, not GPU improvement.
Only one transform-reuse timing interval was captured in that initial probe.

Isolating the AO scene did not remove repeated material setup. That hypothesis remains rejected.
The existing boat builder already merges iron fastenings through Three.js `mergeGeometries`.
Further batching needs evidence because support surfaces and interaction checks depend on named meshes.

Probe files: `artifacts/performance-build/scene-inspection.json`, `render-probe.json`, and their browser scripts.

### Current-pose bone matrices

[SkinnedVertexSampler](../src/rendering/SkinnedVertexSampler.ts) computes each bone matrix once for each body sample.
[CarlitosSeatPlacement](../src/survival/CarlitosSeatPlacement.ts) still measures all 5,462 vertices in all nine skinned meshes.
The cache refreshes after world transforms update. It does not retain bounds between poses.
Three.js 0.180 computes `bone.matrixWorld * boneInverse` inside every nonzero vertex influence.
Its vertex API has no matrix-cache argument. The helper retains Three's morph method and matrix operations.
It uses full-precision matrices, normalized weights, interleaved attributes, and the original bind transforms.
All cache storage is allocated at construction.

### Secondary render transforms

[HoverOutlinePass](../src/rendering/HoverOutlinePass.ts) and [ItemAmbientOcclusionPass](../src/rendering/ItemAmbientOcclusion.ts) reuse the color pass transforms.
The pipeline runs color, outline mask, then AO without gameplay updates between them.
Both passes temporarily disable automatic world-matrix updates and restore the previous flags in `finally`.
The scene, camera, geometry, materials, lights, shadows, and pass resolutions stay unchanged.
The existing ocean capture uses the same Three.js flags for nested renders.

### Incremental production measurements

The follow-up repeats the same hardware, settings, scenes, and sampling protocol.
The comparison starts from the build containing the overlap fix.
The batch order is UI baseline, bone cache, both fixes, then UI baseline again.
Each batch has three normal runs and three storm runs. No builds or tests ran during frame sampling.
Times below are milliseconds. Each range spans three runs.

| Normal scene | UI baseline | Bone cache only | Both fixes |
| --- | ---: | ---: | ---: |
| Median frame interval | 7.0 | 7.0 | 7.0 |
| p95 frame interval | 13.9–14.0 | 13.9–14.0 | 13.9 |
| Maximum frame interval | 14.1–20.9 | 20.9–48.6 | 20.8–21.0 |
| Frames above 16.67 ms per run | 0–2 | 1–25 | 1–3 |
| Frames above 33.34 / 50 ms per run | 0 / 0 | 0–1 / 0 | 0 / 0 |
| Median CPU callback | 7.9–8.0 | 7.7–8.1 | 7.6–7.9 |
| p95 CPU callback | 9.0–9.6 | 9.1–12.2 | 9.0–9.3 |
| Median GPU time | 7.26–7.35 | 7.40–7.74 | 7.32–7.50 |
| p95 GPU time | 8.29–8.73 | 8.78–11.43 | 8.37–9.13 |
| Median draw calls | 757–759 | 757–759 | 757–759 |
| Heap at start, MB | 58.65–90.41 | 75.68–100.27 | 74.24–104.08 |
| Heap at end, MB | 67.26–80.42 | 64.00–180.50 | 63.64–164.43 |
| Navigation to ready, seconds | 3.33–17.47 | 3.51–16.71 | 3.42–17.32 |

| Storm scene | UI baseline | Bone cache only | Both fixes |
| --- | ---: | ---: | ---: |
| Median frame interval | 7.0 | 7.0 | 7.0 |
| p95 frame interval | 13.9–14.0 | 14.0 | 13.9 |
| Maximum frame interval | 14.2–20.9 | 14.1–27.9 | 20.9–34.8 |
| Frames above 16.67 ms per run | 0–1 | 0–38 | 2–32 |
| Frames above 33.34 / 50 ms per run | 0 / 0 | 0 / 0 | 0–2 / 0 |
| Median CPU callback | 8.0–8.2 | 8.1–8.2 | 7.0–7.2 |
| p95 CPU callback | 9.4–9.7 | 9.6–12.7 | 9.5–10.6 |
| Median GPU time | 7.36–7.46 | 7.57–7.75 | 6.71–6.81 |
| p95 GPU time | 8.57–8.77 | 9.13–11.76 | 9.01–10.53 |
| Median draw calls | 754–755 | 753–755 | 753–755 |
| Heap at start, MB | 81.96–102.86 | 77.86–100.61 | 89.38–102.78 |
| Heap at end, MB | 60.26–82.38 | 72.14–81.11 | 56.39–187.49 |
| Navigation to ready, seconds | 3.24–4.94 | 3.48–4.87 | 3.08–4.26 |

The normal callback ranges overlap. The storm callback fell, but GPU timing also shifted without a GPU code change.
Neither result establishes a frame-rate gain. Sparse spikes also varied; two final storm frames exceeded 33.34 ms.
Heap endpoints include garbage collection. These runs establish neither memory savings nor a leak.
Loading times remain cache-sensitive and show no established improvement.

The closing UI baseline confirms substantial timing drift.
Its normal CPU medians were 6.5–6.9 ms, compared with 7.9–8.0 ms at the start.
Storm CPU medians were 7.0–7.3 ms, compared with 8.0–8.2 ms at the start.
Closing baseline p95 frame intervals were 7.1–13.9 ms normal and 13.9 ms storm.
No closing baseline frame exceeded 33.34 ms. Its maximum was 21.0 ms.
Thus, the whole-game batches cannot establish an overall CPU or FPS improvement from these two changes.
The local CPU measurements below support retaining them.

| Sampled CPU total per ten-second trace | UI baseline | Bone cache only | Both fixes |
| --- | ---: | ---: | ---: |
| Normal body measurement | 878.42 | 639.99 | 732.06 |
| Storm body measurement | 750.10 | 585.55 | 666.74 |
| Normal world-matrix updates | 742.70 | 631.03 | 452.37 |
| Storm world-matrix updates | 738.56 | 611.09 | 562.27 |

These totals include callees and are not per-call timings. Trace frame counts and browser scheduling can affect them.
The bone-only traces reduced sampled body measurement by 22–27%.
The final traces reduced world-matrix work compared with the bone-only traces.
The rendering path still occupies about 7.46–7.48 seconds per final trace, including driver calls.
Geometry submission, material setup, and water captures remain the largest measured cost group.

### Alternating measurements and preservation checks

These checks run each old and new operation in the same page, alternating three times.
They measure local CPU work and avoid the large scheduling differences between whole-game batches.

| Operation, CPU milliseconds | Before, three-run range | After, three-run range |
| --- | ---: | ---: |
| Sample all Carlitos body vertices | 0.749–0.755 | 0.498–0.505 |
| Outline mask capture | 0.135–0.145 | 0.045–0.053 |
| AO normal capture | 0.292–0.306 | 0.214–0.222 |
| Outline and AO combined | 0.427–0.449 | 0.258–0.274 |

The body check transpiles the actual helper source and uses the loaded game meshes.
Each timing repeats all nine meshes 100 times, including bone matrix preparation.
Checksums match. A separate check compares 655,440 vertex positions across 120 live poses; maximum difference is zero.
The local sampling cost fell by about 33%. This timing excludes bounds accumulation and other gameplay work.

The render check restores automatic updates for each baseline interval in the final build.
Each interval lasts six seconds after one second of settling, with 825–865 captures per pass.
Outline draws remain 11 and AO normal draws remain 74.
The combined local capture cost fell by 0.169–0.175 ms per frame, about 39%.
An additional 120 capture checks found no scene or camera matrix differences after forcing the omitted update.
No GPU gain is claimed from these CPU changes.

Evidence: `skin-verification.json`, `render-verification.json`, and their `verify-*.cjs` scripts under `artifacts/performance-build/`.
The incremental runs are in `ui-repeat`, `skin`, `transforms`, and `ui-repeat-end`.
`followup-metadata.json` records source and bundle hashes. Earlier evidence remains unchanged.

The measured local savings justify both small changes despite the inconclusive whole-game timings.

### Follow-up verification

- Passed 118 tests in 12 relevant files on the final source.
- Pose tests were rated 98/100 before implementation. They compare exact results with Three.js across poses and morphs.
- Render-state tests were rated 95/100. They check flag restoration after success and failure, including initially disabled updates.
- Passed TypeScript, ESLint with zero allowed warnings, the standard production build, and whitespace checks.
- Inspected normal and storm screenshots for both new steps. No visual regression was apparent.
- Live pose comparisons and render matrix checks found zero differences, as recorded above.
- Both browser builds matched keyboard overlap selection, journal controls, Carlitos card controls, and day-one pet eligibility.
- Both browser control checks reported no page or console errors. Petting was unavailable because Carlitos was already happy.
- Feeding and pet animations were covered by unit tests; the browser check did not perform a pet action.

The final test command adds these files to the four UI files listed earlier:

```powershell
node node_modules/vitest/vitest.mjs run tests/SkinnedVertexSampler.test.ts tests/BoatWorld.test.ts tests/ItemAnimationLabCarlitos.test.ts tests/CarlitosSurvival.test.ts tests/CarlitosFeedingPile.test.ts tests/ItemAmbientOcclusionPass.test.ts tests/HoverOutlinePass.test.ts tests/OceanCapture.test.ts tests/SurvivalUI.test.ts tests/HandymanPointerInteraction.test.ts tests/UiScaleInteraction.test.ts tests/PopupClose.test.ts
```

## Next optimization candidates

A further investigation used the current production build at 1920 by 1080, with the same normal survival entry.
It changed no product source. Browser probes are disposable and do not establish production fixes.
No new tests were added during this investigation.

### Draw and material audit

Two three-second recordings covered 350 and 424 frames after a five-second warm-up.
Reflection counts vary with boat movement and camera culling.

| Render work | Draw calls per frame |
| --- | ---: |
| Shadows | 180 |
| Main color | 178 |
| Water color capture | 171 |
| Water reflection | 126–133 |
| AO normal capture | 74 |
| Outline mask | 11 |
| Fullscreen passes | 12 |

The audit also counted about 174–175 material-program lookups per frame.
Color and water color capture each triggered 83 lookups. Reflection triggered another 8–9.
This is repeated program selection and setup; it is not evidence of repeated shader compilation.
A hull material kept material version 0 and shader program 43 across the recorded passes.
Its cached lighting-state version alternated between the main pass's changing version and capture version 6.

Source maps identify the earlier final-build profile's largest renderer CPU functions:

- Vertex binding validation, `WebGLBindingStates.needsUpdate`: about 1.65–1.77 seconds of self time per ten-second trace.
- Program parameter collection, `WebGLPrograms.getParameters`: about 0.77–0.80 seconds of self time.
- Program selection, `WebGLRenderer.getProgram`: about 0.63–0.66 seconds of self time.

These costs support reducing draw submissions and repeated lighting-state setup.
They are measured costs, not estimates of recoverable time.

### Ranked candidates

| Rank | Proposed change | Evidence and expected benefit | Complexity and risk |
| --- | --- | --- | --- |
| 1 | Give survival updates explicit ownership of world transforms, then reuse them in the main color pass. | A disposable probe removed one scene-wide update per frame. Three alternating pairs reduced mean color-render time by 0.103–0.128 ms. | Medium. Must cover absent Carlitos, phase entry, direct renders, paused updates, and asynchronous scene changes. |
| 2 | Merge the twelve fixed lifeboat side frames with the existing Three.js geometry utility. | They share geometry and material. The audit counted about 35 submissions across shadows, color, and water captures. One merged mesh needs at most four for those passes. | Low to medium. Preserve collision geometry, material settings, boat movement, shadows, and sinking behavior. |
| 3 | Reduce material lighting-state changes across water captures and the main pass. | About 174–175 lookups per frame repeatedly select existing shaders. Program selection and parameter collection are substantial measured CPU costs. | Higher. Capture scheduling must preserve current-frame shadows, fog uniforms, reflected cameras, and render state. Savings are not measured yet. |

References: [BoatWorld](../src/survival/BoatWorld.ts), `updateScene` and `updateCarlitosSeat`;
[CarlitosSeatPlacement](../src/survival/CarlitosSeatPlacement.ts), `preparePlacement`;
[PostProcessingPipeline](../src/rendering/PostProcessingPipeline.ts), `render`;
[Lifeboat](../src/world/Lifeboat.ts), `addFramesAndBenches`;
[OceanCapture](../src/ocean/OceanCapture.ts), `update`;
[OceanRenderer](../src/ocean/OceanRenderer.ts), `prepareWater`.

### Probe results and limits

Each mode ran for five seconds after one second of settling, alternating three times in one page.
The timing wraps the main color render, including its shadows and nested water captures.
It excludes gameplay updates, AO, outlines, and later fullscreen passes.

| Transform reuse pair | Existing mean render, ms | Probe mean render, ms | Removed update mean, ms |
| --- | ---: | ---: | ---: |
| 1 | 4.308 | 4.200 | 0.085 |
| 2 | 4.333 | 4.205 | 0.085 |
| 3 | 4.357 | 4.254 | 0.081 |

The existing mode made one automatic scene update per frame. The probe made none.
The earlier forced update remained active in both modes.
An additional 120 checks found zero matrix differences when forcing the omitted update in this scene.
This does not prove that every gameplay state already has current matrices.
In particular, `updateCarlitosSeat` returns early when Carlitos is absent. A global disable would be incorrect without broader ownership changes.

The side-frame probe merged 3,888 vertices without reducing geometry detail or changing materials.
Across its three intervals, mean color-render submissions were 618–633, compared with 659–662 in adjacent baseline intervals.
These counts include shadows and water captures. Movement changes culling, so they are not an exact fixed-pose reduction.
Mean render times were 4.24–5.41 ms for the probe and 4.34–8.66 ms for the baseline.
That timing noise prevents a CPU or FPS gain claim for batching. The lower draw count is confirmed.
Collision, sinking, and image comparisons remain necessary before retaining a product implementation.

Avoid merging floorboards or hull pieces indiscriminately.
[SinkingBoatBreakup](../src/survival/SinkingBoatBreakup.ts) moves floorboards and separates named hull meshes during the ending.
The proposed side frames are a smaller target that avoids those moving parts.

Evidence: `draw-audit.json`, `program-audit.json`, `next-probes.json`, and their scripts under `artifacts/performance-build/`.
`map-profile.cjs` resolves the recorded production CPU samples through their source maps.
The investigation did not measure new GPU, loading, or memory improvements.

## Latest optimization round

The user approved all three candidates. Two changes passed implementation checks. The transform shortcut was rejected.
No graphics setting, mesh detail, texture resolution, control, or gameplay rule was reduced.

### Retained changes

**Side frames:** [Lifeboat.ts](../src/world/Lifeboat.ts), `addFramesAndBenches`, now uses one `InstancedMesh` for twelve fixed wooden frames.
The geometry, UVs, material values, transforms, and shadow flags stay intact.
A separate material instance prevents shader variant changes between ordinary and instanced timber meshes.
The boat's geometry disposal also releases the instance buffer.

The first implementation merged disconnected frames into one geometry. That changed bounds used by collision checks.
It was removed before profiling the retained implementation.
Instancing preserves separate frame bounds through the existing `CarlitosSeatPlacement.intersectsInstances` path.
Ring and crab tests now inspect each instance's bounds before their existing collision checks.
Named floorboards and hull pieces remain separate for the sinking sequence.

**Water materials:** [CaptureMaterials.ts](../src/ocean/CaptureMaterials.ts) caches a material instance for each lit source material.
[OceanCapture.ts](../src/ocean/OceanCapture.ts) applies those instances during color and reflection captures, then restores the original bindings.
The helper shares current textures, colors, shader hooks, and other material values without copying objects each frame.
It updates scalar values, including opacity and shader version, once per capture.
Source disposal releases each cached instance. Capture disposal releases the remaining instances.

[ItemAmbientOcclusion.ts](../src/rendering/ItemAmbientOcclusion.ts) keeps the main light selection during its normal capture.
The normal material ignores lights. Shadow updates stay disabled during this capture.
This preserves the main lighting cache without extra shadow draws. Light masks and renderer flags are restored in `finally`.
Together, these changes stop water and AO captures from repeatedly replacing the main material lighting state.
Capture order and current-frame shadow maps stay unchanged.

### Rejected transform shortcut

The earlier probe saved 0.103–0.128 ms in a stationary day-one scene.
However, `SurvivalPhase.update` runs fishing and event updates after `BoatWorld.update` and its Carlitos matrix refresh.
For example, `SurvivalFishingFlow.update` can call `moveFishingBite` after that refresh.
Camera changes, event transitions, direct renders, and an absent Carlitos also break the proposed reuse assumption.
Keeping the shortcut would require broader update ownership changes and more gameplay coverage.
The normal main-pass matrix refresh remains enabled. No claimed saving includes the rejected shortcut.

### Measurements after each retained change

Conditions match the table above: i7-11700K, RTX 4070 Ti, Chrome 154, 1920×1080, DPR 1, unchanged graphics settings.
Each row shows the minimum and maximum result across three runs. Each run measured 15 seconds after five seconds of warm-up.
The baseline includes the three earlier optimizations. Builds were served on ports 4176, 4177, and 4178 respectively.

| Build and scene | Median frame, ms | p95 frame, ms | Median callback, ms | p95 callback, ms | Median draws |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline, normal | 6.9–7.0 | 13.8–13.9 | 6.6–6.8 | 8.3–8.6 | 757–758 |
| Frames, normal | 6.9–7.0 | 7.1–13.9 | 6.1 | 7.8–9.9 | 727–728 |
| Frames + materials, normal | 6.9–7.0 | 7.1–13.9 | 5.5–6.6 | 7.4–9.4 | 727–729 |
| Baseline, storm | 7.0 | 13.9 | 6.6–7.1 | 8.9–10.1 | 753–755 |
| Frames, storm | 6.9 | 7.1 | 6.2–6.3 | 7.6–7.8 | 723–728 |
| Frames + materials, storm | 6.9–7.0 | 7.1–13.9 | 5.7–6.1 | 7.6–9.9 | 725–728 |

| Build and scene | Median GPU query, ms | p95 GPU query, ms | Maximum frame, ms | Frames above 16.67 ms, by run |
| --- | ---: | ---: | ---: | --- |
| Baseline, normal | 6.525–6.708 | 8.203–8.419 | 14.1–14.2 | 0, 0, 0 |
| Frames, normal | 6.130–6.268 | 7.596–9.481 | 14.0–20.9 | 0, 0, 5 |
| Frames + materials, normal | 5.811–6.152 | 6.796–8.579 | 14.1–20.8 | 3, 0, 1 |
| Baseline, storm | 6.394–6.822 | 8.564–9.613 | 14.2–21.1 | 4, 0, 9 |
| Frames, storm | 5.958–6.026 | 7.226–7.506 | 14.0–14.1 | 0, 0, 0 |
| Frames + materials, storm | 5.605–5.746 | 6.908–8.749 | 14.0–21.0 | 0, 8, 0 |

No sampled frame exceeded 33 or 50 ms. Tail latency still varied across runs.
GPU queries include time between submitted commands; lower results do not prove lower shader execution cost.
The changes reduce CPU setup and draw submissions. They do not simplify shaders or geometry.

| Build and scene | Ready times, seconds, by run | Heap before sample, MB | Heap after sample, MB |
| --- | --- | ---: | ---: |
| Baseline, normal | 13.138, 3.069, 2.962 | 78.3–102.6 | 55.7–81.6 |
| Frames, normal | 14.311, 2.966, 2.951 | 73.8–111.6 | 61.0–129.5 |
| Frames + materials, normal | 22.409, 3.351, 3.134 | 71.7–84.3 | 68.2–118.7 |
| Baseline, storm | 4.292, 3.063, 3.409 | 82.1–112.8 | 57.2–166.8 |
| Frames, storm | 4.235, 2.973, 2.855 | 91.4–119.3 | 77.0–151.0 |
| Frames + materials, storm | 4.518, 3.018, 3.329 | 66.9–79.3 | 88.6–102.5 |

First loads vary strongly with cache and shader preparation. The material build's first load was slower.
These samples do not establish a loading improvement or a memory improvement.
Garbage collection changes heap readings. Cached capture materials also add retained objects, although their textures remain shared.
Disposal tests pass; a long-running memory test was not performed.

### Attribution and visual checks

The live audit recorded about 174–175 shader cache lookups per frame before these changes, versus 27.7 afterward.
Remaining lookups include double-sided transparent material passes. These are shader selections, not shader compilations.
Main shadow draws fell from 180 to 169. Main color draws fell from 178 to 171.
Water color draws fell from 171 to 164. Reflection counts vary with culling.
AO retained 74 draws; outlines retained 11; fullscreen passes retained 12.

Separate ten-second CPU traces support the material change:

| Trace | Program selection self time, ms | Parameter collection self time, ms | Inclusive renderer time, ms |
| --- | ---: | ---: | ---: |
| Frames, normal | 938 | 1,221 | 7,282 |
| Frames + materials, normal | 242 | 265 | 6,609 |
| Frames, storm | 866 | 1,088 | 7,304 |
| Frames + materials, storm | 244 | 223 | 6,193 |

Sampling and runtime optimization affect attribution. These trace totals are not fixed per-frame savings.
The new binding replacement callback used about 304–363 ms of sampled self time per trace.
Its cost was included in the frame measurements. The retained benefit is reduced repeated setup with lower sampled renderer time.
The whole-game median stays near the refresh interval. No general FPS percentage is claimed.
Rendering remains the largest measured cost. Exact Carlitos body sampling still used 866–903 ms per ten-second trace.
Further gains need broader scene coverage before changing collision sampling, transparency, or capture scheduling.

A frozen production-render check compared the same pose, camera, and lighting at 1920×1080.
It forced new water captures, then compared shared materials against capture materials in the main color target.
Normal and storm images matched in all 8,294,400 color channels.
Replacing the twelve instances with separate meshes changed one channel by 1/255 in normal weather; storm matched exactly.
Repeating the reference render matched exactly in both scenes.
This check covers main color, shadows, and nested water captures. It does not prove equality for every post-processing or gameplay state.
Normal and storm screenshots were also inspected with post-processing active.

### Final checks and artifacts

- Passed 169 relevant tests across 21 files, including collision, sinking, fog, scene preparation, controls, and Carlitos checks.
- New geometry cleanup tests were rated 95/100. Material and render-state checks were rated 98/100 before implementation.
- Passed TypeScript, ESLint with zero allowed warnings, production builds, and whitespace checks.
- Both browser builds passed overlap keyboard selection, journal open/close, and Carlitos card open/close.
- The day-one pet action remained disabled because Carlitos was already happy. No browser errors were recorded.
- Before pushing, the full test suite passed: 1,310 tests across 190 files, using two workers.
- A complete gameplay run was not performed.

Raw runs are in `artifacts/performance-build/round3-baseline`, `frames`, and `materials`.
Each folder contains frame samples, GPU queries, screenshots, and CPU profiles.
`materials-audit.json`, `profile-costs.json`, and `visual-round3.json` contain the attribution and frozen-render checks.
Scripts with the same names reproduce those checks. `smoke-final.cjs` records browser controls.
The final build adds the tested instance-buffer disposal hook after timing measurements; per-frame code is identical.
Final browser checks use that build on port 4179. Build hashes are in `round3-metadata.json`.
Artifacts remain local and Git-ignored.

Pre-push verification used `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=2`.
The log is `artifacts/performance-build/pre-push-tests.log`.

## Coverage limits

The built-in FPS display averages half-second windows and excludes intervals above 250 ms.
It cannot supply the requested tail latency. The browser harness measures raw frame intervals instead.

This report covers one desktop GPU and two stationary survival scenes.
It does not cover scavenging, a complete run, all events, lower-end hardware, or a memory soak.
Loading measurements use localhost without network throttling.
GPU query instrumentation and sampling add overhead. Both builds use the same instrumentation.
Screenshots show different animation instants, so they support visual inspection, not pixel equality.
