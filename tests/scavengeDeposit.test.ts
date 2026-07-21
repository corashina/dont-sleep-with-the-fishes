import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { CarryController } from '../src/interaction/CarryController';
import { commitBoatDeposit } from '../src/phases/scavengeDeposit';

describe('commitBoatDeposit', () => {
  it('commits the full session bundle before releasing and storing its visuals', () => {
    const session = new ScavengeSession();
    session.start();
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    scene.add(camera);
    const carry = new CarryController(scene, camera);
    const instances = [
      { instanceId: 'cannedFood-1', type: 'cannedFood' },
      { instanceId: 'ductTape-1', type: 'ductTape' },
    ] as const;
    instances.forEach((instance) => {
      const object = new Group();
      scene.add(object);
      session.pickUp(instance.instanceId);
      carry.pickUp(instance, object);
    });
    const saveItems = vi.fn();

    expect(commitBoatDeposit(session, carry, { saveItems })).toBe(true);
    expect(saveItems).toHaveBeenCalledWith(instances);
    expect(carry.busy).toBe(false);
    expect(session.snapshot()).toMatchObject({ carriedWeight: 0, savedCount: 2 });
  });

  it('keeps carried state and visuals when the session rejects the deposit', () => {
    const session = new ScavengeSession();
    session.start();
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    scene.add(camera);
    const carry = new CarryController(scene, camera);
    const instance = { instanceId: 'flareGun-1', type: 'flareGun' } as const;
    const object = new Group();
    scene.add(object);
    session.pickUp(instance.instanceId);
    carry.pickUp(instance, object);
    session.pause();
    const before = session.snapshot();
    const saveItems = vi.fn();

    expect(commitBoatDeposit(session, carry, { saveItems })).toBe(false);
    expect(saveItems).not.toHaveBeenCalled();
    expect(session.snapshot()).toEqual(before);
    expect(carry.activeInstance).toEqual(instance);
    expect(carry.flightActive).toBe(false);
    expect(object.parent).toBe(camera);
  });
});
