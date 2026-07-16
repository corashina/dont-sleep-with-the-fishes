# Sunny Scavenging Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render scavenging in calm sunny daylight without rain while preserving sea spray, sinking behavior, and survival weather.

**Architecture:** `Environment` will use one immutable calm daytime sky state for construction and updates. It will own sky, fog, lights, and sea spray, while `World` will keep synchronizing the resulting palette with the ocean and applying physical sinking state.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vitest 3.2, Vite 7, Bun

## Global Constraints

- Keep sea spray, sinking progression, ship motion, waves, alarm effects, and survival-phase weather behavior.
- Keep survival weather types, probabilities, labels, palettes, and transitions unchanged.
- Add no assets or runtime network requests.
- Reuse the existing `calm/day` sky palette with severity `0`.

## File Map

| File | Responsibility |
| --- | --- |
| `tests/world.test.ts` | Locks the scavenging atmosphere, particle ownership, atmosphere-to-ocean synchronization, rollback, and disposal contracts. |
| `src/world/Environment.ts` | Constructs and updates the scavenging sky, fog, lights, and sea spray. |

---

### Task 1: Replace the scavenging squall with sunny weather

**Files:**
- Modify: `tests/world.test.ts:155-190,413-484,601-689`
- Modify: `src/world/Environment.ts:1-173`

**Interfaces:**
- Consumes: `Skybox.update(delta: number, state: SkyState, cameraPosition: Vector3): Readonly<SkyPalette>` and the existing `calm/day` palette.
- Produces: `Environment.atmosphere: Readonly<SkyPalette>` with a calm daytime palette; a scene containing `procedural-skybox` and `sea-spray` with no `rain` object.

- [ ] **Step 1: Write failing sunny-weather tests**

In the construction rollback test, remove `rain` from the resource names because sunny `Environment` must never construct it:

```ts
['lifeboat', 'procedural-ocean', 'procedural-skybox', 'sea-spray']
  .forEach((name) => {
    const object = scene.getObjectByName(name);
    if (!object) return;
    const found = collectRenderResources(object);
    found.geometries.forEach((resource) => resources.add(resource));
    found.materials.forEach((resource) => resources.add(resource));
  });
```

Rename the world-update test to `keeps physical sinking effects while rendering calm sunny weather`. Keep its setup through `const beacon = ...`, then replace the rest of the test body through the final smoke assertion with:

```ts
const sky = scene.getObjectByName('procedural-skybox') as Mesh;
const skyUniforms = (sky.material as ShaderMaterial).uniforms;
expect(scene.getObjectByName('rain')).toBeUndefined();
expect(scene.getObjectByName('sea-spray')).toBeInstanceOf(Points);
expect(skyUniforms.uSunVisibility!.value).toBe(1);

world.update(time, delta, sinking, cameraPosition, false);

const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
const oceanMaterial = ocean.material as ShaderMaterial;
expect(oceanMaterial.uniforms.uTime!.value).toBe(time);
expect(oceanMaterial.uniforms.uAmplitudeScale!.value).toBe(sinking.waveAmplitudeScale);
expect(world.lifeboat.position.x).toBeCloseTo(9.0 + expectedPose.driftX);
expect(world.lifeboat.position.y).toBeCloseTo(0.35 + expectedPose.y);
expect(world.lifeboat.position.z).toBeCloseTo(-6.5 + expectedPose.driftZ);
expect(world.lifeboat.rotation.x).toBeCloseTo(expectedPose.pitch);
expect(world.lifeboat.rotation.z).toBeCloseTo(-expectedPose.roll);
expect(world.lifeboat.scale.toArray()).toEqual([1, 1, 1]);
expect(world.ship.position.y).toBe(sinking.sinkOffset);
expect(world.ship.rotation.x).toBe(sinking.pitchRadians);
expect(world.ship.rotation.z).toBe(sinking.rollRadians);
expect((scene.fog as FogExp2).density).toBeCloseTo(0.012);
expect(beacon).toBeInstanceOf(Mesh);
const expectedPulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * sinking.alarmRate);
expect((beacon.material as MeshStandardMaterial).emissiveIntensity)
  .toBeCloseTo(0.25 + expectedPulse * 1.35);
expect(sky).toBeInstanceOf(Mesh);
expect(sky.position.toArray()).toEqual(cameraPosition.toArray());
expect(scene.getObjectByName('storm-clouds')).toBeUndefined();
expect(scene.getObjectByName('rain')).toBeUndefined();
expect(scene.getObjectByName('sea-spray')).toBeInstanceOf(Points);
expect(skyUniforms.uMoonMap!.value).toBe(moonTexture);
expect(skyUniforms.uSunVisibility!.value).toBe(1);
expect(oceanMaterial.uniforms.uHorizonColor!.value).toEqual(
  skyUniforms.uHorizonColor!.value,
);
const smoke = scene.getObjectByName('freighter-smoke') as Points;
const smokePositions = smoke.geometry.getAttribute('position') as BufferAttribute;
const smokeVersion = smokePositions.version;
world.update(1, 0.1, { ...sinking, progress: 1 }, cameraPosition, false);
expect(smokePositions.version).toBeGreaterThan(smokeVersion);
expect((scene.fog as FogExp2).density).toBeCloseTo(0.012);
expect(skyUniforms.uSunVisibility!.value).toBe(1);
```

