// Importance: 4/5. Protects supernatural event staging, motion, and cleanup.
import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { SupernaturalEventAnimator } from '../src/survival/SupernaturalEventAnimator';

function createSupplyDisplay() {
  return {
    pinEventActor: vi.fn(() => true),
    applyEventItemPose: vi.fn(() => true),
    clearEventMotion: vi.fn(),
    clearEventPose: vi.fn(),
    releaseEventActor: vi.fn(),
    releaseEventActorOnNextSync: vi.fn(),
    resetEventPoseForFrame: vi.fn(),
  } as unknown as BoatSupplyDisplay;
}

function createEventModels(resources: Material[] = []): EventModelLibrary {
  return {
    create: vi.fn((id: string) => {
      const root = new Group();
      const material = new MeshStandardMaterial();
      vi.spyOn(material, 'dispose');
      resources.push(material);
      root.add(new Mesh(new BoxGeometry(0.5, 0.8, 0.4), material));
      if (id === 'siren') {
        const head = new Group();
        head.name = 'Formad_Head';
        root.add(head);
      }
      return root;
    }),
    animations: vi.fn(() => []),
    dispose: vi.fn(),
  } as unknown as EventModelLibrary;
}

function createAnimator(resources: Material[] = []) {
  const cameraRig = new Group();
  const supplyDisplay = createSupplyDisplay();
  const animator = new SupernaturalEventAnimator(
    cameraRig,
    supplyDisplay,
    createEventModels(resources),
  );
  return { animator, cameraRig, supplyDisplay };
}

const safeOutcome = {
  accepted: true,
  code: 'event-resolved',
  message: 'The mist closes.',
  deltas: {},
  cue: 'none',
} as const;

describe('SupernaturalEventAnimator', () => {
  it('stages Ghosts and Eerie Melody as separate readable tableaus', () => {
    const { animator } = createAnimator();

    animator.stage('ghosts');
    expect(animator.worldRoot.getObjectByName('ghost-1')?.visible).toBe(true);
    expect(animator.worldRoot.getObjectByName('siren-tableau')?.visible).toBe(false);

    animator.stage('eerie-melody');
    expect(animator.worldRoot.getObjectByName('ghost-1')?.visible).toBe(false);
    expect(animator.worldRoot.getObjectByName('siren-tableau')?.visible).toBe(true);

    animator.dispose();
  });

  it('settles a pending reveal and hides all models when cleared', async () => {
    const { animator } = createAnimator();
    animator.stage('ghosts');
    const pending = animator.reveal('ghosts');

    animator.clear();

    await expect(pending).resolves.toBeUndefined();
    expect(animator.worldRoot.children.every((child) => !child.visible)).toBe(true);
    animator.dispose();
  });

  it('uses the shared wave field to move and tilt the siren rock', () => {
    const { animator } = createAnimator();
    animator.stage('eerie-melody');
    const tableau = animator.worldRoot.getObjectByName('siren-tableau')!;

    animator.update(2.35, 0);

    expect(tableau.position.y).not.toBeCloseTo(0.3);
    expect(tableau.quaternion.toArray()).not.toEqual([0, 0, 0, 1]);
    animator.dispose();
  });

  it('pins supported item actors before motion and rejects unsupported pairs', async () => {
    const { animator, supplyDisplay } = createAnimator();
    const order: string[] = [];
    vi.mocked(supplyDisplay.pinEventActor).mockImplementation(() => {
      order.push('pin');
      return true;
    });
    vi.mocked(supplyDisplay.applyEventItemPose).mockImplementation(() => {
      order.push('pose');
      return true;
    });

    await expect(animator.playItemUse('ghosts', 'bucket', 'bucket-1')).resolves.toBe(false);
    const supported = animator.playItemUse('ghosts', 'flareGun', 'flareGun-1');

    expect(order.slice(0, 2)).toEqual(['pin', 'pose']);
    animator.clear();
    await expect(supported).resolves.toBe(false);
    animator.dispose();
  });

  it('dissolves safe Ghosts and holds the left ghost after an energy result', async () => {
    const { animator } = createAnimator();
    animator.stage('ghosts');
    const safe = animator.react('ghosts', safeOutcome, null);
    animator.update(1, 0.84);
    await safe;
    expect(animator.worldRoot.getObjectByName('ghost-1')?.visible).toBe(false);

    animator.stage('ghosts');
    const tiring = animator.react(
      'ghosts',
      { ...safeOutcome, deltas: { energy: -1 } },
      null,
    );
    animator.update(2, 0.84);
    await tiring;
    expect(animator.worldRoot.getObjectByName('ghost-1')?.visible).toBe(true);
    expect(animator.worldRoot.getObjectByName('ghost-2')?.visible).toBe(false);
    animator.dispose();
  });

  it('turns the named siren head and hides the tableau after a safe reaction', async () => {
    const { animator } = createAnimator();
    animator.stage('eerie-melody');
    const head = animator.worldRoot.getObjectByName('Formad_Head')!;
    const baseYaw = head.rotation.y;
    const reveal = animator.reveal('eerie-melody');

    animator.update(2, 3.2);

    expect(head.rotation.y).toBeGreaterThan(baseYaw);
    animator.clear();
    await reveal;

    animator.stage('eerie-melody');
    const reaction = animator.react('eerie-melody', safeOutcome, null);
    animator.update(3, 0.84);
    await reaction;
    expect(animator.worldRoot.getObjectByName('siren-tableau')?.visible).toBe(false);
    animator.dispose();
  });

  it('falls back to the siren root yaw when the named head is absent', () => {
    const cameraRig = new Group();
    const supplyDisplay = createSupplyDisplay();
    const eventModels = createEventModels();
    vi.mocked(eventModels.create).mockImplementation((id) => {
      const root = new Group();
      root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
      root.name = id;
      return root;
    });
    const animator = new SupernaturalEventAnimator(cameraRig, supplyDisplay, eventModels);
    animator.stage('eerie-melody');
    const siren = animator.worldRoot.getObjectByName('event-siren')!;
    const baseYaw = siren.rotation.y;
    void animator.reveal('eerie-melody');

    animator.update(2, 3.2);

    expect(siren.rotation.y).toBeGreaterThan(baseYaw);
    animator.dispose();
  });

  it('moves the siren toward the boat for one damaging strike', async () => {
    const { animator } = createAnimator();
    animator.stage('eerie-melody');
    const siren = animator.worldRoot.getObjectByName('event-siren')!;
    const baseZ = siren.position.z;
    const attack = animator.react(
      'eerie-melody',
      { ...safeOutcome, deltas: { hull: -30 } },
      null,
    );

    animator.update(2, 0.42);

    expect(siren.position.z).toBeGreaterThan(baseZ + 1);
    animator.update(3, 0.42);
    await attack;
    expect(animator.worldRoot.getObjectByName('siren-tableau')?.visible).toBe(false);
    animator.dispose();
  });

  it('disposes every owned resource once across repeated disposal', () => {
    const importedMaterials: Material[] = [];
    const { animator } = createAnimator(importedMaterials);
    const geometries = new Set<BoxGeometry>();
    const ownedMaterials = new Set<Material>();
    animator.worldRoot.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry as BoxGeometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => ownedMaterials.add(material));
    });
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = [...ownedMaterials].map((material) => vi.spyOn(material, 'dispose'));

    animator.dispose();
    animator.dispose();

    importedMaterials.forEach((material) => {
      expect(material.dispose).toHaveBeenCalledOnce();
    });
    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
