import { describe,expect,it,vi } from 'vitest';
import { Mesh,PerspectiveCamera,Scene,Texture,Vector3 } from 'three';
import type { DivePlayOptions } from '../src/survival/DivePresentation';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
import { OceanOfBloodPresentation,BLOOD_OCEAN_REVEAL_SECONDS } from '../src/survival/events/OceanOfBloodPresentation';
import type { DedicatedEventEnvironment } from '../src/survival/eventPresentationTypes';
import { deriveEventOutcomePresentation } from '../src/survival/eventPresentationOutcome';
import { Skybox } from '../src/world/Skybox';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { HIGH_WATER_LOOK } from '../src/ocean/highWaterLook';
import { EMPTY_SURVIVAL_EVENT_MODELS } from '../src/survival/SurvivalEventModelLibrary';
import type { ItemId,ItemInstanceId } from '../src/game/ItemState';
import { resolveEventItemUseContext } from '../src/survival/eventItemUseChoreography';

function session(hunger = 0, item?: ItemId): SurvivalSession {
  return new SurvivalSession(item ? [{ type: item, instanceId: `${item}-1` as ItemInstanceId }] : [], {
    seed: 51, initialEventId: 'ocean-of-blood',
    initial: { day: 19, pressure: 2, hunger },
  });
}

