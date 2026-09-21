// @vitest-environment jsdom
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import type { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { NightTraderPresentation } from '../src/survival/NightTraderPresentation';
import { MidnightTourPresentation } from '../src/survival/MidnightTourPresentation';
import { DriftingItemPresentation } from '../src/survival/DriftingItemPresentation';
import { FlowersPresentation } from '../src/survival/FlowersPresentation';
import { driftingSupplyKindFromSeed } from '../src/survival/driftingSupplies';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import type { ActionOutcome } from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

function meshIn(root: Object3D): Mesh {
  let mesh: Mesh | undefined;
  root.traverse((object) => { if (mesh === undefined && object instanceof Mesh) mesh = object; });
  if (mesh === undefined) throw new Error('Missing test mesh');
  return mesh;
}

function opacity(root: Object3D): number {
  const material = meshIn(root).material;
  return (Array.isArray(material) ? material[0]! : material).opacity;
}

function model(): Group {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
  return root;
}

const outcome = { accepted: true } as ActionOutcome;
const sleep = { choiceId: 'sleep', instanceId: null, condition: null } as const;

describe('event departures', () => {
  it.each([0, 1])('keeps the departing trader visible until scene cleanup (seed %s)', async (seed) => {
    const propModels = createTestPropModels();
    const presentation = new NightTraderPresentation({
      camera: new PerspectiveCamera(), cameraRig: new Group(), propModels, waves: [],
      supplyDisplay: { releaseEventActor: vi.fn(), clearEventPose: vi.fn() },
    } as unknown as FocusedEventPresentationDependencies);
    try {
      presentation.stage(seed);
      presentation.update(1, 0);
      const boat = presentation.root.getObjectByName('night-trader-vessel')!;
      const sign = presentation.root.getObjectByName('night-trader-sign-drawings')!;
      const start = boat.position.clone();
      const result = presentation.react({ eventId: 'night-trader', choiceId: 'sleep', resultId: 'trader-refuse' }, outcome);
      presentation.update(1.65, 0.65);
      expect(boat.position.distanceTo(start)).toBeGreaterThan(1);
      expect(opacity(boat)).toBe(1);
      expect(opacity(sign)).toBe(1);
      presentation.update(2.3, 0.65);
      await result;
      expect(boat.visible).toBe(true);
      expect(presentation.root.visible).toBe(true);
      presentation.clear();
      expect(presentation.root.visible).toBe(false);
      presentation.stage(seed + 2);
      expect(opacity(boat)).toBe(1);
      expect(opacity(sign)).toBe(1);
    } finally { presentation.dispose(); propModels.dispose(); }
  });

  it('leaves the island behind without fading it in place', async () => {
    const propModels = createTestPropModels();
    const presentation = new MidnightTourPresentation({
      camera: new PerspectiveCamera(), cameraRig: new Group(), propModels, waves: [],
    } as unknown as FocusedEventPresentationDependencies);
    try {
      presentation.stage();
      const island = presentation.root.getObjectByName('midnight-tour-island')!;
      const start = island.position.clone();
      const choice = presentation.playChoice(sleep);
      presentation.update(0.575, 0.575);
      expect(island.position.distanceTo(start)).toBeGreaterThan(1);
      expect(opacity(island)).toBe(1);
      presentation.update(1.15, 0.575);
      await choice;
      const result = presentation.react({ eventId: 'midnight-tour', choiceId: 'sleep', resultId: 'tour-pass' }, outcome);
      expect(island.position.distanceTo(start)).toBeGreaterThan(5);
      presentation.update(2, 0.85);
      await result;
      expect(island.visible).toBe(true);
      presentation.stage();
      expect(opacity(island)).toBe(1);
    } finally { presentation.dispose(); propModels.dispose(); }
  });

  it('fades the empty lifeboat while the cooler remains visible and moves to the player', async () => {
    const lifeboat = model();
    const cooler = model();
    const presentation = new DriftingItemPresentation({
      barrel: model(), chest: model(), lifeboat, lifeboatCooler: cooler,
      shippingContainer: model(), debrisBox: model(), debrisCrate: model(), debrisPallet: model(),
    }, new Group(), new Group(), {
      sampleWaveInto: (sample) => sample,
      readAmplitudeScale: () => 0,
    });
    try {
      const seed = Array.from({ length: 100 }, (_, index) => index)
        .find((candidate) => driftingSupplyKindFromSeed(candidate) === 'lifeboat')!;
      presentation.stage('drifting-supplies', seed);
      const boat = presentation.root.getObjectByName('drifting-supplies:lifeboat')!;
      const start = boat.position.clone();
      const result = presentation.retrieve();
      presentation.update(1.2, 1.2);
      expect(boat.position.distanceTo(start)).toBeLessThan(1e-8);
      expect(opacity(lifeboat)).toBeGreaterThan(0);
      expect(opacity(lifeboat)).toBeLessThan(1);
      expect(opacity(cooler)).toBe(1);
      expect(cooler.visible).toBe(true);
      presentation.update(2, 0.8);
      await result;
      expect(boat.visible).toBe(false);
      presentation.stage('drifting-supplies', seed);
      expect(opacity(lifeboat)).toBe(1);
    } finally { presentation.dispose(); }
  });

  it('keeps drifting flowers visible until scene cleanup', async () => {
    const template = model();
    const presentation = new FlowersPresentation({ clone: () => template.clone(true) }, new Group());
    try {
      presentation.stage();
      const subject = presentation.root.getObjectByName('event-prop:flowers')!;
      const start = subject.position.clone();
      const result = presentation.react('flowers.drift');
      presentation.update(0.45, 0.45);
      expect(subject.position.distanceTo(start)).toBeGreaterThan(0.5);
      expect(opacity(subject)).toBe(1);
      expect(opacity(template)).toBe(1);
      presentation.update(0.9, 0.45);
      await result;
      expect(presentation.root.visible).toBe(true);
      presentation.clear();
      expect(presentation.root.visible).toBe(false);
      presentation.stage();
      expect(opacity(subject)).toBe(1);
    } finally { presentation.dispose(); }
  });

});
