// Importance: 9/10. Protects Carlitos side, delegation, promise, and cleanup ownership.
import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CarlitosDelegationPresentation } from '../src/survival/CarlitosDelegationPresentation';
import type { EventSide } from '../src/survival/eventVariant';

function createHarness() {
  const root = new Object3D();
  root.position.set(1.2, 0.45, -0.6);
  root.rotation.set(0.04, 0.25, -0.03);
  const setSeatSide = vi.fn((side: EventSide) => {
    root.position.x = side * 1.2;
    root.rotation.y = side * 0.25;
    root.userData.seatSide = side;
  });
  const presentation = new CarlitosDelegationPresentation({ root, setSeatSide });
  return { root, setSeatSide, presentation };
}

describe('CarlitosDelegationPresentation', () => {
  it('keeps the event side while delegating and restores its exact base pose', async () => {
    const { root, presentation } = createHarness();
    presentation.setAmbientSide(-1);
    presentation.setEventSide(1);
    const eventPosition = root.position.clone();
    const eventRotation = root.rotation.clone();
    let movedBeforeRetrieve = false;
    const retrieve = vi.fn(() => {
      presentation.update(0.75);
      movedBeforeRetrieve = !root.position.equals(eventPosition);
      return Promise.resolve();
    });

    const delegated = presentation.delegate(retrieve);
    expect(retrieve).toHaveBeenCalledOnce();
    expect(movedBeforeRetrieve).toBe(true);
    presentation.update(0.7);
    await delegated;

    expect(root.position.toArray()).toEqual(eventPosition.toArray());
    expect(root.rotation.toArray()).toEqual(eventRotation.toArray());
    presentation.dispose();
  });

  it('applies ambient side changes only when no event side overrides them', () => {
    const { root, setSeatSide, presentation } = createHarness();

    presentation.setAmbientSide(-1);
    expect(root.userData.seatSide).toBe(-1);
    presentation.setEventSide(1);
    presentation.setAmbientSide(-1);
    expect(root.userData.seatSide).toBe(1);
    presentation.setEventSide(null);
    expect(root.userData.seatSide).toBe(-1);
    expect(setSeatSide.mock.calls.map(([side]) => side)).toEqual([-1, 1, -1]);
    presentation.dispose();
  });

  it('settles replacement, finish, and disposal exactly once', async () => {
    const { root, presentation } = createHarness();
    const basePosition = root.position.clone();
    let firstSettles = 0;
    let secondSettles = 0;
    const first = presentation.delegate(() => Promise.resolve()).then(() => {
      firstSettles += 1;
    });
    presentation.update(0.4);
    const second = presentation.delegate(() => Promise.resolve()).then(() => {
      secondSettles += 1;
    });
    await first;
    expect(firstSettles).toBe(1);

    presentation.finish();
    presentation.finish();
    await second;
    expect(secondSettles).toBe(1);
    expect(root.position.toArray()).toEqual(basePosition.toArray());

    const third = presentation.delegate(() => Promise.resolve());
    presentation.dispose();
    presentation.dispose();
    await third;
    const retrieveAfterDispose = vi.fn(() => Promise.resolve());
    await presentation.delegate(retrieveAfterDispose);
    expect(retrieveAfterDispose).not.toHaveBeenCalled();
  });

  it('keeps loot rejection while finish settles the companion motion', async () => {
    const { root, presentation } = createHarness();
    const basePosition = root.position.clone();
    const lootError = new Error('loot failed');
    const delegated = presentation.delegate(() => Promise.reject(lootError));
    presentation.update(0.4);

    presentation.finish();
    await expect(delegated).rejects.toBe(lootError);
    expect(root.position.toArray()).toEqual(basePosition.toArray());
    presentation.dispose();
  });

  it('settles work and keeps the first pose cleanup error', async () => {
    const { root, presentation } = createHarness();
    const firstError = new Error('position restore failed');
    const laterError = new Error('rotation restore failed');
    const delegated = presentation.delegate(() => Promise.resolve());
    const copy = vi.spyOn(root.position, 'copy').mockImplementationOnce(() => {
      throw firstError;
    });
    const set = vi.spyOn(root.rotation, 'set').mockImplementationOnce(() => {
      throw laterError;
    });

    expect(() => presentation.finish()).toThrow(firstError);
    await delegated;
    expect(copy).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledOnce();
    expect(() => presentation.finish()).not.toThrow();
    presentation.dispose();
  });
});