describe('Ocean of Blood rules', () => {
  it('offers salvage, scuba gear and wait, and retrieves only the heart with scuba gear', () => {
    expect(survivalEventById('ocean-of-blood')!.choices.map(choice => choice.id)).toEqual(['fishingNet', 'bucket', 'scubaSet', 'sleep']);
    const run = session(0, 'scubaSet');
    const before = run.snapshot();
    expect(run.resolveEvent({ kind: 'item', choiceId: 'scubaSet', instanceId: 'scubaSet-1' })).toMatchObject({
      accepted: true, deltas: { pressure: 1 }, eventResult: { resultId: 'blood-ocean-searched' },
    });
    expect(run.snapshot()).toMatchObject({
      food: before.food, pressure: 3, health: before.health, hull: before.hull,
      inventory: { 'scubaSet-1': { condition: 'usable' } },
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

  // Importance: 95/100. Salvage must not award the heart or permit a second reward.
  it.each(['fishingNet', 'bucket'] as const)('salvages normal food with %s and consumes the encounter', (item) => {
    const run = session(0, item);
    const before = run.snapshot();
    const response = { kind: 'item', choiceId: item, instanceId: `${item}-1` } as const;
    expect(run.resolveEvent(response)).toMatchObject({ accepted: true, deltas: { food: 1, pressure: 1 } });
    expect(run.snapshot().food).toBe(before.food + 1);
    expect(run.snapshot().heartPieces).toEqual(before.heartPieces);
    expect(run.snapshot().inventory).toEqual(before.inventory);
    expect(run.exportCheckpoint().appearanceCounts['ocean-of-blood']).toBe(1);
    expect(run.resolveEvent(response).accepted).toBe(false);
    expect(resolveEventItemUseContext('ocean-of-blood', item, item)).toBe(item === 'bucket' ? 'bucket-scoop' : 'net-scoop');
  });

  it.each(['scubaSet', 'fishingNet', 'bucket', 'flareGun', 'flashlight'] as const)('rejects an unavailable choice: %s', (item) => {
    const run = session(0, item === 'flareGun' || item === 'flashlight' ? item : undefined);
    const before = run.snapshot();
    expect(run.resolveEvent({ kind: 'item', choiceId: item, instanceId: `${item}-1` }).accepted).toBe(false);
    expect(run.snapshot()).toEqual(before);
  });

});

function presentation() {
  let finishDive = () => {};
  const dive = {
    play: vi.fn((_id: ItemInstanceId, options: DivePlayOptions) => new Promise<void>((resolve) => {
      finishDive = resolve;
      options.onWaterImpact();
    })),
    clear: vi.fn(() => finishDive()),
    settleForVisibilityChange: vi.fn(() => finishDive()),
  };
  const intensity = vi.fn();
  const camera = new PerspectiveCamera();
  camera.position.set(0, 1.8, 0);
  const sample = vi.fn((wave, _time, x, z) => {
    wave.height = x * 0.01 + z * 0.005;
    wave.normal.x = 0.01; wave.normal.y = 1; wave.normal.z = 0.005;
  });
  const event = new OceanOfBloodPresentation({
    dive,
    featuredModels: EMPTY_SURVIVAL_EVENT_MODELS,
    setBloodOceanIntensity: intensity, camera,
    sampleWorldWaveInto: sample, readWorldWaveAmplitudeScale: () => 1,
  } as unknown as DedicatedEventEnvironment);
  event.stage({ eventId: 'ocean-of-blood', targetInstanceId: null, variantSeed: 31 });
  return { event, intensity, sample, camera, dive, finishDive: () => finishDive() };
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

  // Importance: 90/100. The reveal must not take control of the player's camera.
  it('preserves the camera throughout reveal and cleanup', async () => {
    const { event, camera, intensity } = presentation();
    const original = camera.quaternion.clone();
    const originalPosition = camera.position.clone();
    const reveal = event.reveal();
    for (let time = 1; time <= BLOOD_OCEAN_REVEAL_SECONDS; time += 1) {
      event.update(time, 1);
      expect(camera.quaternion.angleTo(original)).toBeLessThan(0.0001);
      expect(camera.position).toEqual(originalPosition);
    }
    await reveal;
    event.clear();
    expect(camera.quaternion.angleTo(original)).toBeLessThan(0.0001);
    expect(camera.position).toEqual(originalPosition);
    expect(intensity).toHaveBeenLastCalledWith(0);
    event.dispose();
  });

  it('reveals twelve bodies and recovers only the heart through a scuba dive', async () => {
    const { event, intensity, sample, dive, finishDive } = presentation();
    const reveal = event.reveal();
    event.update(9, BLOOD_OCEAN_REVEAL_SECONDS);
    await reveal;
    expect(intensity).toHaveBeenLastCalledWith(1);
    expect(event.worldRoot.visible).toBe(true);
    expect(event.worldRoot.children.filter(child => child.name.startsWith('blood-ocean-body-'))).toHaveLength(12);
    expect(sample).toHaveBeenCalledTimes(24);
    expect(await event.playItemUse('fishingNet', 'fishingNet-1')).toBe(false);
    expect(dive.play).not.toHaveBeenCalled();
    const use = event.playItemUse('scubaSet', 'scubaSet-1');
    expect(dive.play).toHaveBeenCalledWith('scubaSet-1', expect.objectContaining({ waterAppearance: 'blood' }));
    finishDive();
    expect(await use).toBe(true);
    expect(dive.clear).not.toHaveBeenCalled();
    event.clear();
    expect(dive.clear).toHaveBeenCalledOnce();
    event.dispose();
    expect(intensity).toHaveBeenLastCalledWith(0);
  });

  it('settles reveal, clears pending actions, and disposes geometry once', async () => {
    const { event, intensity } = presentation();
    const geometry = (event.worldRoot.getObjectByName('torn-coat') as Mesh).geometry;
    const dispose = vi.spyOn(geometry, 'dispose');
    const reveal = event.reveal();
    event.settleForVisibilityChange();
    await reveal;
    expect(intensity).toHaveBeenLastCalledWith(1);
    const use = event.playItemUse('scubaSet', 'scubaSet-1');
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

  it('settles a weather and phase transition before the next visible frame', () => {
    const texture = new Texture();
    const initial = { weather: 'calm' as const, phase: 'day' as const, severity: 0 };
    const target = { weather: 'squall' as const, phase: 'night' as const, severity: 0 };
    const sky = new Skybox(new Scene(), initial, texture);
    const control = new Skybox(new Scene(), target, texture);
    const camera = new Vector3();
    try {
      sky.update(0.1, target, camera);
      expect(sky.palette).not.toEqual(control.palette);
      sky.settleTransition(target, camera);
      expect(sky.palette.zenithColor.getHex()).toBe(control.palette.zenithColor.getHex());
      expect(sky.palette.horizonColor.getHex()).toBe(control.palette.horizonColor.getHex());
      expect(sky.palette.fogColor.getHex()).toBe(control.palette.fogColor.getHex());
      expect(sky.palette.cloudCoverage).toBeCloseTo(control.palette.cloudCoverage);
      expect(sky.palette.ambientLightIntensity).toBeCloseTo(control.palette.ambientLightIntensity);
      expect(sky.palette.keyLightIntensity).toBeCloseTo(control.palette.keyLightIntensity);
    } finally { sky.dispose(); control.dispose(); texture.dispose(); }
  });

  it('preserves the blood effect across quality switches and restores normal High fog', () => {
    const ocean = new OceanRenderer('low');
    const color = HIGH_WATER_LOOK.day.sunColor;
    try {
      ocean.setBloodOceanIntensity(1);
      ocean.setQuality('high');
      ocean.update(1, 1, 0.025, {
        phase: 'night', denseFog: false, fogColor: color, horizonColor: color, skyColor: color, sunColor: color, sunVisibility: 0,
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