In the disposal test, delete the `rain` lookup and remove `rain.geometry` and `rain.material` from the observed resource arrays. Keep these particle assertions:

```ts
const spray = scene.getObjectByName('sea-spray') as Points;

const geometryDisposals = observeDisposals([
  ...ownedTask6Geometries,
  ocean.geometry,
  spray.geometry,
]);
const ownedMaterialDisposals = observeDisposals([
  ...ownedTask6Materials,
  ocean.material as Material,
  spray.material as Material,
]);

expect(scene.getObjectByName('rain')).toBeUndefined();
expect(scene.getObjectByName('sea-spray')).toBeUndefined();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
bunx vitest run tests/world.test.ts
```

Expected: FAIL in `keeps physical sinking effects while rendering calm sunny weather` because the scene still contains `rain` and the squall palette exposes a sun visibility below `0.2`.

- [ ] **Step 3: Implement the calm daytime environment**

In `src/world/Environment.ts`, import `SkyState` with `SkyPalette`, remove `RAIN_DROP_COUNT`, and add the shared state after `SPRAY_DROP_COUNT`:

```ts
import type { SkyPalette, SkyState } from './skyPalette';

const SPRAY_DROP_COUNT = 220;
const SCAVENGE_SKY_STATE: Readonly<SkyState> = Object.freeze({
  weather: 'calm',
  phase: 'day',
  severity: 0,
});
```

Replace the weather-owned fields with:

```ts
private readonly spray: Points<BufferGeometry, PointsMaterial>;
private readonly sprayPositions: Float32Array;
private readonly sky: Skybox;
private readonly keyLight: DirectionalLight;
private readonly fillLight: HemisphereLight;
private readonly fallbackBackground = new Color();
private readonly atmosphereFog: FogExp2;
```

Replace the constructor setup through the light creation with:

```ts
this.previousBackground = scene.background;
this.previousFog = scene.fog;
this.sky = new Skybox(scene, SCAVENGE_SKY_STATE, moonTexture);
const atmosphere = this.sky.palette;
this.fallbackBackground.copy(atmosphere.horizonColor);
this.atmosphereFog = new FogExp2(atmosphere.fogColor, atmosphere.fogDensity);
scene.background = this.fallbackBackground;
scene.fog = this.atmosphereFog;

this.fillLight = new HemisphereLight(
  atmosphere.ambientLightColor,
  0x182226,
  atmosphere.ambientLightIntensity,
);
this.keyLight = new DirectionalLight(
  atmosphere.keyLightColor,
  atmosphere.keyLightIntensity,
);
this.keyLight.position.set(-12, 18, 8);
```

