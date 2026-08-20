# Midnight Tour Choreography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build slower Midnight Tour chest and monster scenes, then reveal the boat only after dawn.

**Architecture:** `MidnightTourPresentation` owns explicit visual timelines and emits typed sound cues. `SurvivalAudio` owns cue playback, while `SurvivalPhase` keeps deferred state hidden until the normal dawn transition completes.

**Tech Stack:** TypeScript 5.9, Three.js 0.180, Vite 7, Vitest 3, Web Audio, glTF Transform 4.

**Spec:** `docs/superpowers/specs/2026-08-20-midnight-tour-choreography-design.md`

## Global Constraints

- Read `VISUAL_STYLE_GUIDE.md` before changing the scene.
- Start execution in an isolated worktree through `superpowers:using-git-worktrees`.
- Preserve unrelated user changes from the main worktree.
- Keep the event automatic after the island click.
- Use the standard 2.5-second fade in both directions.
- Keep `calm` weather throughout Midnight Tour.
- Keep chest and monster result weights at 80 and 20.
- Keep monster damage as an inclusive random range from 25 through 45.
- Use the current `mysteryChest` model for every acquired chest.
- Do not add player control, prompts, skip controls, or quick-time actions.
- Do not add a general cutscene framework.
- Do not add reduced-motion behavior.
- Do not retain procedural shovel or monster fallbacks.
- Do not allocate objects during per-frame scene updates.
- Use only the three approved Freesound sources.

---

### Task 1: Import the required models and sounds

**Files:**
- Modify: `scripts/poly-pizza-event-models.mjs`
- Modify: `scripts/event-model-lock.json`
- Modify: `scripts/fetch-event-models.ps1`
- Modify: `scripts/check-event-models.mjs`
- Modify: `scripts/fetch-audio-assets.mjs`
- Modify: `src/world/focusedEventModelMetadata.ts`
- Modify: `src/world/eventModelManifest.ts`
- Modify: `src/audio/audioManifest.ts`
- Modify: `src/survival/eventBundleManifest.ts`
- Modify: `src/assets/models/events/event-model-metadata.json`
- Create: `src/assets/models/events/midnightShovel.glb`
- Create: `src/assets/models/events/midnightMonster.glb`
- Create: `src/assets/audio/midnightShovel.mp3`
- Create: `src/assets/audio/midnightMonsterRun.mp3`
- Create: `src/assets/audio/midnightMonsterAttack.mp3`
- Modify: `src/assets/ATTRIBUTION.md`
- Test: `tests/EventModelAudit.test.ts`
- Test: `tests/EventBundleManifest.test.ts`
- Test: `tests/AudioSystem.test.ts`

**Interfaces:**
- Consumes: the existing Poly Pizza event-model pipeline and Freesound fetcher.
- Produces: `EventModelId` values `midnightShovel` and `midnightMonster`.
- Produces: `SoundId` values `midnightShovel`, `midnightMonsterRun`, and `midnightMonsterAttack`.
- Produces: required monster clips `CharacterArmature|Run` and `CharacterArmature|Run_Attack`.

- [ ] **Step 1: Write failing model and audio manifest tests**

Add these assertions to `tests/EventModelAudit.test.ts`:

```ts
it('registers the required Midnight Tour action models', () => {
  expect(EVENT_MODEL_IDS).toEqual(expect.arrayContaining([
    'midnightShovel',
    'midnightMonster',
  ]));
  expect(EVENT_MODEL_SPECS.midnightShovel).toMatchObject({
    sourceUrl: 'https://poly.pizza/m/oNBQSf87ZJ',
    sourceModelId: 'poly-pizza:4ca5006b-da27-4d96-9042-9672c9776750',
    license: 'CC0 1.0',
  });
  expect(EVENT_MODEL_SPECS.midnightMonster).toMatchObject({
    sourceUrl: 'https://poly.pizza/m/22K0aSZkHV',
    sourceModelId: 'poly-pizza:cf4368cf-b39e-4c9a-8a83-a9c637740eb8',
    license: 'CC-BY 3.0',
  });
  expect(existsSync('src/assets/models/events/midnightShovel.glb')).toBe(true);
  expect(existsSync('src/assets/models/events/midnightMonster.glb')).toBe(true);
  expect(eventMetadata().midnightMonster?.animations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'CharacterArmature|Run' }),
      expect.objectContaining({ name: 'CharacterArmature|Run_Attack' }),
    ]),
  );
});
```

