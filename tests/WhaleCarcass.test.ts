// Importance: 90/100. Prevents hauling the whale aboard, stale clicks, and resource leaks.
import { Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DriftingItemPresentation } from '../src/survival/DriftingItemPresentation';

function fixture() {
  let height = 0;
  const presentation = new DriftingItemPresentation({
    barrel: new Group(), chest: new Group(), lifeboat: new Group(), lifeboatCooler: new Group(),
    shippingContainer: new Group(), debrisBox: new Group(), debrisCrate: new Group(), debrisPallet: new Group(),
  }, new Group(), new PerspectiveCamera(), {
    readAmplitudeScale: () => 1,
    sampleWaveInto: output => {
      output.height = height;
      output.normal = { x: 0.1, y: 1, z: 0.12 };
    },
  });
  return { presentation, setHeight: (value: number) => { height = value; } };
}

describe('whale carcass', () => {
  it.each([8, 9])('faces the boat and follows waves on side seed %s', seed => {
    const { presentation, setHeight } = fixture();
    try {
      presentation.stage('drifting-supplies', seed);
      const whale = presentation.interactionRoot()!;
      expect(whale.name).toBe('drifting-supplies:whale');
      const x = whale.position.x;
      const y = whale.position.y;
      setHeight(0.75);
      presentation.update(1, 10);
      expect(whale.position.y - y).toBeCloseTo(0.75);
      expect(whale.position.x).toBeCloseTo(x);
      const woundDirection = new Vector3(1, 0, 0).applyQuaternion(whale.quaternion);
      expect(woundDirection.x * x).toBeLessThan(0);
      expect(whale.getObjectByName('whale-carcass:closed-eye')).toBeDefined();
    } finally { presentation.dispose(); }
  });

  it('retrieves only scraps, then restores them for the next encounter', async () => {
    const { presentation, setHeight } = fixture();
    try {
      presentation.stage('drifting-supplies', 8);
      const whale = presentation.interactionRoot()!;
      const start = whale.position.clone();
      const scraps = presentation.resultRoot()!;
      const retrieval = presentation.retrieve();
      expect(presentation.interactionRoot()).toBeNull();
      expect(scraps.parent).toBe(presentation.root);
      presentation.update(1, 0.9);
      expect(whale.position.distanceTo(start)).toBeLessThan(0.01);
      presentation.update(2, 0.9);
      await retrieval;
      expect(scraps.visible).toBe(false);
      expect(whale.visible).toBe(true);
      setHeight(0.4);
      presentation.update(3, 10);
      expect(whale.position.y - start.y).toBeCloseTo(0.4);
      presentation.clear();
      expect(whale.visible).toBe(false);
      presentation.stage('drifting-supplies', 9);
      expect(scraps.visible).toBe(true);
      expect(scraps.parent?.name).toBe('whale-carcass:model');
    } finally { presentation.dispose(); }
  });

  it('settles interrupted collection and disposes its geometry once', async () => {
    const { presentation } = fixture();
    presentation.stage('drifting-supplies', 8);
    const body = presentation.root.getObjectByName('whale-carcass:body') as Mesh;
    const dispose = vi.spyOn(body.geometry, 'dispose');
    const retrieval = presentation.retrieve();
    presentation.settleForVisibilityChange();
    await retrieval;
    expect(presentation.resultRoot()!.visible).toBe(false);
    presentation.stage('drifting-supplies', 9);
    const interrupted = presentation.retrieve();
    presentation.dispose();
    presentation.dispose();
    await interrupted;
    expect(dispose).toHaveBeenCalledOnce();
    expect(presentation.interactionRoot()).toBeNull();
  });
});
