import { describe,expect,it,vi } from 'vitest';
import { Group,Mesh,PerspectiveCamera,Scene,Texture,Vector3 } from 'three';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SURVIVAL_EVENTS,survivalEventById } from '../src/survival/eventCatalog';
import { eligibleEvents } from '../src/survival/eventSelection';
import { validateSurvivalEventCatalog } from '../src/survival/eventCatalogValidation';
import { OceanOfBloodPresentation,BLOOD_OCEAN_REVEAL_SECONDS } from '../src/survival/events/OceanOfBloodPresentation';
import type { DedicatedEventEnvironment } from '../src/survival/eventPresentationTypes';
import { deriveEventOutcomePresentation } from '../src/survival/eventPresentationOutcome';
import { Skybox } from '../src/world/Skybox';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { HIGH_WATER_LOOK } from '../src/ocean/highWaterLook';
import type { ItemId,ItemInstanceId } from '../src/game/ItemState';

function session(hunger = 0, item?: ItemId): SurvivalSession {
  return new SurvivalSession(item ? [{ type: item, instanceId: `${item}-1` as ItemInstanceId }] : [], {
    seed: 51, initialEventId: 'ocean-of-blood',
    initial: { day: 12, pressure: 2, hunger },
  });
}

describe('Ocean of Blood rules', () => {
  it('offers only the net and wait, and searches without damaging the net', () => {
    expect(survivalEventById('ocean-of-blood')!.choices.map(choice => choice.id)).toEqual(['fishingNet', 'sleep']);
    const run = session(0, 'fishingNet');
    const before = run.snapshot();
    expect(run.resolveEvent({ kind: 'item', choiceId: 'fishingNet', instanceId: 'fishingNet-1' })).toMatchObject({
      accepted: true, deltas: { food: 1, pressure: 1 }, eventResult: { resultId: 'blood-ocean-searched' },
    });
    expect(run.snapshot()).toMatchObject({
      food: before.food + 1, pressure: 3, health: before.health, hull: before.hull,
      inventory: { 'fishingNet-1': { condition: 'usable' } },
    });
    run.beginDawn();
    expect(run.snapshot().energy).toBe(3);
  });

  it.each([[0, 2], [60, 2], [80, 1]])('caps dawn energy at hunger %s across a checkpoint', (hunger, energy) => {
    const run = session(hunger);
    expect(run.resolveEvent({ kind: 'endure' })).toMatchObject({
      accepted: true, nextDawnEnergy: energy, eventResult: { resultId: 'blood-ocean-waited' },
    });
    const restored = SurvivalSession.restore(run.exportCheckpoint());
    expect(restored.beginDawn().accepted).toBe(true);
    expect(restored.snapshot().energy).toBe(energy);
    expect(restored.exportCheckpoint().nextDawnEnergyOverride).toBeNull();
  });

  it.each(['fishingNet', 'flareGun', 'flashlight'] as const)('rejects an unavailable choice: %s', (item) => {
    const run = session(0, item === 'fishingNet' ? undefined : item);
    const before = run.snapshot();
    expect(run.resolveEvent({ kind: 'item', choiceId: item, instanceId: `${item}-1` }).accepted).toBe(false);
    expect(run.snapshot()).toEqual(before);
  });

  it('draws only at night from day 12 with pressure 2, at most once', () => {
    const event = survivalEventById('ocean-of-blood')!;
    const criteria = {
      phase: 'night' as const, day: 12, pressure: 2, weather: 'calm' as const,
      lastEventId: null, lastSeenDay: new Map<string, number>(), appearanceCounts: new Map<string, number>(),
      targetableItemIds: new Set<ItemId>(), inventoryItemIds: new Set<ItemId>(), rescueLead: 0,
    };
    expect(eligibleEvents([event], criteria)).toEqual([event]);
    expect(eligibleEvents([event], { ...criteria, day: 11 })).toEqual([]);
    expect(eligibleEvents([event], { ...criteria, phase: 'day' })).toEqual([]);
    expect(eligibleEvents([event], { ...criteria, pressure: 1 })).toEqual([]);
    expect(eligibleEvents([event], { ...criteria, day: 30, appearanceCounts: new Map([[event.id, 1]]) })).toEqual([]);
  });

  it.each([-1, 1.5, 5])('rejects an invalid energy cap: %s', (maximumNextDawnEnergy) => {
    const catalog = structuredClone(SURVIVAL_EVENTS);
    const event = catalog.find(event => event.id === 'ocean-of-blood')!;
    Object.assign(event.choices[1]!.outcomes[0]!.effects, { maximumNextDawnEnergy });
    expect(() => validateSurvivalEventCatalog(catalog)).toThrow(/maximumNextDawnEnergy/);
  });
});

