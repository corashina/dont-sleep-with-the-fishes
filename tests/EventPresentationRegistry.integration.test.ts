import { Group, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { EventPresentationHost } from '../src/survival/EventPresentationHost';
import { EventPresentationRegistry } from '../src/survival/EventPresentationRegistry';
import type { EventPresentationAdapterDependencies } from '../src/survival/eventPresentationAdapters';
import { lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';

// Importance: 95/100. A wrong presenter must not aim a leak patch at fish or binoculars inside the hull.
// Keep this separate from the registry unit suite: its module mocks replace these real presenters.
it('routes leak patches to the boat and school binoculars to open water', async () => {
  const scene = new Group();
  const boat = new Group();
  scene.add(boat);
  const dependencies = {
    worldParent: scene,
    boatParent: boat,
    dedicatedEnvironment: {
      // Only asset loading and the ocean are substitutes. Registry, adapters, and presenters are real.
      eventModels: { create: () => ({ root: new Group(), dispose() {} }) },
      sampleWorldWaveInto() {},
    },
  } as unknown as EventPresentationAdapterDependencies;
  const registry = new EventPresentationRegistry();
  const host = new EventPresentationHost();
  const leak = registry.create('leak', dependencies);
  try {
    host.attach(leak);
    host.stage({ eventId: 'leak', targetInstanceId: null, variantSeed: 7 });
    const target = host.itemAimTarget()!;
    const start = target.getWorldPosition(new Vector3());
    const hullWidth = lifeboatHullHalfWidthAt(start.z);
    expect(hullWidth).not.toBeNull();
    expect(Math.abs(start.x)).toBeGreaterThan(hullWidth! - 0.3);
    expect(Math.abs(start.x)).toBeLessThan(hullWidth!);
    boat.position.set(0.7, 0.4, -0.2);
    expect(target.getWorldPosition(new Vector3()).sub(start).distanceTo(boat.position)).toBeLessThan(1e-8);
    await expect(host.playItemUse('spyglass', 'spyglass-1')).resolves.toBe(false);
  } finally {
    host.detach(leak);
    leak.dispose();
  }

  boat.position.set(0, 0, 0);
  const school = registry.create('school-of-fish', dependencies);
  try {
    host.attach(school);
    host.stage({ eventId: 'school-of-fish', targetInstanceId: null, variantSeed: 7 });
    const use = host.playItemUse('spyglass', 'spyglass-1');
    host.settleForVisibilityChange();
    await expect(use).resolves.toBe(true);
    const target = host.itemAimTarget()!;
    const start = target.getWorldPosition(new Vector3());
    const hullWidth = lifeboatHullHalfWidthAt(start.z);
    expect(hullWidth).not.toBeNull();
    expect(Math.abs(start.x)).toBeGreaterThan(hullWidth! + 1);
    expect(start.y).toBeGreaterThan(0);
    expect(start.y).toBeLessThan(0.2);
    boat.position.set(0.7, 0.4, -0.2);
    expect(target.getWorldPosition(new Vector3()).distanceTo(start)).toBeLessThan(1e-8);
  } finally {
    host.detach(school);
    school.dispose();
    host.dispose();
  }
});
