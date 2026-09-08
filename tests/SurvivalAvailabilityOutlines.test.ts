import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { sceneHoverOutlineTargets } from '../src/rendering/HoverOutline';
import { BoatWorld } from '../src/survival/BoatWorld';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';

function createRig(energy: number, night = false) {
  const items = ['cannedFood', 'scubaSet', 'ductTape', 'radio', 'energyBar', 'medicalKit', 'compass'] as const;
  const base = new SurvivalSession(items.map((type) => ({ instanceId: `${type}-1`, type })), {
    seed: 1,
    initial: { energy, health: 99, hull: 99, hunger: 1, food: 1 },
    initialConditions: { 'compass-1': 'broken' },
    initialChest: { state: 'closed', acquiredDay: 1 },
  });
  const session = SurvivalSession.restore({
    ...base.exportCheckpoint(), radioSignalAvailable: true, state: night ? 'nightEvent' : 'day',
  });
  const models = createTestPropModels();
  const world = new BoatWorld(new PerspectiveCamera(65, 16 / 9, 0.08, 220), models, ...createTestSkyTextures());
  const phase = SurvivalPhase.forTest({ session, world, ui: {}, onFatalError: (error) => { throw error; } });
  phase.start();
  const internals = phase as unknown as {
    renderSnapshot(openPendingEvent: boolean): void;
    setBusy(busy: boolean): void;
  };
  return {
    session, world, internals,
    targets: () => sceneHoverOutlineTargets(world.scene).map((target) => (
      target.parent?.name === 'fishing-rod-pivot' ? 'fishing-rod' : target.name
    )).sort(),
    dispose: () => { phase.dispose(); models.dispose(); },
  };
}

describe('survival availability outlines', () => {
  it.each([
    [3, 'scubaSet'],
    [2, 'energyBar'],
  ] as const)('registers every usable object at %i energy, including %s', (energy, energyItem) => {
    const rig = createRig(energy);
    const expected = [
      'boat-supply:cannedFood', `boat-supply:${energyItem}`, 'boat-supply:ductTape',
      'boat-supply:radio', 'boat-supply:medicalKit', 'repair-toolbox', 'fishing-rod', 'persistent-chest',
    ].sort();
    try {
      expect(rig.targets()).toEqual(expected);
      rig.world.setHighlightedItem('repair-tools');
      rig.world.setHighlightedItem(null);
      expect(rig.targets()).toEqual(expected);
      rig.internals.setBusy(true);
      expect(rig.targets()).toEqual([]);
      rig.internals.setBusy(false);
      expect(rig.targets()).toEqual(expected);
    } finally {
      rig.dispose();
    }
    expect(rig.targets()).toEqual([]);
  });

  it('removes outlines when their resources, equipment or repair targets are unavailable', () => {
    const rig = createRig(3);
    try {
      expect(rig.session.perform('repair').accepted).toBe(true);
      expect(rig.session.perform('repairItem', { kind: 'itemRepair', target: 'compass-1' }).accepted).toBe(true);
      expect(rig.session.perform('treat').accepted).toBe(true);
      expect(rig.session.perform('eat').accepted).toBe(true);
      expect(rig.session.perform('answerRadio').accepted).toBe(true);
      expect(rig.session.setItemConditionForLab('scubaSet-1', 'broken')).toBe(true);
      rig.internals.renderSnapshot(false);
      expect(rig.targets()).toEqual(['boat-supply:energyBar', 'fishing-rod', 'persistent-chest']);
      expect(rig.session.beginFishing().accepted).toBe(true);
      rig.internals.renderSnapshot(false);
      expect(rig.targets()).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  it('only outlines actions without an energy cost when energy is empty', () => {
    const rig = createRig(0);
    try {
      expect(rig.targets()).toEqual([
        'boat-supply:cannedFood', 'boat-supply:ductTape', 'boat-supply:energyBar',
        'boat-supply:medicalKit', 'persistent-chest',
      ]);
    } finally {
      rig.dispose();
    }
  });
});
