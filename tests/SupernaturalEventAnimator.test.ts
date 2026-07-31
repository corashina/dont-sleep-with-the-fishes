// Importance: 4/5. Protects supernatural event staging, motion, and cleanup.
import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
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

  it('uses irregular fog strips and a non-square vertex-colored flare burst', () => {
    const { animator } = createAnimator();
    const fog = animator.worldRoot.getObjectByName('supernatural-fog-strip-1') as Mesh;
    const flare = animator.worldRoot.getObjectByName('supernatural-flare-flash') as Mesh<
      BufferGeometry,
      MeshBasicMaterial
    >;
    const fogPosition = fog.geometry.getAttribute('position');
    const fogHeights = new Set<number>();
    for (let index = 0; index < fogPosition.count; index += 1) {
      fogHeights.add(fogPosition.getY(index));
    }
    flare.geometry.computeBoundingBox();
    const flareSize = flare.geometry.boundingBox!.getSize(new Vector3());

    expect(fogPosition.count).toBeGreaterThan(4);
    expect(fogHeights.size).toBeGreaterThan(2);
    expect(flare.geometry.getAttribute('position').count).toBeGreaterThan(8);
    expect(flareSize.x).not.toBeCloseTo(flareSize.y);
    expect(flare.material.vertexColors).toBe(true);
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

  it('anchors the siren island into the sea without floating or tilting', () => {
    const { animator } = createAnimator();
    animator.stage('eerie-melody');
    const tableau = animator.worldRoot.getObjectByName('siren-tableau')!;

    animator.update(2.35, 0);
    const firstPosition = tableau.position.toArray();
    const firstQuaternion = tableau.quaternion.toArray();
    animator.update(7.8, 0);

    expect(tableau.position.y).toBeCloseTo(-0.26);
    expect(tableau.position.toArray()).toEqual(firstPosition);
    expect(tableau.quaternion.toArray()).toEqual(firstQuaternion);
    expect(tableau.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    animator.dispose();
  });

  it('keeps the revealed siren on the side and inside the fog', () => {
    const { animator } = createAnimator();
    animator.stage('eerie-melody');
    void animator.reveal('eerie-melody');

    animator.update(2.35, 2.2);

    const tableau = animator.worldRoot.getObjectByName('siren-tableau')!;
    expect(tableau.visible).toBe(true);
    expect(tableau.position.x).toBeLessThanOrEqual(-4);
    expect(tableau.position.z).toBeLessThanOrEqual(-9);
    expect(animator.worldRoot.getObjectByName('supernatural-fog-curtain')?.visible)
      .toBe(true);
    expect(tableau.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    const siren = animator.worldRoot.getObjectByName('event-siren')!;
    expect(Math.abs(siren.rotation.x)).toBeLessThan(0.01);
    expect(Math.abs(siren.rotation.z)).toBeLessThan(0.01);
    animator.dispose();
  });

  it('uses a readable night value hierarchy for the melody tableau', () => {
    const { animator } = createAnimator();
    animator.stage('eerie-melody');
    void animator.reveal('eerie-melody');

    animator.update(2.35, 2.2);

    const siren = animator.worldRoot.getObjectByName('event-siren')!;
    const sirenMesh = siren.getObjectByProperty('type', 'Mesh') as Mesh<
      BufferGeometry,
      MeshStandardMaterial
    >;
    const rock = animator.worldRoot.getObjectByName('event-siren-rock')!;
    const rockMesh = rock.getObjectByProperty('type', 'Mesh') as Mesh<
      BufferGeometry,
      MeshStandardMaterial
    >;
    const colorPeak = Math.max(
      sirenMesh.material.color.r,
      sirenMesh.material.color.g,
      sirenMesh.material.color.b,
    );
    const emissivePeak = Math.max(
      sirenMesh.material.emissive.r,
      sirenMesh.material.emissive.g,
      sirenMesh.material.emissive.b,
    ) * sirenMesh.material.emissiveIntensity;
    const rockPeak = Math.max(
      rockMesh.material.color.r,
      rockMesh.material.color.g,
      rockMesh.material.color.b,
    );

    expect(siren.visible).toBe(true);
    expect(rockPeak).toBeGreaterThanOrEqual(0.08);
    expect(colorPeak + emissivePeak).toBeGreaterThanOrEqual(0.52);
    expect(colorPeak + emissivePeak - rockPeak).toBeGreaterThanOrEqual(0.38);
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

  it('keeps item support checks side-effect free', () => {
    const { animator, supplyDisplay } = createAnimator();
    animator.stage('ghosts');
    vi.mocked(supplyDisplay.clearEventMotion).mockClear();
    vi.mocked(supplyDisplay.pinEventActor).mockClear();

    expect(animator.supportsItemUse('ghosts', 'flashlight')).toBe(true);
    expect(animator.supportsItemUse('ghosts', 'bucket')).toBe(false);
    expect(animator.worldRoot.getObjectByName('ghost-1')?.visible).toBe(true);
    expect(supplyDisplay.clearEventMotion).not.toHaveBeenCalled();
    expect(supplyDisplay.pinEventActor).not.toHaveBeenCalled();
    animator.dispose();
  });

  it('hides every Ghost during item use', async () => {
    const { animator } = createAnimator();
    animator.stage('ghosts');
    const itemUse = animator.playItemUse('ghosts', 'flashlight', 'flashlight-1');

    animator.update(1, 0.68);

    for (let index = 1; index <= 5; index += 1) {
      expect(animator.worldRoot.getObjectByName(`ghost-${index}`)?.visible).toBe(false);
    }
    animator.clear();
    await expect(itemUse).resolves.toBe(false);
    animator.dispose();
  });

  it('keeps a correct flare result clear and holds charging Ghosts after a wrong choice', async () => {
    const { animator } = createAnimator();
    animator.stage('ghosts');
    const safe = animator.react('ghosts', safeOutcome, {
      choiceId: 'flareGun',
      actors: [{ instanceId: 'flareGun-1', condition: 'consumed' }],
    });
    animator.update(1, 0.84);
    await safe;
    expect(animator.worldRoot.getObjectByName('ghost-1')?.visible).toBe(false);

    animator.stage('ghosts');
    const wrong = animator.react(
      'ghosts',
      safeOutcome,
      {
        choiceId: 'flashlight',
        actors: [{ instanceId: 'flashlight-1', condition: 'usable' }],
      },
    );
    const initialZ = animator.worldRoot.getObjectByName('ghost-3')!.position.z;
    animator.update(2, 0.42);
    expect(animator.worldRoot.getObjectByName('ghost-3')!.position.z).toBeGreaterThan(initialZ);
    animator.update(3, 0.42);
    await wrong;
    for (let index = 1; index <= 5; index += 1) {
      expect(animator.worldRoot.getObjectByName(`ghost-${index}`)?.visible).toBe(true);
    }
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
