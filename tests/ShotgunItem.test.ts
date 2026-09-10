import { describe,expect,it } from 'vitest';
import { Group,Vector3 } from 'three';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import {
  createEventItemUseSample,
  eventItemActionCueProgresses,
  eventItemUseDuration,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

function shot(secondsAfterCue: number) {
  const sample = createEventItemUseSample();
  const cue = eventItemActionCueProgresses('shotgun-fire')[0]!;
  sampleEventItemUse(
    'shotgun-fire', 'shotgun',
    cue + secondsAfterCue / eventItemUseDuration('shotgun-fire'), sample,
  );
  return sample;
}

describe('shotgun discharge', () => {

  it('places the flash at the scaled muzzle and leaves smoke behind during recoil', () => {
    const scene = new Group();
    const boat = new Group();
    boat.position.set(2, 0.2, -3);
    boat.rotation.set(0.12, 0.5, -0.08);
    const actor = new Group();
    actor.scale.setScalar(0.7);
    boat.add(actor);
    const effects = new EventItemEffects();
    scene.add(boat, effects.root);
    effects.apply(shot(0), actor);
    const muzzle = new Vector3(0, 0.076, -0.5).applyMatrix4(actor.matrixWorld);
    const flash = effects.root.getObjectByName('event-item-shotgun-flash')!;
    const smoke = effects.root.getObjectByName('event-item-shotgun-smoke')!;
    expect(flash.getWorldPosition(new Vector3()).distanceTo(muzzle)).toBeLessThan(1e-6);
    const discharge = smoke.getWorldPosition(new Vector3());

    boat.position.x += 4;
    actor.rotation.x = 0.2;
    effects.apply(shot(0.3), actor);
    const drifting = smoke.getWorldPosition(new Vector3());
    expect(flash.visible).toBe(false);
    expect(smoke.visible).toBe(true);
    expect(drifting.distanceTo(discharge)).toBeLessThan(0.1);
    expect(drifting.y).toBeGreaterThan(discharge.y);

    effects.clear();
    expect(effects.root.getObjectByName('event-item-shotgun-blast')!.visible).toBe(false);
    effects.apply(shot(0), actor);
    const nextMuzzle = new Vector3(0, 0.076, -0.5).applyMatrix4(actor.matrixWorld);
    expect(smoke.getWorldPosition(new Vector3()).distanceTo(nextMuzzle)).toBeLessThan(1e-6);
    effects.dispose();
  });

  it('clears recoil and discharge when the same sample is reused for another item', () => {
    const sample = shot(0.06);
    sampleEventItemUse('base', 'cannedFood', 1, sample);
    expect(sample.recoilPitch).toBe(0);
    expect(sample.effectKind).toBe('none');
    expect(sample.primaryEffect).toBe(0);
    expect(sample.secondaryEffect).toBe(0);
  });
});
