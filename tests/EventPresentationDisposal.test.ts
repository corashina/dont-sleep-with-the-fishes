// Importance: 98/100. Disposal must release scene resources and settle work after pose cleanup fails.
import { describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Group, Material, Mesh, PerspectiveCamera } from 'three';
import { EventPresentationRegistry } from '../src/survival/EventPresentationRegistry';
import { EventPresentationHost } from '../src/survival/EventPresentationHost';
import type { EventPresentationAdapterDependencies } from '../src/survival/eventPresentationAdapters';

describe('animator adapter disposal', () => {
  it.each(['shower-night', 'ghosts'] as const)('releases %s after pose cleanup throws', async (eventId) => {
    const clearEventPose = vi.fn();
    const dependencies = {
      worldParent: new Group(), boatParent: new Group(),
      focusedDependencies: { cameraRig: new Group(), camera: new PerspectiveCamera(),
        supplyDisplay: { clearEventPose, releaseEventActor: vi.fn() } },
      dedicatedEnvironment: { eventModels: { create: () => new Group() } },
    } as unknown as EventPresentationAdapterDependencies;
    const adapter = new EventPresentationRegistry().create(eventId, dependencies);
    const host = new EventPresentationHost();
    host.attach(adapter);
    adapter.stage({ eventId, targetInstanceId: null, variantSeed: 41 });
    const resources = new Set<BufferGeometry | Material>();
    for (const { root } of adapter.roots) root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
    });
    expect(resources.size).toBeGreaterThan(0);
    const disposals = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
    const pending = adapter.reveal();
    const failure = new Error('pose cleanup');
    clearEventPose.mockImplementation(() => { throw failure; });
    expect(() => adapter.dispose()).toThrow(failure);
    adapter.dispose();
    for (const { root } of adapter.roots) expect(root.parent).toBeNull();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
    await pending;
    host.dispose();
  });
});
