import { describe, expect, it, vi } from 'vitest';
import {
  AnimationClip,
  BoxGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  type BufferGeometry,
} from 'three';
import type { ItemInstanceId } from '../src/game/ItemState';
import { SharkMenPresentation } from '../src/survival/SharkMenPresentation';
import type {
  BoatSupplyDisplay,
  SupplyAdditivePose,
} from '../src/survival/BoatSupplyDisplay';
import type { EventModelPresentation } from '../src/world/PropModelLibrary';
import type {
  ActionOutcome,
  ItemCondition,
} from '../src/survival/survivalTypes';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';

class FakeBoatSupplyDisplay {
  readonly poses = new Map<ItemInstanceId, SupplyAdditivePose>();
  readonly pinCalls: ItemInstanceId[] = [];
  clearCount = 0;

  pinEventActor(instanceId: ItemInstanceId): boolean {
    this.pinCalls.push(instanceId);
    return true;
  }

  applyEventItemPose(instanceId: ItemInstanceId, pose: SupplyAdditivePose): boolean {
    this.poses.set(instanceId, { ...pose });
    return true;
  }

  resetEventPoseForFrame(): void {
    this.poses.clear();
  }

  clearEventPose(): void {
    this.poses.clear();
  }

  clearEventMotion(): void {
    this.poses.clear();
    this.clearCount += 1;
  }
}

function actor(instanceId: ItemInstanceId, condition: ItemCondition) {
  return { instanceId, condition } as const;
}

function outcome(
  deltas: ActionOutcome['deltas'] = {},
  message = 'The shark men attack.',
): ActionOutcome {
  return {
    accepted: true,
    code: 'event-resolved',
    message,
    deltas,
    cue: Object.values(deltas).some((value) => (value ?? 0) < 0) ? 'impact' : 'none',
  };
}

function createModel(): EventModelPresentation {
  const root = new Group();
  const body = new Mesh(
    new BoxGeometry(1.2, 0.4, 2.1),
    new MeshStandardMaterial({ color: 0x557078 }),
  );
  body.name = 'shark-body';
  root.add(body);
  return {
    root,
    animations: [
      new AnimationClip('Swim Empty', 1, []),
      new AnimationClip('Swim Slow', 1, [
        new NumberKeyframeTrack('shark-body.rotation[y]', [0, 1], [0, 0.6]),
      ]),
      new AnimationClip('Swim Fast', 1, [
        new NumberKeyframeTrack('shark-body.rotation[z]', [0, 1], [0, 0.9]),
      ]),
    ],
  };
}

function createPresentation(model: EventModelPresentation | null = null) {
  const cameraRig = new Group();
  const supplies = new FakeBoatSupplyDisplay();
  const presentation = new SharkMenPresentation(
    model,
    cameraRig,
    supplies as unknown as BoatSupplyDisplay,
  );
  return { cameraRig, presentation, supplies };
}