Add this assertion to `tests/EventBundleManifest.test.ts`:

```ts
expect(EVENT_BUNDLE_SPECS['midnight-tour'].sounds).toEqual([
  'midnightShovel',
  'midnightMonsterRun',
  'midnightMonsterAttack',
]);
```

Add this assertion to `tests/AudioSystem.test.ts`:

```ts
expect(EVENT_ONLY_SOUND_IDS).toEqual(expect.arrayContaining([
  'midnightShovel',
  'midnightMonsterRun',
  'midnightMonsterAttack',
]));
expect(AUDIO_MANIFEST.midnightMonsterRun.loop).toBe(true);
expect(AUDIO_MANIFEST.midnightShovel.loop).toBe(false);
expect(AUDIO_MANIFEST.midnightMonsterAttack.loop).toBe(false);
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
npm test -- tests/EventModelAudit.test.ts tests/EventBundleManifest.test.ts tests/AudioSystem.test.ts
```

Expected: FAIL because the five new asset IDs and files do not exist.

- [ ] **Step 3: Extend the pinned Poly Pizza pipeline**

Add these source pages and limits in `scripts/poly-pizza-event-models.mjs`:

```js
midnightShovel: 'https://poly.pizza/m/oNBQSf87ZJ',
midnightMonster: 'https://poly.pizza/m/22K0aSZkHV',
```

Add these exact limit properties:

```js
midnightShovel: 1_000,
midnightMonster: 6_000,

export const EVENT_MODEL_TOTAL_TRIANGLE_LIMIT = 20_000;
```

Update `scripts/fetch-event-models.ps1` so its processed ID list includes both
new IDs. Preserve committed non-processed event GLBs in the staging directory.
Merge their existing metadata with the generated processed metadata before
the exact-directory check. The published directory must still contain every
file accepted by `scripts/check-event-models.mjs`.

Generate the pinned source records:

```powershell
node scripts/poly-pizza-event-models.mjs --write-lock
npm run models:fetch:events
```

Expected source records:

```json
{
  "midnightShovel": {
    "resourceId": "4ca5006b-da27-4d96-9042-9672c9776750",
    "license": "CC0 1.0",
    "pageAnimated": false
  },
  "midnightMonster": {
    "resourceId": "cf4368cf-b39e-4c9a-8a83-a9c637740eb8",
    "license": "CC-BY 3.0",
    "pageAnimated": true
  }
}
```

Do not type hashes or bounds by hand. Commit the values generated from the
pinned binaries.

- [ ] **Step 4: Register the focused models and required clips**

Add the two IDs to `EVENT_MODEL_IDS` in `src/world/eventModelManifest.ts`.
Add these authored presentations:

```ts
midnightShovel: {
  sourceUrl: 'https://poly.pizza/m/oNBQSf87ZJ',
  sourceModelId: 'poly-pizza:4ca5006b-da27-4d96-9042-9672c9776750',
  license: 'CC0 1.0',
  targetLongestDimension: 1.25,
  maxTriangles: 1_000,
  translation: [0, 0, 0],
  rotation: [0, 0, 0],
},
midnightMonster: {
  sourceUrl: 'https://poly.pizza/m/22K0aSZkHV',
  sourceModelId: 'poly-pizza:cf4368cf-b39e-4c9a-8a83-a9c637740eb8',
  license: 'CC-BY 3.0',
  targetLongestDimension: 1.9,
  maxTriangles: 6_000,
  translation: [0, 0.95, 0],
  rotation: [0, 0, 0],
},
```

Copy the generated bounds, triangle counts, and animation metadata into
`src/world/focusedEventModelMetadata.ts`. Add both IDs to the focused-model
validation list in `scripts/check-event-models.mjs`.

- [ ] **Step 5: Add and fetch the three approved sounds**

Append these entries to `freesoundSources` in
`scripts/fetch-audio-assets.mjs`:

```js
['midnightShovel', 'dr19', '353907'],
['midnightMonsterRun', 'gabitomed', '514585'],
['midnightMonsterAttack', 'LucasDuff', '467701'],
```

