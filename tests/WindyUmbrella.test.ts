// Importance: 95/100. Wind must remove only the selected item after a visible flight.
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import { BoatWorld } from '../src/survival/BoatWorld';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  createEventItemUseSample, eventItemUseDuration, sampleEventItemOutcome,
  WIND_ITEM_FLIGHT_DURATION,
} from '../src/survival/eventItemUseChoreography';
import { weatherItemUseDuration } from '../src/survival/weatherEventChoreography';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';
import { createTestPropModels } from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';
import { presentationWeatherProfile } from '../src/weather/presentationWeather';

describe.each(['umbrella', 'map'] as const)('Windy Night %s', (itemType) => {
  const context = itemType === 'map' ? 'map-wind' : 'umbrella-overhead';
  const firstId = `${itemType}-1` as const;
  const selectedId = `${itemType}-2` as const;
  const items: ItemInstance[] = [
    { instanceId: firstId, type: itemType },
    { instanceId: selectedId, type: itemType },
  ];

  function session(roll = 0) {
    return new SurvivalSession(items, {
      seed: 1, initialEventId: 'windy-night', random: { next: () => roll },
    });
  }

  function loseItem(game: SurvivalSession) {
    return game.resolveEvent({ kind: 'item', choiceId: itemType, instanceId: selectedId });
  }

  it.each([0, 0.49, 0.5, 0.999])('always loses only the selected item with roll %s', (roll) => {
    const game = session(roll);
    const food = game.snapshot().food;
    expect(loseItem(game).accepted).toBe(true);
    expect(game.snapshot().inventory[selectedId]?.condition).toBe('lost');
    expect(game.snapshot().inventory[firstId]?.condition).toBe('usable');
    expect(game.snapshot().food).toBe(food);
    game.beginDawn();
    expect(game.snapshot().inventory[selectedId]?.condition).toBe('lost');
  });

  // Importance: 95/100. Keep the departure aligned with wind and visibly affected by gusts.
  it('flies forward before curving right with changing speed, height, and tilt', () => {
    expect(WIND_ITEM_FLIGHT_DURATION).toBeGreaterThanOrEqual(5);
    const sample = createEventItemUseSample();
    const poses = Array.from({ length: 61 }, (_, frame) => {
      sampleEventItemOutcome(context, itemType, 'depart', frame / 60, sample);
      return { ...sample };
    });
    let rises = 0;
    let falls = 0;
    let tiltsLeft = 0;
    let tiltsRight = 0;
    const speeds: number[] = [];
    for (let frame = 12; frame < poses.length; frame += 1) {
      const pose = poses[frame]!;
      const previous = poses[frame - 1]!;
      expect(pose.viewX).toBeGreaterThan(previous.viewX);
      expect(Math.abs(pose.viewY - poses[0]!.viewY)).toBeLessThan(1.2);
      if (pose.viewY > previous.viewY) rises += 1;
      if (pose.viewY < previous.viewY) falls += 1;
      if (pose.roll > previous.roll) tiltsRight += 1;
      if (pose.roll < previous.roll) tiltsLeft += 1;
      speeds.push(pose.viewX - previous.viewX);
    }
    expect(rises).toBeGreaterThan(5);
    expect(falls).toBeGreaterThan(5);
    expect(tiltsLeft).toBeGreaterThan(5);
    expect(tiltsRight).toBeGreaterThan(5);
    expect(speeds.some((speed, index) => index > 0 && speed < speeds[index - 1]! * 0.9)).toBe(true);
    const middle = poses[30]!;
    expect(Math.abs(middle.viewZ)).toBeGreaterThan(middle.viewX * 2);
  });

  // Importance: 95/100. Camera pitch and boat motion must never drive the canopy under waves.
  it.each([0, -0.55])('stays above waves while flying right with camera pitch %s', async (pitch) => {
    const game = session(0.999);
    const models = createTestPropModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(camera, models, ...createTestSkyTextures(), items);
    try {
      world.syncInventory(game.snapshot());
      world.stageEvent('windy-night');
      world.setPresentationWeather('wind');
      camera.rotation.x = pitch;
      world.setEventSelectedItem(selectedId);
      const use = world.playEventItemUse('windy-night', itemType, selectedId);
      const useDuration = Math.max(
        eventItemUseDuration(context), weatherItemUseDuration('windy-night', itemType)!,
      );
      world.update(useDuration, useDuration);
      await use;
      const actor = world.scene.getObjectByName(`boat-supply-event:${selectedId}`)!;
      const held = actor.getWorldPosition(new Vector3());
      const rotation = actor.quaternion.clone();
      const scale = actor.scale.clone();
      const outcome = loseItem(game);
      world.syncInventory(game.snapshot());
      const presentation: EventOutcomePresentation = {
        outcome, resourceDeltas: {}, gainedInstanceIds: [], brokenInstanceIds: [],
        lostInstanceIds: [selectedId], consumedInstanceIds: [], selectedInstanceId: selectedId,
        selectedCondition: 'lost', targetInstanceId: null,
      };
      let finished = false;
      const reaction = world.reactToEventOutcome('windy-night', outcome, {
        choiceId: itemType, instanceId: selectedId, condition: 'lost',
      }, presentation).then(() => { finished = true; });
      expect(actor.getWorldPosition(new Vector3()).distanceTo(held)).toBeLessThan(1e-6);
      expect(actor.visible).toBe(true);
      expect(actor.quaternion.angleTo(rotation)).toBeLessThan(1e-6);

      let time = useDuration;
      let exitedRight = false;
      let visibleFrames = 0;
      const flightFrames = Math.floor((WIND_ITEM_FLIGHT_DURATION - 0.1) * 60);
      for (let frame = 0; frame < flightFrames; frame += 1) {
        time += 1 / 60;
        world.update(time, 1 / 60);
        expect(actor.visible).toBe(true);
        expect(actor.parent).not.toBeNull();
        const projected = actor.getWorldPosition(new Vector3()).project(camera);
        const viewPosition = camera.worldToLocal(actor.getWorldPosition(new Vector3()));
        if (projected.x > 1 && viewPosition.z < 0) exitedRight = true;
        if (Math.max(Math.abs(projected.x), Math.abs(projected.y), Math.abs(projected.z)) < 1) {
          visibleFrames += 1;
        }
        const bounds = new Box3().setFromObject(actor);
        for (const x of [bounds.min.x, bounds.max.x]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const water = sampleWaveField(
              DEFAULT_WAVES, time, x, z, presentationWeatherProfile('wind').waveScale,
            );
            expect(bounds.min.y, `frame ${frame}: item must clear the waves`).toBeGreaterThan(water.height);
          }
        }
        if (frame === 90) {
          const position = camera.worldToLocal(actor.getWorldPosition(new Vector3()));
          expect(position.x).toBeGreaterThan(0.5);
          expect(-position.z).toBeGreaterThan(position.x);
          expect(actor.quaternion.angleTo(rotation)).toBeGreaterThan(0.2);
        }
      }
      await Promise.resolve();
      expect(finished).toBe(false);
      expect(actor.getWorldPosition(new Vector3()).distanceTo(held)).toBeGreaterThan(25);
      expect(actor.scale.distanceTo(scale)).toBeLessThan(1e-6);
      expect(exitedRight).toBe(true);
      if (pitch === 0) expect(visibleFrames / 60).toBeGreaterThanOrEqual(3);
      expect(camera.worldToLocal(actor.getWorldPosition(new Vector3())).x).toBeGreaterThan(0);
      world.update(time + 0.5, 0.5);
      await reaction;
      expect(actor.parent).toBeNull();
      world.clearEvent();
      game.beginDawn();
      world.syncInventory(game.snapshot());
      expect(world.scene.getObjectByName(`boat-supply-event:${selectedId}`)).toBeUndefined();
      expect(game.snapshot().inventory[firstId]?.condition).toBe('usable');
      expect(game.snapshot().inventory[selectedId]?.condition).toBe('lost');
    } finally {
      world.dispose();
      models.dispose();
    }
  });
});