describe('SharkMenPresentation', () => {
  it('builds all coded fins and the authored rail hand without a model', () => {
    const { presentation } = createPresentation();
    const { root } = presentation;

    expect(root.getObjectByName('shark-men-fin-1')).toBeTruthy();
    expect(root.getObjectByName('shark-men-fin-5')).toBeTruthy();
    expect(root.getObjectByName('shark-men-hand')).toBeTruthy();
    expect(root.getObjectByName('shark-men-nail-4')).toBeTruthy();
    expect(root.getObjectByName('shark-men-model-1')).toBeUndefined();

    presentation.dispose();
  });

  it('clones five model transforms and uses the first valid swim clip', () => {
    const { presentation } = createPresentation(createModel());
    presentation.stage();
    presentation.update(0.5, 0.5);

    const bodies = Array.from({ length: 5 }, (_, index) =>
      presentation.root.getObjectByName(`shark-body`)?.parent === null
        ? null
        : presentation.root
          .getObjectByName(`shark-men-model-${index + 1}`)
          ?.getObjectByName('shark-body') as Mesh | undefined);
    expect(bodies.every(Boolean)).toBe(true);
    expect(bodies[0]!.rotation.y).not.toBe(0);
    expect(bodies[0]!.rotation.z).toBeCloseTo(0);
    expect(bodies.map((body) => body!.geometry).every(
      (geometry) => geometry === bodies[0]!.geometry,
    )).toBe(true);

    presentation.dispose();
  });

  it('ends the reveal with the hand and exactly two fins visible', async () => {
    const { presentation } = createPresentation();
    presentation.stage();
    const reveal = presentation.reveal();
    presentation.update(2, 2);
    await reveal;

    expect(presentation.root.getObjectByName('shark-men-hand')?.visible).toBe(true);
    const visibleFins = Array.from({ length: 5 }, (_, index) =>
      presentation.root.getObjectByName(`shark-men-fin-${index + 1}`)?.visible);
    expect(visibleFins).toEqual([true, true, false, false, false]);

    presentation.dispose();
  });

  it('uses the configured presentation wave scale without dampening the sample', () => {
    const { presentation } = createPresentation();
    const time = 2.37;
    const waveScale = 1.55;
    const angle = 0.18 + time * 0.29;
    const x = -2.9 + Math.cos(angle) * 0.72;
    const z = -3.7 + Math.sin(angle) * 0.48;
    const expected = sampleWaveField(DEFAULT_WAVES, time, x, z, waveScale);

    presentation.stage();
    presentation.setWaveScale(waveScale);
    presentation.update(time, 0.1);

    const path = presentation.root.getObjectByName('shark-men-path-1')!;
    expect(path.position.y).toBeCloseTo(expected.height);
    expect(path.position.x).toBeCloseTo(x + expected.displacementX);
    expect(path.position.z).toBeCloseTo(z + expected.displacementZ);
    presentation.dispose();
  });

  it('scatters all fins after the Harpoon Gun fires', async () => {
    const { presentation } = createPresentation();
    presentation.stage();
    const fin = presentation.root.getObjectByName('shark-men-fin-1')!;
    const base = fin.position.clone();
    const reaction = presentation.react(
      outcome(),
      {
        choiceId: 'harpoonGun',
        actors: [actor('harpoonGun-1', 'consumed')],
      },
    );
    presentation.update(0.8, 0.8);

    expect(fin.visible).toBe(true);
    expect(fin.position.distanceTo(base)).toBeGreaterThan(0.25);
    presentation.update(1.6, 0.8);
    await reaction;
    presentation.dispose();
  });

  it('moves a lost Swim Ring under water', async () => {
    const { presentation, supplies } = createPresentation();
    presentation.stage();
    const reaction = presentation.react(
      outcome(),
      {
        choiceId: 'swimRing',
        actors: [actor('swimRing-1', 'lost')],
      },
    );
    presentation.update(1.2, 1.2);

    expect(supplies.poses.get('swimRing-1')?.y).toBeLessThan(-0.5);
    presentation.update(1.6, 0.4);
    await reaction;
    presentation.dispose();
  });

  it('stretches a broken Swim Ring before it collapses', async () => {
    const { presentation, supplies } = createPresentation();
    presentation.stage();
    const reaction = presentation.react(
      outcome({ hull: -60, health: -50 }),
      {
        choiceId: 'swimRing',
        actors: [actor('swimRing-1', 'broken')],
      },
    );
    presentation.update(0.45, 0.45);
    expect(supplies.poses.get('swimRing-1')?.scaleY).toBeGreaterThan(1.1);

    presentation.update(1.35, 0.9);
    expect(supplies.poses.get('swimRing-1')?.scaleY).toBeLessThan(0.75);
    presentation.update(1.6, 0.25);
    await reaction;
    presentation.dispose();
  });

  it('raises damaged Scuba Gear and holds four food results on success', async () => {
    const { presentation, supplies } = createPresentation();
    presentation.stage();
    const reaction = presentation.react(
      outcome({ food: 4, energy: 2 }, 'You gain four food.'),
      {
        choiceId: 'scubaSet',
        actors: [actor('scubaSet-1', 'broken')],
      },
    );
    presentation.update(1.6, 1.6);
    await reaction;

    expect(supplies.poses.get('scubaSet-1')?.y).toBeGreaterThan(0.5);
    for (let index = 1; index <= 4; index += 1) {
      expect(
        presentation.root.getObjectByName(`shark-men-food-${index}`)?.visible,
      ).toBe(true);
    }
    presentation.dispose();
  });

  it('uses one strike and a hull impact on Scuba Gear failure', async () => {
    const { cameraRig, presentation } = createPresentation();
    presentation.stage();
    const reaction = presentation.react(
      outcome({ hull: -25, health: -80, energy: 1 }),
      {
        choiceId: 'scubaSet',
        actors: [actor('scubaSet-1', 'broken')],
      },
    );
    presentation.update(0.8, 0.8);

    expect(presentation.root.getObjectByName('shark-men-strike')?.visible).toBe(true);
    expect(presentation.root.userData.strikeCount).toBe(1);
    expect(cameraRig.position.length()).toBeGreaterThan(0);
    presentation.update(1.6, 0.8);
    await reaction;
    presentation.dispose();
  });

  it('shows sleep damage with no item actor', async () => {
    const { cameraRig, presentation, supplies } = createPresentation();
    presentation.stage();
    const reaction = presentation.react(
      outcome({ hull: -60, health: -50 }),
      { choiceId: 'sleep', actors: [] },
    );
    presentation.update(0.8, 0.8);

    expect(supplies.pinCalls).toEqual([]);
    expect(cameraRig.position.length()).toBeGreaterThan(0);
    expect(presentation.root.getObjectByName('shark-men-strike')?.visible).toBe(true);
    presentation.update(1.6, 0.8);
    await reaction;
    presentation.dispose();
  });

  it('restores every base pose on clear', () => {
    const { cameraRig, presentation, supplies } = createPresentation(createModel());
    const hand = presentation.root.getObjectByName('shark-men-hand')!;
    const baseHandPosition = hand.position.clone();
    const fin = presentation.root.getObjectByName('shark-men-fin-3')!;
    const baseFinPosition = fin.position.clone();
    const body = presentation.root
      .getObjectByName('shark-men-model-1')
      ?.getObjectByName('shark-body')!;
    const baseCameraPosition = cameraRig.position.clone();
    const baseCameraQuaternion = cameraRig.quaternion.clone();

    presentation.stage();
    void presentation.react(
      outcome({ hull: -60, health: -50 }),
      { choiceId: 'sleep', actors: [] },
    );
    presentation.update(0.8, 0.8);
    presentation.clear();

    expect(presentation.root.visible).toBe(false);
    expect(hand.position).toEqual(baseHandPosition);
    expect(fin.position).toEqual(baseFinPosition);
    expect(body.rotation.y).toBeCloseTo(0);
    expect(cameraRig.position).toEqual(baseCameraPosition);
    expect(cameraRig.quaternion.toArray()).toEqual(baseCameraQuaternion.toArray());
    expect(supplies.clearCount).toBeGreaterThan(0);
    presentation.dispose();
  });

  it('disposes every owned geometry and material once', () => {
    const { presentation } = createPresentation(createModel());
    const resources = new Set<BufferGeometry | Material>();
    presentation.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => resources.add(material));
    });
    const disposals = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));

    presentation.dispose();
    presentation.dispose();

    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