Add the IDs to `SOUND_IDS` and `EVENT_ONLY_SOUND_IDS`. Add these manifest
definitions:

```ts
midnightShovel: asset('midnightShovel', 'effects', 0.55, false, 1),
midnightMonsterRun: asset('midnightMonsterRun', 'effects', 0.5, true, 1),
midnightMonsterAttack: asset('midnightMonsterAttack', 'effects', 0.72, false, 1),
```

Add this resource entry in `src/survival/eventBundleManifest.ts`:

```ts
'midnight-tour': {
  models: [],
  sounds: [
    'midnightShovel',
    'midnightMonsterRun',
    'midnightMonsterAttack',
  ],
},
```

Fetch only missing files:

```powershell
npm run audio:fetch
```

- [ ] **Step 6: Record provenance and run asset checks**

Add two model rows and three audio rows to `src/assets/ATTRIBUTION.md`. Record
the generated hashes, triangle counts, clip retention, and the six-second
runtime shovel cutoff.

Run:

```powershell
npm run models:check:events
npm test -- tests/EventModelAudit.test.ts tests/EventBundleManifest.test.ts tests/AudioSystem.test.ts
```

Expected: all commands PASS.

- [ ] **Step 7: Commit the asset layer**

```powershell
git add scripts/poly-pizza-event-models.mjs scripts/event-model-lock.json scripts/fetch-event-models.ps1 scripts/check-event-models.mjs scripts/fetch-audio-assets.mjs src/world/focusedEventModelMetadata.ts src/world/eventModelManifest.ts src/audio/audioManifest.ts src/survival/eventBundleManifest.ts src/assets/models/events src/assets/audio/midnightShovel.mp3 src/assets/audio/midnightMonsterRun.mp3 src/assets/audio/midnightMonsterAttack.mp3 src/assets/ATTRIBUTION.md tests/EventModelAudit.test.ts tests/EventBundleManifest.test.ts tests/AudioSystem.test.ts
git commit -m "feat: add Midnight Tour scene assets"
```

---

### Task 2: Route typed presentation cues to SurvivalAudio

**Files:**
- Create: `src/survival/midnightTourAudioCue.ts`
- Modify: `src/survival/FocusedEventPresentation.ts`
- Modify: `src/survival/EventPresentationLayer.ts`
- Modify: `src/survival/BoatWorld.ts`
- Modify: `src/audio/SurvivalAudio.ts`
- Modify: `src/survival/SurvivalPhase.ts`
- Test: `tests/AudioSystem.test.ts`
- Test: `tests/BoatWorld.test.ts`
- Test: `tests/SurvivalPhase.test.ts`

**Interfaces:**
- Consumes: the three sound IDs from Task 1.
- Produces: `MidnightTourAudioCue`.
- Produces: `FocusedEventPresentationDependencies.emitCue(cue): void`.
- Produces: `BoatWorld.setEventCueHandler(handler): void`.
- Produces: `SurvivalAudio.midnightTourCue(cue): void` and `clearMidnightTour(): void`.

- [ ] **Step 1: Write failing cue ownership tests**

Add this audio test harness behavior in `tests/AudioSystem.test.ts`:

```ts
it('owns Midnight Tour sounds and stops each active voice', () => {
  const backend = new FakeAudioBackend();
  const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

  audio.midnightTourCue('dig-start');
  audio.midnightTourCue('dig-start');
  audio.update(6);
  audio.midnightTourCue('run-start');
  audio.midnightTourCue('run-start');
  audio.midnightTourCue('run-stop');
  audio.midnightTourCue('attack');
  audio.clearMidnightTour();

  expect(backend.voices.filter(({ id }) => id === 'midnightShovel')).toHaveLength(1);
  expect(backend.voices.filter(({ id }) => id === 'midnightMonsterRun')).toHaveLength(1);
  expect(backend.voices.filter(({ id }) => id === 'midnightMonsterAttack')).toHaveLength(1);
  expect(backend.voices.find(({ id }) => id === 'midnightShovel')?.stop)
    .toHaveBeenCalledExactlyOnceWith(0.05);
  expect(backend.voices.find(({ id }) => id === 'midnightMonsterRun')?.stop)
    .toHaveBeenCalledExactlyOnceWith(0.05);
});
```