function presentation() {
  const intensity = vi.fn();
  const camera = new PerspectiveCamera();
  camera.position.set(0, 1.8, 0);
  const sample = vi.fn((wave, _time, x, z) => {
    wave.height = x * 0.01 + z * 0.005;
    wave.normal.x = 0.01; wave.normal.y = 1; wave.normal.z = 0.005;
  });
  const event = new OceanOfBloodPresentation({
    setBloodOceanIntensity: intensity, camera,
    sampleWorldWaveInto: sample, readWorldWaveAmplitudeScale: () => 1,
  } as unknown as DedicatedEventEnvironment);
  event.stage({ eventId: 'ocean-of-blood', targetInstanceId: null, variantSeed: 31 });
  return { event, intensity, sample, camera };
}

describe('Ocean of Blood presentation', () => {
  it('starts fully red before reveal and keeps the atmosphere red throughout reveal', async () => {
    const { event, intensity } = presentation();
    try {
      expect(intensity).toHaveBeenLastCalledWith(1);
      const reveal = event.reveal();
      for (const time of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        event.update(time, time === 0 ? 0 : 1);
        expect(intensity).toHaveBeenLastCalledWith(1);
      }
      await reveal;
    } finally {
      event.dispose();
    }
  });

  it('frames the nearest body during reveal and restores the camera when interrupted', async () => {
    const { event, camera, intensity } = presentation();
    const original = camera.quaternion.clone();
    const originalPosition = camera.position.clone();
    const reveal = event.reveal();
    event.update(4.5, 4.5);
    expect(camera.quaternion.angleTo(original)).toBeGreaterThan(0.1);
    expect(camera.position.y).toBeGreaterThan(originalPosition.y);
    event.clear();
    await reveal;
    expect(camera.quaternion.angleTo(original)).toBeLessThan(0.0001);
    expect(camera.position).toEqual(originalPosition);
    expect(intensity).toHaveBeenLastCalledWith(0);
    event.dispose();
  });

  it('reveals twelve floating bodies, aims at the tin, and returns a captured tin with the net', async () => {
    const { event, intensity, sample } = presentation();
    const reveal = event.reveal();
    event.update(9, BLOOD_OCEAN_REVEAL_SECONDS);
    await reveal;
    expect(intensity).toHaveBeenLastCalledWith(1);
    expect(event.worldRoot.visible).toBe(true);
    expect(event.worldRoot.children.filter(child => child.name.startsWith('blood-ocean-body-'))).toHaveLength(12);
    expect(sample).toHaveBeenCalledTimes(24);
    const tin = event.worldRoot.getObjectByName('blood-ocean-sealed-tin')!;
    expect(event.itemAimTarget.position.distanceTo(tin.getWorldPosition(new Vector3()))).toBeLessThan(0.001);
    const net = new Group();
    event.netCatch()!.capture(net);
    expect(tin.parent).toBe(net);
    event.netCatch()!.capture(net);
    expect(net.children).toHaveLength(1);
    event.netCatch()!.release();
    expect(tin.parent).toBe(event.worldRoot);
    expect(tin.visible).toBe(false);
    event.dispose();
    expect(intensity).toHaveBeenLastCalledWith(0);
  });

  it('keeps distant bodies apart on both sides of the view', async () => {
    const { event } = presentation();
    const reveal = event.reveal();
    event.settleForVisibilityChange();
    await reveal;
    const bodies = event.worldRoot.children.filter(child => child.name.startsWith('blood-ocean-body-'));
    const distant = bodies.slice(1);
    expect(distant.filter(body => body.position.x < -3)).toHaveLength(5);
    expect(distant.filter(body => body.position.x > 3)).toHaveLength(5);
    expect(distant.every(body => body.position.z <= -8)).toBe(true);
    for (let index = 0; index < bodies.length; index += 1) {
      for (const other of bodies.slice(index + 1)) {
        expect(bodies[index]!.position.distanceTo(other.position)).toBeGreaterThan(4);
      }
    }
    const coats = bodies.map(body => body.getObjectByName('torn-coat') as Mesh);
    expect(new Set(coats.map(coat => coat.material)).size).toBe(5);
    expect(new Set(coats.map(coat => coat.geometry)).size).toBe(1);
    event.dispose();
  });

  it('settles reveal, clears pending actions, and disposes geometry once', async () => {
    const { event, intensity } = presentation();
    const geometry = (event.worldRoot.getObjectByName('torn-coat') as Mesh).geometry;
    const dispose = vi.spyOn(geometry, 'dispose');
    const reveal = event.reveal();
    event.settleForVisibilityChange();
    await reveal;
    expect(intensity).toHaveBeenLastCalledWith(1);
    const use = event.playItemUse('fishingNet', 'fishingNet-1');
    event.clear();
    expect(await use).toBe(false);
    expect(event.worldRoot.visible).toBe(false);
    expect(intensity).toHaveBeenLastCalledWith(0);
    event.dispose();
    event.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('clears the blood and bodies after waiting', async () => {
    const { event, intensity } = presentation();
    const run = session();
    const before = run.snapshot();
    const outcome = run.resolveEvent({ kind: 'endure' });
    const reveal = event.reveal();
    event.settleForVisibilityChange();
    await reveal;
    const reaction = event.react(deriveEventOutcomePresentation(before, run.snapshot(), outcome, null));
    event.update(14, 4.5);
    await reaction;
    expect(event.worldRoot.visible).toBe(false);
    expect(intensity).toHaveBeenLastCalledWith(0);
    event.dispose();
  });

  it('restores sky colors after blood, including a weather change', () => {
    const texture = new Texture();
    const state = { weather: 'overcast' as const, phase: 'night' as const, severity: 0 };
    const sky = new Skybox(new Scene(), state, texture);
    const control = new Skybox(new Scene(), state, texture);
    const camera = new Vector3();
    try {
      sky.setBloodOceanIntensity(1);
      sky.update(2, state, camera);
      expect(sky.palette.horizonColor.r).toBeGreaterThan(sky.palette.horizonColor.b);
      expect(sky.material.uniforms.uStarVisibility!.value).toBeGreaterThan(0);
      expect(sky.palette.cloudCoverage).toBe(0);
      expect(sky.palette.moonVisibility).toBe(0);
      expect(sky.palette.haze).toBeCloseTo(0.12);
      expect(sky.material.uniforms.uBloodOceanIntensity!.value).toBe(1);
      const next = { ...state, weather: 'calm' as const };
      sky.update(2, next, camera);
      sky.setBloodOceanIntensity(0);
      expect(sky.material.uniforms.uBloodOceanIntensity!.value).toBe(0);
      sky.update(2, next, camera);
      control.update(2, next, camera);
      expect(sky.palette).toEqual(control.palette);
      expect(sky.material.uniforms.uHorizonColor!.value).toEqual(control.palette.horizonColor);
    } finally { sky.dispose(); control.dispose(); texture.dispose(); }
  });

  it('preserves the blood effect across quality switches and restores normal High fog', () => {
    const ocean = new OceanRenderer('low');
    const color = HIGH_WATER_LOOK.day.sunColor;
    try {
      ocean.setBloodOceanIntensity(1);
      ocean.setQuality('high');
      ocean.update(1, 1, 0.025, {
        phase: 'night', fogColor: color, horizonColor: color, skyColor: color, sunColor: color, sunVisibility: 0,
      });
      expect(ocean.material.uniforms.uBloodOceanIntensity!.value).toBe(1);
      expect(ocean.material.uniforms.uFogColor!.value).toEqual(color);
      expect(ocean.material.uniforms.uHorizonColor!.value).toEqual(color);
      ocean.setBloodOceanIntensity(0);
      ocean.update(2, 1, 0.025);
      expect(ocean.material.uniforms.uFogColor!.value).toEqual(HIGH_WATER_LOOK.day.fogColor);
    } finally { ocean.dispose(); }
  });
});
