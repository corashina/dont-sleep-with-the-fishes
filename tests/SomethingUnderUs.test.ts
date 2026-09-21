import { describe, expect, it, vi } from 'vitest';
import { Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { DEFAULT_WAVES, sampleWaveFieldInto } from '../src/ocean/WaveField';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
import { eligibleEvents } from '../src/survival/eventSelection';
import { validateSurvivalEventCatalog } from '../src/survival/eventCatalogValidation';
import { SomethingUnderUsPresentation } from '../src/survival/events/SomethingUnderUsPresentation';
import { createUnderUsPose, sampleUnderUsReveal } from '../src/survival/events/underUsChoreography';
import { deriveEventOutcomePresentation } from '../src/survival/eventPresentationOutcome';
import { setLanguage } from '../src/i18n/language';
import { formatJournalEntry } from '../src/survival/journal';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';

function session(hunger = 0, ...items: ItemId[]): SurvivalSession {
  return new SurvivalSession(items.map((type, i) => ({ type, instanceId: `${type}-${i + 1}` as ItemInstanceId })), {
    seed: 51, initialEventId: 'something-under-us',
    initial: { day: 8, pressure: 1, hunger },
  });
}

describe('Something Under Us rules', () => {
  it.each([[0, 2], [60, 1], [80, 1]])('charges one dawn energy without reducing wake-up energy below one at hunger %s, including after saving', (hunger, energy) => {
    const run = session(hunger);
    const health = run.snapshot().health;
    const hull = run.snapshot().hull;
    const result = run.resolveEvent({ kind: 'endure' });
    expect(result).toMatchObject({ accepted: true, nextDawnEnergy: energy });
    expect(run.snapshot()).toMatchObject({ health, hull });
    const restored = SurvivalSession.restore(run.exportCheckpoint());
    expect(restored.beginDawn().accepted).toBe(true);
    expect(restored.snapshot().energy).toBe(energy);
    expect(restored.exportCheckpoint().nextDawnEnergyOverride).toBeNull();
  });

  it('uses exactly one bait and preserves normal sleep', () => {
    const run = session(0, 'baitTin');
    const before = run.snapshot();
    const result = run.resolveEvent({ kind: 'item', choiceId: 'baitTin', instanceId: 'baitTin-1' });
    expect(result.accepted).toBe(true);
    expect(run.snapshot()).toMatchObject({ bait: before.bait - 1, health: before.health, hull: before.hull });
    expect(run.snapshot().inventory['baitTin-1']?.condition).toBe('consumed');
    run.beginDawn();
    expect(run.snapshot().energy).toBe(3);
  });

  it('rejects unavailable bait without changing the event', () => {
    const run = session();
    const before = run.snapshot();
    expect(run.resolveEvent({ kind: 'item', choiceId: 'baitTin', instanceId: 'baitTin-1' }).accepted).toBe(false);
    expect(run.snapshot()).toEqual(before);
  });

  it('rejects the removed flashlight choice without changing the session', () => {
    const run = session(0, 'flashlight');
    const before = run.snapshot();
    expect(run.resolveEvent({ kind: 'item', choiceId: 'flashlight', instanceId: 'flashlight-1' }).accepted).toBe(false);
    expect(run.snapshot()).toEqual(before);
  });

  it('enforces the day, pressure, cooldown and appearance limits', () => {
    const event = survivalEventById('something-under-us')!;
    const base = {
      phase: 'night' as const, day: 8, weather: 'calm' as const, lastEventId: null,
      lastSeenDay: new Map<string, number>(), targetableItemIds: new Set<ItemId>(),
      appearanceCounts: new Map<string, number>(), inventoryItemIds: new Set<ItemId>(), rescueLead: 0, pressure: 1,
    };
    expect(eligibleEvents([event], base)).toHaveLength(1);
    for (const overrides of [
      { day: 7 }, { pressure: 0 }, { day: 14, lastSeenDay: new Map([[event.id, 8]]) },
      { appearanceCounts: new Map([[event.id, 2]]) },
    ]) expect(eligibleEvents([event], { ...base, ...overrides })).toHaveLength(0);
  });

  it('rejects contradictory and daytime dawn penalties', () => {
    const event = survivalEventById('something-under-us')!;
    const still = event.choices.find(({ id }) => id === 'sleep')!;
    expect(() => validateSurvivalEventCatalog([{ ...event, phase: 'day', choices: [still] }])).toThrow(/outside a night/);
    expect(() => validateSurvivalEventCatalog([{ ...event, choices: [{ ...still, outcomes: [{
      ...still.outcomes[0]!, effects: { nextDawnEnergyReduction: 1, nextDawnEnergy: 3 },
    }] }] }])).toThrow(/cannot combine/);
  });

  it.each(['en', 'pl', 'es-AR'] as const)('records all three outcomes in the %s journal', (language) => {
    setLanguage(language);
    try {
      for (const item of [undefined, 'baitTin', 'cannedFood'] as const) {
        const run = item === undefined ? session() : session(0, item);
        run.resolveEvent(item === undefined ? { kind: 'endure' } : {
          kind: 'item', choiceId: item, instanceId: `${item}-1`,
        });
        run.beginDawn();
        const entry = run.snapshot().journalEntries[0]!;
        expect(() => formatJournalEntry(entry)).not.toThrow();
        expect(JSON.stringify(formatJournalEntry(entry))).not.toMatch(/underUs|undefined/);
      }
    } finally { setLanguage('en'); }
  });
});

function presentation(movingWater = false) {
  const boatEffectsRoot = new Group();
  const cameraEffectsRoot = new Group();
  const event = new SomethingUnderUsPresentation({
    boatEffectsRoot, cameraEffectsRoot, readWorldWaveAmplitudeScale: () => movingWater ? 2 : 0,
    sampleWorldWaveInto: (wave, time, x, z, amplitude) => {
      if (movingWater) sampleWaveFieldInto(wave, DEFAULT_WAVES, time, x, z, amplitude);
      else { wave.height = 0.3; wave.displacementX = 0; wave.displacementZ = 0; }
    },
  });
  event.stage({ eventId: 'something-under-us', targetInstanceId: null, variantSeed: 1 });
  return { event, boatEffectsRoot, cameraEffectsRoot };
}

describe('Something Under Us presentation', () => {
  it('rejects flashlight animation', async () => {
    const { event } = presentation();
    expect(await event.playItemUse('flashlight', 'flashlight-1')).toBe(false);
    event.dispose();
  });
  it('starts visible on the orbit and holds its opacity throughout reveal', () => {
    const pose = createUnderUsPose();
    sampleUnderUsReveal(0, pose);
    expect(pose.opacity).toBeGreaterThan(0.8);
    const opacity = pose.opacity;
    sampleUnderUsReveal(0.8, pose);
    expect(pose.radius).toBeGreaterThanOrEqual(12);
    expect(pose.roll).toBeLessThan(0);
    sampleUnderUsReveal(1, pose);
    expect(pose.opacity).toBe(opacity);
    expect(pose).toMatchObject({ radius: 12, lift: 0.19, roll: -0 });
  });

  it('follows the water, lifts the boat and restores all transforms on clear', async () => {
    const { event, boatEffectsRoot, cameraEffectsRoot } = presentation();
    const reveal = event.reveal();
    event.update(6, 6);
    await reveal;
    expect(boatEffectsRoot.position.y).toBeCloseTo(0.19);
    expect(cameraEffectsRoot.position.y).toBeCloseTo(0.19);
    const shadow = event.worldRoot.getObjectByName('under-us-sea-shadow') as Mesh;
    expect(shadow.geometry.attributes.position!.getY(0)).toBeCloseTo(0.365);
    event.clear();
    expect(event.worldRoot.visible).toBe(false);
    expect(boatEffectsRoot.position.length()).toBe(0);
    expect(cameraEffectsRoot.position.length()).toBe(0);
    event.dispose();
  });

  // Importance: 95/100. Prevents the reported hull clipping across a complete orbit.
  it('circles through every quadrant while moving waves keep the entire mesh outside the hull', () => {
    const { event } = presentation(true);
    event.reveal(); event.skip();
    const shadow = event.worldRoot.getObjectByName('under-us-sea-shadow') as Mesh;
    const positions = shadow.geometry.attributes.position!;
    const material = shadow.material as import('three').ShaderMaterial;
    const opacity = material.uniforms.opacity!.value;
    expect(opacity).toBeGreaterThan(0.8);
    const quadrants = new Set<string>();
    for (let time = 0; time < 50; time += 0.25) {
      event.update(time, 0.25);
      let clearance = Infinity;
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const z = positions.getZ(index);
        clearance = Math.min(clearance, Math.hypot(x, z));
      }
      expect(clearance).toBeGreaterThan(5);
      expect(material.uniforms.opacity!.value).toBe(opacity);
      // Track one body point; the center of a complete coil remains at the boat.
      quadrants.add(`${Math.sign(positions.getX(0))},${Math.sign(positions.getZ(0))}`);
    }
    expect(quadrants.size).toBe(4);
    event.dispose();
  });

  // Importance: 95/100. Opacity alone does not keep the shadow in the player's view.
  it.each([16 / 9, 9 / 16])('keeps black body in the player view for a full orbit at aspect %s', (aspect) => {
    const { event } = presentation(true);
    event.reveal(); event.skip();
    const camera = new PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.set(0, 1.29, 0.96);
    camera.lookAt(0, 1.29, -1.55);
    camera.updateMatrixWorld(true);
    const shadow = event.worldRoot.getObjectByName('under-us-sea-shadow') as Mesh;
    const positions = shadow.geometry.attributes.position!;
    const uvs = shadow.geometry.attributes.uv!;
    const point = new Vector3();
    for (let time = 0; time < 40; time += 0.2) {
      event.update(time, 0.2);
      let visibleBodyPoints = 0;
      for (let index = 0; index < positions.count; index += 1) {
        // The central strip is the black body, away from eyes, teeth and soft edges.
        if (Math.abs(uvs.getY(index) - 0.5) > 0.025) continue;
        point.fromBufferAttribute(positions, index).project(camera);
        if (Math.abs(point.x) < 0.9 && point.y > -0.9 && point.y < 0 && point.z > -1 && point.z < 1) {
          visibleBodyPoints += 1;
        }
      }
      expect(visibleBodyPoints).toBeGreaterThan(3);
    }
    event.dispose();
  });

  it.each(['baitTin', 'cannedFood', 'sleep'] as const)('finishes %s without leaving a shadow or boat offset', async (choice) => {
    const { event, boatEffectsRoot } = presentation();
    const run = choice === 'sleep' ? session() : session(0, choice);
    event.reveal(); event.skip();
    if (choice !== 'sleep') {
      const item = event.playItemUse(choice, `${choice}-1`);
      expect(Math.hypot(event.itemAimTarget.position.x, event.itemAimTarget.position.z)).toBeGreaterThan(12);
      event.settleForVisibilityChange();
      expect(await item).toBe(true);
    }
    const before = run.snapshot();
    const outcome = run.resolveEvent(choice === 'sleep' ? { kind: 'endure' } : {
      kind: 'item', choiceId: choice, instanceId: `${choice}-1`,
    });
    const result = deriveEventOutcomePresentation(before, run.snapshot(), outcome, null);
    const reaction = event.react(result);
    event.settleForVisibilityChange();
    await reaction;
    expect(boatEffectsRoot.position.y).toBe(0);
    const shadow = event.worldRoot.getObjectByName('under-us-sea-shadow') as Mesh;
    expect((shadow.material as import('three').ShaderMaterial).uniforms.opacity!.value).toBe(0);
    event.dispose();
  });

  it('cancels pending work and disposes owned resources once', async () => {
    const { event } = presentation();
    const shadow = event.worldRoot.getObjectByName('under-us-sea-shadow') as Mesh;
    const geometry = vi.spyOn(shadow.geometry, 'dispose');
    const material = vi.spyOn(shadow.material as import('three').ShaderMaterial, 'dispose');
    const pending = event.playItemUse('baitTin', 'baitTin-1');
    event.dispose(); event.dispose();
    expect(await pending).toBe(false);
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
  });
});