Add a `BoatWorld` test that installs a handler, emits a cue through the active
Midnight Tour dependency, and expects the handler to receive it once.

Add a `SurvivalPhase` test that installs a fake world handler and expects a
`run-start` cue to call the survival audio scope once.

- [ ] **Step 2: Run cue tests and confirm failure**

Run:

```powershell
npm test -- tests/AudioSystem.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts
```

Expected: FAIL because cue types and handlers do not exist.

- [ ] **Step 3: Define the cue contract**

Create `src/survival/midnightTourAudioCue.ts`:

```ts
export const MIDNIGHT_TOUR_AUDIO_CUES = Object.freeze([
  'dig-start',
  'run-start',
  'run-stop',
  'attack',
] as const);

export type MidnightTourAudioCue = typeof MIDNIGHT_TOUR_AUDIO_CUES[number];
export type EventPresentationCue = Readonly<{
  eventId: 'midnight-tour';
  cue: MidnightTourAudioCue;
}>;
```

Add this required dependency in `FocusedEventPresentation.ts`:

```ts
readonly emitCue: (cue: EventPresentationCue) => void;
```

Every production and test dependency object must supply this function. Test
fixtures can use `vi.fn()`.

- [ ] **Step 4: Route cues without coupling presentation to audio**

Add this state and method to `BoatWorld`:

```ts
private eventCueHandler: (cue: EventPresentationCue) => void = () => undefined;

setEventCueHandler(handler: (cue: EventPresentationCue) => void): void {
  this.eventCueHandler = handler;
}
```

When `BoatWorld` creates `EventPresentationLayer`, provide:

```ts
emitCue: (cue) => this.eventCueHandler(cue),
```

During disposal, replace the handler with the no-op function before presenter
cleanup.

- [ ] **Step 5: Implement idempotent audio ownership**

Add these fields and methods to `SurvivalAudio`:

```ts
private midnightDigVoice: AudioVoice | null = null;
private midnightDigRemaining = 0;
private midnightRunActive = false;
private midnightAttackPlayed = false;

midnightTourCue(cue: MidnightTourAudioCue): void {
  if (this.disposed) return;
  if (cue === 'dig-start' && this.midnightDigVoice === null) {
    this.midnightDigVoice = this.scope.play('midnightShovel');
    this.midnightDigRemaining = 6;
  } else if (cue === 'run-start' && !this.midnightRunActive) {
    this.midnightRunActive = true;
    this.scope.startLoop('midnightMonsterRun');
  } else if (cue === 'run-stop') {
    this.midnightRunActive = false;
    this.scope.stopLoop('midnightMonsterRun', 0.05);
  } else if (cue === 'attack' && !this.midnightAttackPlayed) {
    this.midnightAttackPlayed = true;
    this.scope.play('midnightMonsterAttack');
  }
}

clearMidnightTour(): void {
  this.midnightDigVoice?.stop(0.05);
  this.midnightDigVoice = null;
  this.midnightDigRemaining = 0;
  this.midnightRunActive = false;
  this.midnightAttackPlayed = false;
  this.scope.stopLoop('midnightMonsterRun', 0.05);
}
```

Extend `update(deltaSeconds)` to stop `midnightDigVoice` when its six-second
counter reaches zero. Call `clearMidnightTour()` from `clearEvent()` and
`dispose()`.

- [ ] **Step 6: Connect phase ownership and pass tests**

In `SurvivalPhase.initialize`, install this handler after creating
`SurvivalAudio`:

```ts
this.world.setEventCueHandler?.(({ eventId, cue }) => {
  if (eventId === 'midnight-tour') this.audio.midnightTourCue(cue);
});
```

Run:

```powershell
npm test -- tests/AudioSystem.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the cue layer**

```powershell
git add src/survival/midnightTourAudioCue.ts src/survival/FocusedEventPresentation.ts src/survival/EventPresentationLayer.ts src/survival/BoatWorld.ts src/audio/SurvivalAudio.ts src/survival/SurvivalPhase.ts tests/AudioSystem.test.ts tests/BoatWorld.test.ts tests/SurvivalPhase.test.ts
git commit -m "feat: route Midnight Tour audio cues"
```

---

### Task 3: Build the 12-second chest digging timeline

**Files:**
- Create: `src/survival/midnightTourChoreography.ts`
- Modify: `src/survival/MidnightTourPresentation.ts`
- Test: `tests/midnightTourChoreography.test.ts`
- Test: `tests/MidnightTourPresentation.test.ts`

**Interfaces:**
- Consumes: `midnightShovel`, `chestClosed`, and `emitCue` from Tasks 1 and 2.
- Produces: `CHEST_RESULT_DURATION_SECONDS = 12`.
- Produces: `sampleChestStage(elapsedSeconds): MidnightChestStageSample`.
- Produces: a camera-attached group named `midnight-tour-fps-shovel`.

- [ ] **Step 1: Write failing pure timeline tests**

Create `tests/midnightTourChoreography.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CHEST_RESULT_DURATION_SECONDS,
  sampleChestStage,
} from '../src/survival/midnightTourChoreography';

describe('Midnight Tour chest choreography', () => {
  it('uses exact search, dig, and hold boundaries', () => {
    expect(CHEST_RESULT_DURATION_SECONDS).toBe(12);
    expect(sampleChestStage(0)).toMatchObject({ stage: 'search', progress: 0 });
    expect(sampleChestStage(3)).toMatchObject({ stage: 'dig', progress: 0 });
    expect(sampleChestStage(5)).toMatchObject({ stage: 'dig', stroke: 2 });
    expect(sampleChestStage(7)).toMatchObject({ stage: 'dig', stroke: 3 });
    expect(sampleChestStage(9)).toMatchObject({ stage: 'hold', progress: 0 });
    expect(sampleChestStage(12)).toMatchObject({ stage: 'hold', progress: 1 });
  });
});
```

The returned sample is test-only allocation. The presentation must use the
exported scalar boundary functions during frame updates.

- [ ] **Step 2: Write failing presentation tests**

Extend `tests/MidnightTourPresentation.test.ts` with assertions that:

```ts
expect(chest.visible).toBe(true);
expect(new Box3().setFromObject(chest).max.y).toBeLessThan(islandTop);
expect(camera.getObjectByName('midnight-tour-fps-shovel')).toBeDefined();
expect(emitCue).toHaveBeenCalledExactlyOnceWith({
  eventId: 'midnight-tour',
  cue: 'dig-start',
});
expect(new Box3().setFromObject(chest).min.y).toBeCloseTo(islandTop, 4);
expect(camera.getObjectByName('midnight-tour-fps-shovel')).toBeUndefined();
```

Advance the scene to 3, 5, 7, 9, and 12 seconds. Verify one contact at the end
of each two-second dig cycle and exact ground placement after the third.

- [ ] **Step 3: Run chest tests and confirm failure**

Run:

```powershell
npm test -- tests/midnightTourChoreography.test.ts tests/MidnightTourPresentation.test.ts
```

Expected: FAIL because the 12-second stage sampler and shovel do not exist.

- [ ] **Step 4: Implement exact scalar choreography**

Create `src/survival/midnightTourChoreography.ts` with these public values:

```ts
export const CHEST_SEARCH_END_SECONDS = 3;
export const CHEST_DIG_END_SECONDS = 9;
export const CHEST_RESULT_DURATION_SECONDS = 12;
export const CHEST_STROKE_SECONDS = 2;

export function chestDigProgress(elapsedSeconds: number): number {
  return clamp01((elapsedSeconds - CHEST_SEARCH_END_SECONDS) / 6);
}

export function chestStrokeProgress(elapsedSeconds: number): number {
  const digElapsed = Math.max(0, elapsedSeconds - CHEST_SEARCH_END_SECONDS);
  return clamp01((digElapsed % CHEST_STROKE_SECONDS) / CHEST_STROKE_SECONDS);
}

