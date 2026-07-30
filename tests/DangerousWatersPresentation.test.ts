// Importance: 5/5. Protects the Dangerous Waters model, motion, and ownership.
import { Material, Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  DangerousWatersPresentation,
  type DangerousWatersBoatReaction,
  type DangerousWatersItemPose,
} from '../src/survival/DangerousWatersPresentation';

function pose(): DangerousWatersItemPose {
  return {
    x: 0, y: 0, z: 0,
    yaw: 0, pitch: 0, roll: 0,
    scaleX: 1, scaleY: 1, scaleZ: 1,
  };
}

function boatReaction(): DangerousWatersBoatReaction {
  return { pitch: 0, yaw: 0, roll: 0, cameraZ: 0, lightScale: 1 };
}

describe('DangerousWatersPresentation', () => {
  it('builds an authored passage, lurker, foam, and fixed fragments', () => {
    const view = new DangerousWatersPresentation();

    expect(view.root.name).toBe('dangerous-waters-presentation');
    expect(view.root.getObjectByName('dangerous-waters-rock:foreground')).toBeDefined();
    expect(view.root.getObjectByName('dangerous-waters-rock:port')).toBeDefined();
    expect(view.root.getObjectByName('dangerous-waters-rock:starboard')).toBeDefined();
    expect(view.root.getObjectByName('dangerous-waters-lurker')).toBeDefined();
    expect(view.root.getObjectByName('dangerous-waters-lurker:grip-fin')).toBeDefined();
    expect(view.root.getObjectByName('dangerous-waters-foam')?.children).toHaveLength(12);
    expect(view.root.getObjectByName('dangerous-waters-fragments')?.children).toHaveLength(8);

    view.dispose();
  });

  it('reveals the passage before the lurker and holds the final pose', async () => {
    const view = new DangerousWatersPresentation();
    const lurker = view.root.getObjectByName('dangerous-waters-lurker')!;

    view.stage();
    expect(view.root.visible).toBe(true);
    expect(lurker.scale.y).toBe(0);

    const reveal = view.reveal();
    view.update(1.2, 1.2);
    expect(lurker.scale.y).toBeLessThan(0.5);
    view.update(2.4, 1.2);
    await reveal;
    expect(lurker.scale.y).toBe(1);

    view.dispose();
  });

  it.each(['map', 'compass', 'sleep'] as const)(
    'plays and restores %s passage motion',
    async (choiceId) => {
      const view = new DangerousWatersPresentation();
      view.stage();
      const reveal = view.reveal();
      view.update(2.4, 2.4);
      await reveal;
      const passage = view.root.getObjectByName('dangerous-waters-passage')!;
      const base = passage.position.clone();

      const motion = view.playChoice(choiceId);
      view.update(0.55, 0.55);
      expect(passage.position.toArray()).not.toEqual(base.toArray());
      view.update(1.1, 0.55);
      await motion;
      expect(passage.position.toArray()).toEqual(base.toArray());
      view.dispose();
    },
  );

  it('authors distinct Map and Compass prop poses', () => {
    const view = new DangerousWatersPresentation();
    const itemPose = pose();

    view.stage();
    void view.playChoice('map');
    view.update(0.55, 0.55);
    expect(view.copyItemPose(itemPose)).toBe(true);
    expect(itemPose.scaleX).toBeGreaterThan(1);

    view.clear();
    view.stage();
    void view.playChoice('compass');
    view.update(0.55, 0.55);
    expect(view.copyItemPose(itemPose)).toBe(true);
    expect(Math.abs(itemPose.yaw)).toBeGreaterThan(0.1);
    view.dispose();
  });

  it('dims the Sleep beat and restores borrowed light scale', async () => {
    const view = new DangerousWatersPresentation();
    const reaction = boatReaction();
    view.stage();

    const motion = view.playChoice('sleep');
    view.update(0.55, 0.55);
    expect(view.copyBoatReaction(reaction)).toBe(true);
    expect(reaction.lightScale).toBeLessThan(0.7);
    view.update(1.1, 0.55);
    await motion;
    view.copyBoatReaction(reaction);
    expect(reaction.lightScale).toBe(1);
    view.dispose();
  });

  it.each([
    ['safe', {}, 0],
    ['damage', { hull: -7 }, 0],
    ['severe', { hull: -25 }, 8],
  ] as const)('plays the %s result pose', async (_name, deltas, visibleFragments) => {
    const view = new DangerousWatersPresentation();
    view.stage();
    const reaction = view.react({
      accepted: true,
      code: 'event-resolved',
      message: 'Result.',
      deltas,
      cue: 'impact',
    });
    view.update(0.45, 0.45);
    const fragments = view.root.getObjectByName('dangerous-waters-fragments')!;
    expect(fragments.children.filter(({ visible }) => visible)).toHaveLength(visibleFragments);
    view.update(0.9, 0.45);
    await reaction;
    view.dispose();
  });

  it('uses a larger borrowed boat reaction for severe damage', () => {
    const damage = new DangerousWatersPresentation();
    const severe = new DangerousWatersPresentation();
    const damagePose = boatReaction();
    const severePose = boatReaction();
    damage.stage();
    severe.stage();
    void damage.react({
      accepted: true, code: 'event-resolved', message: 'Hit.',
      deltas: { hull: -7 }, cue: 'impact',
    });
    void severe.react({
      accepted: true, code: 'event-resolved', message: 'Hit.',
      deltas: { hull: -25 }, cue: 'impact',
    });
    damage.update(0.45, 0.45);
    severe.update(0.45, 0.45);
    damage.copyBoatReaction(damagePose);
    severe.copyBoatReaction(severePose);
    expect(severePose.pitch).toBeGreaterThan(damagePose.pitch);
    damage.dispose();
    severe.dispose();
  });

  it('reuses fixed pool members across updates', () => {
    const view = new DangerousWatersPresentation();
    const foam = view.root.getObjectByName('dangerous-waters-foam')!;
    const fragments = view.root.getObjectByName('dangerous-waters-fragments')!;
    const foamMembers = [...foam.children];
    const fragmentMembers = [...fragments.children];
    view.stage();
    void view.reveal();
    view.update(0.5, 0.5);
    view.update(1, 0.5);
    expect(foam.children).toEqual(foamMembers);
    expect(fragments.children).toEqual(fragmentMembers);
    view.dispose();
  });

  it('settles an active handle and disposes each resource once', async () => {
    const view = new DangerousWatersPresentation();
    const resources = new Set<Material | Mesh['geometry']>();
    view.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => resources.add(material));
    });
    const disposals = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));

    view.stage();
    const reveal = view.reveal();
    view.settleForVisibilityChange();
    await reveal;
    view.dispose();
    view.dispose();

    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
