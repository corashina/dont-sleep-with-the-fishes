import {
  BufferGeometry,
  Group,
  LineSegments,
  Material,
  Mesh,
  PointLight,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import {
  createEventItemUseSample,
  type EventItemEffectKind,
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
  harpoon: 'event-item-harpoon',
};

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

describe('EventItemEffects', () => {
  it('owns every named authored effect', () => {
    const effects = new EventItemEffects();

    expect(effects.root.getObjectByName('event-item-tape')).not.toBeNull();
    expect(effects.root.getObjectByName('event-item-net')).not.toBeNull();
    expect(effects.root.getObjectByName('event-item-flare')).not.toBeNull();
    expect(effects.root.getObjectByName('event-item-flashlight-beam')).not.toBeNull();
    expect(effects.root.getObjectByName('event-item-harpoon')).not.toBeNull();
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