export function chestCompletedStrokes(elapsedSeconds: number): number {
  return Math.min(3, Math.floor(
    Math.max(0, elapsedSeconds - CHEST_SEARCH_END_SECONDS)
      / CHEST_STROKE_SECONDS,
  ));
}
```

Add the discriminated `sampleChestStage` helper used by tests. Reuse the
scalar functions in presentation updates. Do not create a sample object each
frame.

- [ ] **Step 5: Replace the chest result animation**

In `MidnightTourPresentation`:

- Start `result-chest` with `CHEST_RESULT_DURATION_SECONDS`.
- Create the chest before the island fade clears.
- Compute its buried Y from the real chest bounds.
- Keep its maximum Y below the island top at elapsed zero.
- Raise it in three eased increments after contacts.
- Create `midnightShovel` as a required model.
- Attach its holder to the camera during the dig stage.
- Place the holder at `(0.52, -0.42, -0.85)` in camera space.
- Animate one downstroke and recovery during each two-second cycle.
- Emit `dig-start` once when elapsed reaches three seconds.
- Remove and dispose the shovel when elapsed reaches nine seconds.
- Hold the camera on the grounded chest through twelve seconds.

Use cached vectors, matrices, bounds, and quaternions. Do not allocate in
`applyAnimation` or `update`.

- [ ] **Step 6: Pass chest tests**

Run:

```powershell
npm test -- tests/midnightTourChoreography.test.ts tests/MidnightTourPresentation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the chest sequence**

```powershell
git add src/survival/midnightTourChoreography.ts src/survival/MidnightTourPresentation.ts tests/midnightTourChoreography.test.ts tests/MidnightTourPresentation.test.ts
git commit -m "feat: animate Midnight Tour chest excavation"
```

---

### Task 4: Build the 11-second animated monster attack

**Files:**
- Modify: `src/survival/midnightTourChoreography.ts`
- Modify: `src/survival/MidnightTourPresentation.ts`
- Test: `tests/midnightTourChoreography.test.ts`
- Test: `tests/MidnightTourPresentation.test.ts`

**Interfaces:**
- Consumes: `midnightMonster` and cue routing from Tasks 1 and 2.
- Produces: `MONSTER_RESULT_DURATION_SECONDS = 11`.
- Produces: `CharacterArmature|Run` and `CharacterArmature|Run_Attack` mixer actions.
- Produces: an actor named `midnight-tour-monster`.

- [ ] **Step 1: Write failing monster timeline tests**

Add:

```ts
expect(MONSTER_RESULT_DURATION_SECONDS).toBe(11);
expect(sampleMonsterStage(0)).toMatchObject({ stage: 'hear', progress: 0 });
expect(sampleMonsterStage(2)).toMatchObject({ stage: 'turn', progress: 0 });
expect(sampleMonsterStage(4.5)).toMatchObject({ stage: 'run', progress: 0 });
expect(sampleMonsterStage(8.5)).toMatchObject({ stage: 'attack', progress: 0 });
expect(sampleMonsterStage(9.5)).toMatchObject({ stage: 'collapse', progress: 0 });
expect(sampleMonsterStage(11)).toMatchObject({ stage: 'collapse', progress: 1 });
```

Extend presentation tests with fake clips named exactly:

```ts
const track = new QuaternionKeyframeTrack(
  '.quaternion',
  [0, 1],
  [0, 0, 0, 1, 0, 0, 0, 1],
);
const run = new AnimationClip('CharacterArmature|Run', 1, [track]);
const attack = new AnimationClip('CharacterArmature|Run_Attack', 1, [track.clone()]);
```

Import `QuaternionKeyframeTrack` from Three.js. Verify the actor starts behind
the initial camera direction, stays outside the camera,
uses each action once, and emits these cues once:

```ts
[
  { eventId: 'midnight-tour', cue: 'run-start' },
  { eventId: 'midnight-tour', cue: 'run-stop' },
  { eventId: 'midnight-tour', cue: 'attack' },
]
```

- [ ] **Step 2: Run monster tests and confirm failure**

Run:

```powershell
npm test -- tests/midnightTourChoreography.test.ts tests/MidnightTourPresentation.test.ts
```

Expected: FAIL because the monster stages and imported actor do not exist.

- [ ] **Step 3: Add exact monster stage boundaries**

Add:

```ts
export const MONSTER_HEAR_END_SECONDS = 2;
export const MONSTER_TURN_END_SECONDS = 4.5;
export const MONSTER_RUN_END_SECONDS = 8.5;
export const MONSTER_ATTACK_END_SECONDS = 9.5;
export const MONSTER_RESULT_DURATION_SECONDS = 11;
```

