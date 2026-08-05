// Importance: 4/5. Protects event effect ownership, visibility, geometry, and cleanup.
import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Material,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import {
  createEventItemUseSample,
  sampleEventItemUse,
  type EventItemEffectKind,
  type EventItemUseContext,
} from '../src/survival/eventItemUseChoreography';

const effectNames: Readonly<Record<EventItemEffectKind, string | null>> = {
  none: null,
  tape: 'event-item-tape',
  'binocular-mask': 'event-item-binocular-mask',
  net: 'event-item-net',
  'bucket-cover': null,
  flare: 'event-item-flare',
  chain: 'event-item-chain',
  umbrella: 'event-item-umbrella',
  flashlight: 'event-item-flashlight-beam',
  'shotgun-smoke': 'event-item-shotgun-smoke',
};

const actionEffects = [
  ['tape-stretch', 'event-item-tape'],
  ['net-throw', 'event-item-net'],
  ['flare-target', 'event-item-flare'],
  ['anchor-drop', 'event-item-chain'],
  ['umbrella-shield', 'event-item-umbrella'],
  ['flashlight-flash', 'event-item-flashlight-beam'],
  ['shotgun-fire', 'event-item-shotgun-smoke'],
] as const satisfies readonly (readonly [EventItemUseContext, string])[];

function ownedResources(root: Group): readonly (BufferGeometry | Material)[] {
  const resources = new Set<BufferGeometry | Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh) && !(object instanceof LineSegments)) return;
    resources.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material])
      .forEach((material) => resources.add(material));
  });
  return [...resources];
}

function riggedHand(): { root: Group; skeleton: Skeleton } {
  const root = new Group();
  const bones: Bone[] = [];
  for (const chain of [
    ['ThumbRoot', 'ThumbMiddle', 'ThumbTop'],
    ['IndexF_lower', 'IndexF_middle', 'IndexF_tip'],
    ['MiddleF_lower', 'MiddleF_middle', 'MiddleF_tip'],
    ['RingF_lower', 'RingF_middle', 'RingF_tip'],
    ['PinkyF_lower', 'PinkyF_middle', 'PinkyF_tip'],
  ]) {
    let parent: Bone | null = null;
    for (const name of chain) {
      const bone = new Bone();
      bone.name = name;
      if (parent === null) root.add(bone);
      else parent.add(bone);
      bones.push(bone);
      parent = bone;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -0.2, -0.1, 0,
    0.2, -0.1, 0,
    0, 0.2, 0,
  ], 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(12), 4));
  const weights = new Float32Array(12);
  weights[0] = 1;
  weights[4] = 1;
  weights[8] = 1;
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const skeleton = new Skeleton(bones);
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.bind(skeleton);
  root.add(mesh);
  return { root, skeleton };
}