Delete the rain construction block. Keep the existing shadow configuration and sea-spray construction.

Delete the rain update block. Update the sky with the immutable sunny state and copy its palette into scene fog and lights:

```ts
this.sky.resetTransient();
const atmosphere = this.sky.update(
  delta,
  SCAVENGE_SKY_STATE,
  cameraPosition,
);
this.fallbackBackground.copy(atmosphere.horizonColor);
this.atmosphereFog.color.copy(atmosphere.fogColor);
this.atmosphereFog.density = atmosphere.fogDensity;
this.fillLight.color.copy(atmosphere.ambientLightColor);
this.fillLight.intensity = atmosphere.ambientLightIntensity;
this.keyLight.color.copy(atmosphere.keyLightColor);
this.keyLight.intensity = atmosphere.keyLightIntensity;
```

Replace `dispose()` with the rain-free ownership path:

```ts
dispose(): void {
  if (this.disposed) return;
  this.disposed = true;
  this.spray.geometry.dispose();
  this.spray.material.dispose();
  this.sky.dispose();
  this.scene.remove(this.spray, this.keyLight, this.fillLight);
  if (this.scene.background === this.fallbackBackground) {
    this.scene.background = this.previousBackground;
  }
  if (this.scene.fog === this.atmosphereFog) {
    this.scene.fog = this.previousFog;
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
bunx vitest run tests/world.test.ts
```

Expected: PASS with no warnings or unhandled errors.

- [ ] **Step 5: Review the diff and commit the weather change**

Run:

```powershell
git diff --check
git diff -- src/world/Environment.ts tests/world.test.ts
git add -- src/world/Environment.ts tests/world.test.ts
git commit --only -m "feat: make scavenging weather sunny" -- src/world/Environment.ts tests/world.test.ts
```

Expected: `git diff --check` prints nothing, the diff contains no survival files, and the commit includes two files.

---

### Task 2: Verify sunny scavenging and survival isolation

**Files:**
- Verify: `src/world/Environment.ts`
- Verify: `tests/world.test.ts`
- Verify unchanged: `src/survival/BoatWorld.ts`, `src/survival/SurvivalPhase.ts`, `src/survival/survivalBalance.ts`

**Interfaces:**
- Consumes: the sunny scavenging `Environment` from Task 1.
- Produces: automated and visual evidence that scavenging is sunny and survival weather retains its existing behavior.

- [ ] **Step 1: Run the complete automated verification suite**

Run each command and stop on the first failure:

```powershell
bun run test
bun run typecheck
bun run build
```

Expected: each command exits `0`; Vitest reports no failed tests, TypeScript reports no errors, and Vite completes the production build.

- [ ] **Step 2: Start the local game for browser inspection**

Run:

```powershell
bun run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL and serves the game without startup errors.

- [ ] **Step 3: Inspect the title and scavenging scenes**

Open the local URL at `1280x720`. Confirm the title and active scavenging scenes show a bright daytime sky and visible sun. Confirm the scene contains no rain, sea spray remains near the hull, ship interiors and item models remain readable, and the ocean colors match the horizon.

Let the scavenging timer advance enough to make sinking motion visible. Confirm the ship still sinks and rolls, the waves and lifeboat still move, the alarm still pulses, and the sky stays sunny.

- [ ] **Step 4: Inspect survival weather isolation**

Evacuate into survival. Confirm the survival HUD still reports its weather, the boat sky and ocean match that weather, and day or night transitions follow the existing survival flow. Use **Start From the Ship** and confirm the new scavenging run returns to sunny daylight without rain.

- [ ] **Step 5: Record the final repository state**

Run:

```powershell
git status --short
git log -2 --oneline
```

Expected: the sunny weather implementation commit appears in the log. The status contains no uncommitted changes from this plan; preserve unrelated pre-existing files or edits without staging them.
