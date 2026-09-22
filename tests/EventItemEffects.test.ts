// Importance: 95/100. Prevents first-use shader changes and unintended item lighting.
import { Group, Light, Mesh, Object3D, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { createEventItemUseSample, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';

function visibleLights(root: Object3D): Light[] {
  const lights: Light[] = [];
  root.traverseVisible((object) => {
    if (object instanceof Light) lights.push(object);
  });
  return lights;
}

it('preserves the prepared lights through item use, flare use, and cleanup', () => {
  const effects = new EventItemEffects();
  const actor = new Object3D();
  const sample = createEventItemUseSample();
  try {
    const prepared = visibleLights(effects.root);
    expect(prepared.map((light) => light.name).sort()).toEqual([
      'event-item-flare-light', 'event-item-flashlight-light', 'event-item-held-fill',
    ]);
    expect(prepared.every((light) => light.intensity === 0)).toBe(true);
    const visibleMeshes: Mesh[] = [];
    effects.root.traverseVisible((object) => {
      if (object instanceof Mesh) visibleMeshes.push(object);
    });
    expect(visibleMeshes).toHaveLength(0);
    const fill = prepared.find((light) => light.name === 'event-item-held-fill')!;

    for (const [context, item] of [
      ['compass-search', 'compass'], ['flashlight-threat-beam', 'flashlight'], ['flare-sky', 'flareGun'],
    ] as const) {
      for (const progress of [0, 0.3, 0.5, 0.75, 1]) {
        sampleEventItemUse(context, item, progress, sample);
        effects.apply(sample, actor, true);
        expect(visibleLights(effects.root)).toEqual(prepared);
        if (sample.cameraSpaceBlend > 0 && sample.itemVisible) expect(fill.intensity).toBeGreaterThan(0);
        else expect(fill.intensity).toBe(0);
      }
      effects.clear();
      expect(visibleLights(effects.root)).toEqual(prepared);
      expect(prepared.every((light) => light.intensity === 0)).toBe(true);
    }
  } finally {
    effects.dispose();
  }
});

it('keeps the flare light on the projectile and dark when the projectile is hidden', () => {
  const effects = new EventItemEffects();
  const scene = new Group();
  const actor = new Object3D();
  actor.position.set(3, 2, -5);
  actor.rotation.y = 0.7;
  scene.add(actor, effects.root);
  const sample = createEventItemUseSample();
  const light = effects.root.getObjectByName('event-item-flare-light') as Light;
  const projectile = effects.root.getObjectByName('event-item-flare')!;
  try {
    for (const progress of [0, 0.5, 0.65, 0.85, 1]) {
      sampleEventItemUse('flare-sky', 'flareGun', progress, sample);
      effects.apply(sample, actor, true);
      if (projectile.visible) {
        expect(light.getWorldPosition(new Vector3()).distanceTo(
          projectile.getWorldPosition(new Vector3()),
        )).toBeLessThan(1e-8);
        expect(light.intensity).toBeGreaterThan(0);
      } else expect(light.intensity).toBe(0);
    }
    sampleEventItemUse('flare-sky', 'flareGun', 0.5, sample);
    sample.primaryEffect = 0;
    effects.apply(sample, actor, true);
    expect(projectile.visible).toBe(false);
    expect(light.intensity).toBe(0);
    sampleEventItemUse('compass-search', 'compass', 0.5, sample);
    effects.apply(sample, actor, true);
    expect(light.intensity).toBe(0);
  } finally {
    effects.dispose();
  }
});