describe('EventItemEffects', () => {
  it('owns every named authored effect', () => {
    const effects = new EventItemEffects();

    expect(effects.root.getObjectByName('event-item-tape')).not.toBeNull();
    expect(effects.root.getObjectByName('event-item-net')).not.toBeNull();
    expect(effects.root.getObjectByName('event-item-flare')).not.toBeNull();
    expect(effects.root.getObjectByName('event-item-flashlight-beam')).not.toBeNull();
    const smoke = effects.root.getObjectByName('event-item-shotgun-smoke') as Group;
    expect(smoke).not.toBeNull();
    expect(smoke.children).toHaveLength(6);
    smoke.children.forEach((puff) => {
      expect(puff.name).toMatch(/^event-item-shotgun-smoke-puff-/);
    });
    expect(effects.root.getObjectByName('event-item-binocular-mask')).not.toBeNull();

    effects.dispose();
  });

  it('shows only the requested cue and clear hides all temporary lights', () => {
    const effects = new EventItemEffects();
    const actor = new Group();

    try {
      for (const effectKind of Object.keys(effectNames) as EventItemEffectKind[]) {
        const sample = createEventItemUseSample();
        sample.effectKind = effectKind;
        effects.apply(sample, actor);

        const requestedName = effectNames[effectKind];
        if (requestedName !== null) {
          const requested = effects.root.getObjectByName(requestedName)!;
          expect(requested.visible).toBe(false);
          requested.traverse((object) => {
            if (!(object instanceof Mesh) && !(object instanceof LineSegments)) return;
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            materials.forEach((material) => expect(material.opacity).toBe(0));
          });
        }

        sample.primaryEffect = 0.8;
        sample.secondaryEffect = 0.6;
        effects.apply(sample, actor);

        for (const [kind, name] of Object.entries(effectNames) as [EventItemEffectKind, string | null][]) {
          if (name === null) continue;
          expect(effects.root.getObjectByName(name)!.visible).toBe(kind === effectKind);
        }

        effects.clear();
        Object.values(effectNames).forEach((name) => {
          if (name !== null) expect(effects.root.getObjectByName(name)!.visible).toBe(false);
        });
        effects.root.traverse((object) => {
          if (object instanceof PointLight) expect(object.intensity).toBe(0);
        });
      }
    } finally {
      effects.dispose();
    }
  });

  it.each(actionEffects)(
    'hides %s effects before action and after its effect weight ends',
    (context, effectName) => {
      const effects = new EventItemEffects();
      const actor = new Group();
      const sample = createEventItemUseSample();

      try {
        for (const progress of [0.29, 0.95]) {
          sampleEventItemUse(context, progress, sample);
          expect(sample.primaryEffect).toBe(0);
          effects.apply(sample, actor);
          const effect = effects.root.getObjectByName(effectName)!;
          expect(effect.visible).toBe(false);
          effect.traverse((object) => {
            if (!(object instanceof Mesh) && !(object instanceof LineSegments)) return;
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            materials.forEach((material) => expect(material.opacity).toBe(0));
          });
          effects.root.traverse((object) => {
            if (
              object instanceof PointLight
              && object.name !== 'event-item-held-fill'
            ) {
              expect(object.intensity).toBe(0);
            }
          });
        }
      } finally {
        effects.dispose();
      }
    },
  );

  it('keeps the umbrella translucent and the flare compact', () => {
    const effects = new EventItemEffects();
    const actor = new Group();

    try {
      const umbrellaSample = createEventItemUseSample();
      umbrellaSample.effectKind = 'umbrella';
      umbrellaSample.primaryEffect = 1;
      effects.apply(umbrellaSample, actor);
      const canopy = effects.root.getObjectByName('event-item-umbrella-canopy') as Mesh;
      const canopyMaterial = canopy.material as Material;
      expect(canopyMaterial.transparent).toBe(true);
      expect(canopyMaterial.opacity).toBeLessThanOrEqual(0.75);
      expect(canopyMaterial.depthWrite).toBe(false);

      const flareSample = createEventItemUseSample();
      flareSample.effectKind = 'flare';
      flareSample.primaryEffect = 1;
      effects.apply(flareSample, actor);
      const halo = effects.root.getObjectByName('event-item-flare-halo') as Mesh;
      halo.geometry.computeBoundingSphere();
      expect(halo.geometry.boundingSphere!.radius).toBeLessThanOrEqual(0.18);
      expect((halo.material as Material).opacity).toBeLessThanOrEqual(0.35);
      const flareLight = effects.root.getObjectByName('event-item-flare-light') as PointLight;
      expect(flareLight.intensity).toBeGreaterThanOrEqual(6);
    } finally {
      effects.dispose();
    }
  });

  it('lights the held actor and clears the fill light', () => {
    const effects = new EventItemEffects();
    const actor = new Group();
    const sample = createEventItemUseSample();
    sample.cameraSpaceBlend = 1;

    effects.apply(sample, actor);
    const fill = effects.root.getObjectByName('event-item-held-fill') as PointLight;
    expect(fill.intensity).toBeGreaterThan(0);

    effects.clear();
    expect(fill.intensity).toBe(0);
    effects.dispose();
  });

  it('shows a curled hand only while the flashlight is held', () => {
    const hand = riggedHand();
    const effects = new EventItemEffects(hand.root);
    const sample = createEventItemUseSample();
    sample.cameraSpaceBlend = 1;
    effects.setHeldItem('flashlight');

    effects.apply(sample, new Group());
    expect(effects.root.getObjectByName('event-item-flashlight-hand')!.visible)
      .toBe(true);
    expect(hand.root.getObjectByName('IndexF_lower')!.rotation.x)
      .toBeGreaterThan(0);

    effects.setHeldItem(null);
    expect(effects.root.getObjectByName('event-item-flashlight-hand')!.visible)
      .toBe(false);
    effects.dispose();
  });

  it('keeps the anchor chain full length and above the anchor', () => {
    const effects = new EventItemEffects();
    const actor = new Group();
    const sample = createEventItemUseSample();
    sample.effectKind = 'chain';
    sample.primaryEffect = 1;
    sample.secondaryEffect = 1;

    effects.apply(sample, actor);

    const chain = effects.root.getObjectByName('event-item-chain')!;
    const links = chain.children;
    expect(chain.scale.toArray()).toEqual([1, 1, 1]);
    expect(links).toHaveLength(10);
    expect(links.at(-1)!.position.y).toBeGreaterThan(links[0]!.position.y);
    effects.dispose();
  });

  it('disposes each owned resource once', () => {
    const effects = new EventItemEffects();
    const disposals = ownedResources(effects.root)
      .map((resource) => vi.spyOn(resource, 'dispose'));
    const lightDisposals: ReturnType<typeof vi.spyOn>[] = [];
    effects.root.traverse((object) => {
      if (object instanceof PointLight) {
        lightDisposals.push(vi.spyOn(object.shadow, 'dispose'));
      }
    });

    effects.dispose();
    effects.dispose();

    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    lightDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
