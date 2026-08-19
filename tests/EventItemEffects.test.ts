// Importance: 8/10 (scaled from 4/5). Protects event effect ownership, visibility, geometry, and cleanup.
import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  TorusGeometry,
  Vector3,
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
  'binocular-mask': null,
  'bucket-cover': null,
  flare: 'event-item-flare',
  chain: 'event-item-chain',
  flashlight: 'event-item-flashlight-beam',
  'shotgun-smoke': 'event-item-shotgun-smoke',
};

const actionEffects = [
  ['tape-stretch', 'event-item-tape'],
  ['flare-target', 'event-item-flare'],
  ['flashlight-flash', 'event-item-flashlight-beam'],
  ['shotgun-fire', 'event-item-shotgun-smoke'],
] as const satisfies readonly (readonly [EventItemUseContext, string])[];

function ownedResources(root: Group): readonly (BufferGeometry | Material)[] {
  const resources = new Set<BufferGeometry | Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material])
      .forEach((material) => resources.add(material));
  });
  return [...resources];
}

describe('EventItemEffects', () => {
  it('owns every named authored effect', () => {
    const effects = new EventItemEffects();

    expect(effects.root.getObjectByName('event-item-tape')).not.toBeNull();
    expect(effects.root.getObjectByName('event-item-net')).toBeUndefined();
    expect(effects.root.getObjectByName('event-item-flare')).not.toBeNull();
    expect(effects.root.getObjectByName('event-item-umbrella')).toBeUndefined();
    expect(effects.root.getObjectByName('event-item-flashlight-beam')).not.toBeNull();
    expect(effects.root.getObjectByName('event-item-flashlight-hand')).toBeUndefined();
    const smoke = effects.root.getObjectByName('event-item-shotgun-smoke') as Group;
    expect(smoke).not.toBeNull();
    expect(smoke.children).toHaveLength(6);
    smoke.children.forEach((puff) => {
      expect(puff.name).toMatch(/^event-item-shotgun-smoke-puff-/);
    });
    expect(effects.root.getObjectByName('event-item-binocular-mask')).toBeUndefined();

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
            if (!(object instanceof Mesh)) return;
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
            if (!(object instanceof Mesh)) return;
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

  it('builds a burning flare with glow, flame, smoke, and light', () => {
    const effects = new EventItemEffects();
    const actor = new Group();

    try {
      const flareSample = createEventItemUseSample();
      flareSample.effectKind = 'flare';
      flareSample.primaryEffect = 1;
      effects.apply(flareSample, actor);
      const flare = effects.root.getObjectByName('event-item-flare') as Group;
      const core = effects.root.getObjectByName('event-item-flare-core') as Mesh;
      core.geometry.computeBoundingSphere();
      expect(core.geometry.boundingSphere!.radius).toBeLessThanOrEqual(0.04);
      const halo = effects.root.getObjectByName('event-item-flare-halo') as Mesh;
      expect(halo).toBeInstanceOf(Mesh);
      expect((halo.material as MeshBasicMaterial).opacity).toBeGreaterThan(0.35);
      expect(effects.root.getObjectByName('event-item-flare-flame')).toBeInstanceOf(Mesh);
      expect(effects.root.getObjectByName('event-item-flare-smoke-3')).toBeInstanceOf(Mesh);
      const light = effects.root.getObjectByName('event-item-flare-light') as PointLight;
      expect(light.intensity).toBeGreaterThan(6);
      expect(light.distance).toBeGreaterThan(7);
      expect(flare.children.length).toBe(8);
    } finally {
      effects.dispose();
    }
  });

  it('moves the burning flare from the muzzle over an arc to the water', () => {
    const effects = new EventItemEffects();
    const actor = new Group();
    actor.position.set(2, 1, 3);
    const sample = createEventItemUseSample();
    sample.effectKind = 'flare';
    sample.primaryEffect = 1;

    try {
      effects.apply(sample, actor);
      effects.root.updateMatrixWorld(true);
      const flare = effects.root.getObjectByName('event-item-flare') as Group;
      const start = flare.getWorldPosition(actor.position.clone());

      actor.rotation.y = Math.PI / 2;
      sample.effectTravel = 0.5;
      sample.effectArc = 1;
      effects.apply(sample, actor);
      effects.root.updateMatrixWorld(true);
      const peak = flare.getWorldPosition(actor.position.clone());

      sample.effectTravel = 1;
      sample.effectArc = 0;
      effects.apply(sample, actor);
      effects.root.updateMatrixWorld(true);
      const impact = flare.getWorldPosition(actor.position.clone());

      expect(start.toArray()).toEqual([2.34, 1, 3]);
      expect(peak.x).toBeGreaterThan(start.x + 8);
      expect(peak.y).toBeGreaterThan(start.y + 2);
      expect(impact.x).toBeCloseTo(start.x + 21);
      expect(impact.y).toBeCloseTo(0.04);
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

  it('exposes the binocular screen-filter strength without world geometry', () => {
    const effects = new EventItemEffects();
    const actor = new Group();
    const sample = createEventItemUseSample();
    sample.effectKind = 'binocular-mask';
    sample.primaryEffect = 0.8;

    effects.apply(sample, actor);

    expect(effects.binocularMaskStrength).toBeCloseTo(0.8);
    expect(effects.root.getObjectByName('event-item-binocular-mask')).toBeUndefined();
    effects.clear();
    expect(effects.binocularMaskStrength).toBe(0);
    effects.dispose();
  });

  it('runs the anchor chain from the player seat over the gunwale to the anchor', () => {
    const effects = new EventItemEffects();
    const actorParent = new Group();
    const actor = new Group();
    actor.position.set(0.1, 0.9, 1.2);
    actorParent.add(actor);
    const sample = createEventItemUseSample();
    sample.effectKind = 'chain';
    sample.primaryEffect = 1;

    effects.apply(sample, actor);
    actor.position.set(2.1, 0.04, 0.55);
    sample.secondaryEffect = 1;
    effects.apply(sample, actor);
    effects.root.updateMatrixWorld(true);

    const chain = effects.root.getObjectByName('event-item-chain')!;
    const links = chain.children;
    expect(links).toHaveLength(36);
    links.forEach((link) => expect((link as Mesh).geometry).toBeInstanceOf(TorusGeometry));
    expect((links[0] as Mesh).material).toBeInstanceOf(MeshStandardMaterial);
    expect(((links[0] as Mesh).material as MeshStandardMaterial).metalness)
      .toBeGreaterThan(0.7);

    const boatAttachment = links[0]!.getWorldPosition(new Vector3());
    const gunwale = links[15]!.getWorldPosition(new Vector3());
    const anchor = links.at(-1)!.getWorldPosition(new Vector3());
    expect(boatAttachment.x).toBeCloseTo(0);
    expect(boatAttachment.y).toBeCloseTo(0.29);
    expect(boatAttachment.z).toBeCloseTo(1.48);
    expect(gunwale.x).toBeCloseTo(1.62, 1);
    expect(gunwale.y).toBeCloseTo(0.5, 1);
    expect(anchor.x).toBeCloseTo(actor.position.x);
    expect(anchor.y).toBeCloseTo(actor.position.y + 0.22);
    expect(anchor.z).toBeCloseTo(actor.position.z);
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
