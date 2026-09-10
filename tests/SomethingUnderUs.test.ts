import { describe, expect, it, vi } from 'vitest';
import { Group, Mesh } from 'three';
import { FlashlightBeam } from '../src/survival/FlashlightBeam';
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
  it.each([[0, 2], [60, 1], [80, 0]])('charges one dawn energy at hunger %s, including after saving', (hunger, energy) => {
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

  it('damages only the hull when lit and keeps the flashlight', () => {
    const run = session(0, 'flashlight');
    const before = run.snapshot();
    expect(run.resolveEvent({ kind: 'item', choiceId: 'flashlight', instanceId: 'flashlight-1' }).accepted).toBe(true);
    expect(run.snapshot()).toMatchObject({ hull: before.hull - 20, health: before.health });
    expect(run.snapshot().inventory['flashlight-1']?.condition).toBe('usable');
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
      for (const item of [undefined, 'baitTin', 'flashlight'] as const) {
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

function presentation() {
  const boatEffectsRoot = new Group();
  const cameraEffectsRoot = new Group();
  const event = new SomethingUnderUsPresentation({
    boatEffectsRoot, cameraEffectsRoot, readWorldWaveAmplitudeScale: () => 0,
    sampleWorldWaveInto: (wave) => { wave.height = 0.3; wave.displacementX = 0; wave.displacementZ = 0; },
  });
  event.stage({ eventId: 'something-under-us', targetInstanceId: null, variantSeed: 1 });
  return { event, boatEffectsRoot, cameraEffectsRoot };
}

describe('Something Under Us presentation', () => {
  it('gives the flashlight a visible cone aimed beside the bow', () => {
    const { event } = presentation();
    const beam = new FlashlightBeam();
    const actor = new Group();
    actor.position.set(0, 1.5, 2);
    beam.setTarget(event.itemAimTarget);
    event.playItemUse('flashlight', 'flashlight-1');
    beam.updateTarget();
    beam.apply(actor, 1, 1);
    expect(beam.visible).toBe(true);
    expect(beam.light.distance).toBeGreaterThan(5);
    beam.dispose();
    event.dispose();
  });
  it('approaches, signals sensitivity to light, then holds beneath the boat', () => {
    const pose = createUnderUsPose();
    sampleUnderUsReveal(0, pose);
    expect(pose.opacity).toBe(0);
    sampleUnderUsReveal(0.8, pose);
    expect(pose.light).toBeGreaterThan(0);
    expect(pose.roll).toBeLessThan(0);
    sampleUnderUsReveal(1, pose);
    expect(pose).toMatchObject({ x: 0, z: 0, lift: 0.19, light: 0, roll: -0 });
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

  it.each(['baitTin', 'flashlight', 'sleep'] as const)('finishes %s without leaving a shadow or boat offset', async (choice) => {
    const { event, boatEffectsRoot } = presentation();
    const run = choice === 'sleep' ? session() : session(0, choice);
    event.reveal(); event.skip();
    if (choice !== 'sleep') {
      const item = event.playItemUse(choice, `${choice}-1`);
      expect(event.itemAimTarget.position.x).toBe(choice === 'baitTin' ? 10 : -2);
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
    const pending = event.playItemUse('flashlight', 'flashlight-1');
    event.dispose(); event.dispose();
    expect(await pending).toBe(false);
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
  });
});