Add scalar progress helpers and `sampleMonsterStage`. Clamp all public samples
to the zero-through-duration range.

- [ ] **Step 4: Replace the procedural monster**

Delete `createCreature()` and all procedural body, eye, and leg geometry.
Create the required imported model:

```ts
const selected = this.dependencies.propModels.createEventModel('midnightMonster');
if (selected === null) {
  throw new Error('Missing required Midnight Tour monster model.');
}
const runClip = selected.animations.find(
  ({ name }) => name === 'CharacterArmature|Run',
);
const attackClip = selected.animations.find(
  ({ name }) => name === 'CharacterArmature|Run_Attack',
);
if (runClip === undefined || attackClip === undefined) {
  throw new Error('Midnight Tour monster requires Run and Run_Attack clips.');
}
```

Create one `AnimationMixer`. Cache its run and attack actions. Start the run
action at elapsed zero. Emit `run-start` once at the same boundary.

Place the actor behind the camera and partly behind palms. Move it during Hear,
Turn, and Run. End at a fixed attack distance in front of the camera.

At 8.5 seconds, stop the run action and sound. Start the attack action and
emit `attack`. Keep the actor outside the camera near plane.

During Collapse, lower the camera and apply a small fixed roll and pitch.
End near island ground at 11 seconds.

Update the mixer with `delta` only while the actor exists. Stop and uncache
all actions during clear, interruption, recovery, and disposal.

- [ ] **Step 5: Preserve hidden-tab progress**

Change `MidnightTourPresentation.settleForVisibilityChange()` so it does not
settle an active result timeline. `SurvivalPhase.update` already stops while
the document is hidden. The same elapsed stage must continue after return.

Keep camera restoration in `clear()` and `dispose()`.

- [ ] **Step 6: Pass monster and cleanup tests**

Run:

```powershell
npm test -- tests/midnightTourChoreography.test.ts tests/MidnightTourPresentation.test.ts tests/BoatWorld.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the monster sequence**

```powershell
git add src/survival/midnightTourChoreography.ts src/survival/MidnightTourPresentation.ts tests/midnightTourChoreography.test.ts tests/MidnightTourPresentation.test.ts tests/BoatWorld.test.ts
git commit -m "feat: animate Midnight Tour monster attack"
```

---

### Task 5: Keep the boat hidden until the new day

**Files:**
- Modify: `src/survival/SurvivalPhase.ts`
- Modify: `src/audio/SurvivalAudio.ts`
- Test: `tests/SurvivalPhase.test.ts`
- Test: `tests/SurvivalSession.test.ts`
- Test: `tests/MidnightTourPresentation.test.ts`

**Interfaces:**
- Consumes: completed branch promises and cue cleanup from Tasks 2 through 4.
- Produces: one dedicated Midnight Tour completion path under the standard sleep cover.
- Uses: existing `beginDawn()` without a new session rule.

- [ ] **Step 1: Write failing transition-order tests**

Add a chest and monster case in `tests/SurvivalPhase.test.ts`. Record ordered
calls from fake UI, world, and session methods. Require this suffix:

```ts
expect(calls).toEqual(expect.arrayContaining([
  'world:react:start',
  'world:react:end',
  'ui:cover:true:start',
  'ui:cover:true:end',
  'world:clear-event',
  'session:begin-dawn',
  'world:phase:day',
  'world:settle-covered',
  'ui:cover:false:start',
  'ui:cover:false:end',
]));
```

Use index comparisons for strict order. Also assert:

```ts
expect(calls.indexOf('world:phase:night'))
  .toBeLessThan(calls.indexOf('world:react:start'));
expect(calls.lastIndexOf('world:phase:night'))
  .toBeLessThan(calls.indexOf('ui:cover:true:end'));
expect(snapshotAfterUncover.state).toBe('day');
```

For the chest branch, assert that `world.syncChest('closed')` occurs after
`session:begin-dawn` and before uncover. For the monster branch, assert the
resolved health delta remains inside 25 through 45.

- [ ] **Step 2: Add a regression test for normal session semantics**

In `tests/SurvivalSession.test.ts`, create a Midnight Tour session with each
result roll. Resolve `visit`, then call `beginDawn()`.

```ts
expect(resolution.accepted).toBe(true);
expect(session.snapshot().state).toBe('nightEvent');
expect(session.beginDawn()).toMatchObject({ accepted: true, code: 'dawn' });
expect(session.snapshot().state).toBe('day');
```

This test prevents adding a special session transition.

- [ ] **Step 3: Run transition tests and confirm failure**

Run:

```powershell
npm test -- tests/SurvivalPhase.test.ts tests/SurvivalSession.test.ts
```

Expected: the phase-order test FAILS because the current result path exposes
or synchronizes the boat before the requested dawn order.

- [ ] **Step 4: Implement the dedicated covered completion path**

Keep `resolveMidnightTourVisit()` as the coordinator. After result validation:

1. Start the presentation reaction while uncovering the island.
2. Await the complete 12-second or 11-second branch promise.
3. Finish event reaction audio.
4. Await the standard 2.5-second `setSleepCovered(true)` transition.
5. Call `audio.clearMidnightTour()`.
6. Clear the focused event and restore the camera while covered.
7. Change the cover profile back to `solid` while covered.
8. Call the existing `runDawn(generation)`.
9. Render and settle the day scene while covered.
10. Handle a day event or terminal result through existing helpers.
11. Await the standard 2.5-second `setSleepCovered(false)` transition.
12. Unlock input and restore command focus.

Do not route successful Midnight Tour visits back through the generic tail of
`runEventResolution()`. Keep the recovery method for rejections, invariant
errors, and thrown presentation failures.

Flush deferred presentation state only after the cover becomes fully black.
This keeps the new chest off the night boat and keeps resource meters stable
during the island scene.

- [ ] **Step 5: Confirm calm weather and standard fade timing**

Keep this existing weather assertion in
`tests/MidnightTourPresentation.test.ts`:

```ts
expect(presentationWeatherForEvent('midnight-tour')).toBe('calm');
```

Keep the existing `SurvivalUI` test that advances 2,499 milliseconds, confirms
the promise is pending, then advances one millisecond and confirms completion.
Keep its assertion that the `midnight-tour` profile has no duration override.

- [ ] **Step 6: Pass all focused tests**

Run:

```powershell
npm test -- tests/MidnightTourPresentation.test.ts tests/midnightTourChoreography.test.ts tests/SurvivalPhase.test.ts tests/SurvivalSession.test.ts tests/SurvivalUI.test.ts tests/BoatWorld.test.ts tests/AudioSystem.test.ts tests/EventBundleManifest.test.ts tests/EventModelAudit.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the dawn transition**

```powershell
git add src/survival/SurvivalPhase.ts src/audio/SurvivalAudio.ts tests/SurvivalPhase.test.ts tests/SurvivalSession.test.ts tests/MidnightTourPresentation.test.ts tests/SurvivalUI.test.ts
git commit -m "fix: reveal Midnight Tour results at dawn"
```

---

### Task 6: Verify the complete feature

**Files:**
- No file changes. Return to the owning task when verification fails.
- Test: all project tests and audits.

**Interfaces:**
- Consumes: all deliverables from Tasks 1 through 5.
- Produces: a verified production build with no obsolete procedural creature path.

- [ ] **Step 1: Scan for obsolete and incomplete paths**

Run:

```powershell
rg -n "midnight-tour-creature-body|midnight-tour-creature-leg|midnight-tour-creature-eye|RESULT_DURATION|TO[D]O|TB[D]|\x3c{7}|={7}|\x3e{7}" src tests docs/superpowers/specs/2026-08-20-midnight-tour-choreography-design.md
```

Expected: no procedural creature names, old shared result duration, conflict
markers, or incomplete markers.

- [ ] **Step 2: Run static and asset verification**

Run:

```powershell
npm run typecheck
npm run models:check
npm run thumbnails:check
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```powershell
npm test
```

Expected: PASS with no unhandled promise rejection.

- [ ] **Step 4: Build production output**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite production build PASS.

- [ ] **Step 5: Inspect the final diff**

Run:

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: no whitespace errors. Only planned files remain changed.

If verification fails, do not patch inside Task 6. Return to the task that
owns the failed behavior, repeat its failing test, implementation, passing
test, and commit steps, then restart Task 6.
