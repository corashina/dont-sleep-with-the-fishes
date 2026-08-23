// Importance: 9/10. Protects stable interaction targets and projection reuse.
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  BoatInteractionProjector,
  type BoatInteractionProjectorRoots,
  type EventInteractionProjectionHost,
} from '../src/survival/BoatInteractionProjector';
import type { BoatSupplyPresentationRecord } from '../src/survival/BoatSupplyDisplay';
import type { FeaturedEventId } from '../src/survival/eventPresentationRoutes';

function meshRoot(name: string, x = 0, y = 0, z = -5): Group {
  const root = new Group();
  root.name = name;
  root.position.set(x, y, z);
  root.add(new Mesh(
    new BoxGeometry(0.2, 0.2, 0.2),
    new MeshBasicMaterial(),
  ));
  return root;
}

interface ProjectorFixture {
  readonly projector: BoatInteractionProjector;
  readonly roots: BoatInteractionProjectorRoots;
  readonly eventHost: EventInteractionProjectionHost;
  readonly supplyRecord: BoatSupplyPresentationRecord;
  setActiveEventId(id: FeaturedEventId | null): void;
  setChestState(state: 'none' | 'closed' | 'mimic'): void;
}

function createFixture(): ProjectorFixture {
  const scene = new Scene();
  const camera = new PerspectiveCamera(65, 16 / 9, 0.1, 100);
  camera.updateProjectionMatrix();
  const supplyRoot = meshRoot('supply:cannedFood', -1.1);
  const carlitosRoot = new Group();
  const carlitosInteractionRoot = meshRoot('carlitos-interaction', -0.7);
  carlitosRoot.add(carlitosInteractionRoot);
  const fishingRoot = meshRoot('fishing-tools', -0.3);
  const fishingVisibilityRoot = new Group();
  fishingRoot.add(fishingVisibilityRoot);
  const repairRoot = meshRoot('repair-tools', 0.1);
  const lanternRoot = meshRoot('end-day-lantern', 0.5);
  const chestRoot = meshRoot('persistent-chest', 0.9);
  scene.add(
    supplyRoot,
    carlitosRoot,
    fishingRoot,
    repairRoot,
    lanternRoot,
    chestRoot,
  );

  const supplyRecord = {
    groupId: 'cannedFood',
    root: supplyRoot,
    quantity: 2,
    usableQuantity: 1,
    brokenQuantity: 1,
    visibleCopies: 1,
    backingInstanceId: 'cannedFood-1',
  } as BoatSupplyPresentationRecord;
  let activeEventId: FeaturedEventId | null = null;
  let chestState: 'none' | 'closed' | 'mimic' = 'closed';
  const eventHost: EventInteractionProjectionHost = {
    activeEventId: vi.fn(() => activeEventId),
    interactionRoot: vi.fn(() => null),
    resultRoot: vi.fn(() => null),
    itemAimTarget: vi.fn(() => null),
  };
  const roots: BoatInteractionProjectorRoots = {
    supplyRecords: [supplyRecord],
    carlitosRoot,
    carlitosInteractionRoot,
    fishingRoot,
    fishingVisibilityRoot,
    repairRoot,
    lanternRoot,
    chestRoot,
    chestState: () => chestState,
    activeFeaturedEventId: () => activeEventId,
  };
  return {
    projector: new BoatInteractionProjector(scene, camera, roots, eventHost),
    roots,
    eventHost,
    supplyRecord,
    setActiveEventId: (id) => { activeEventId = id; },
    setChestState: (state) => { chestState = state; },
  };
}

describe('BoatInteractionProjector', () => {
  it('keeps anchor order, metadata, hidden targets, and minimum hit bounds', () => {
    const fixture = createFixture();
    fixture.roots.repairRoot.position.x = 100;
    fixture.roots.lanternRoot.visible = false;

    const anchors = fixture.projector.projectAnchors(1280, 720);

    expect(anchors.map(({ id }) => id)).toEqual([
      'supply:cannedFood',
      'carlitos',
      'fishing-tools',
      'repair-tools',
      'end-day-lantern',
      'persistent-chest',
    ]);
    expect(anchors[0]).toMatchObject({
      itemType: 'cannedFood',
      supplyGroupId: 'cannedFood',
      action: 'eat',
      depleted: false,
      remainingUses: 1,
      quantity: 2,
      usableQuantity: 1,
      brokenQuantity: 1,
      backingInstanceId: 'cannedFood-1',
    });
    expect(anchors[0]!.hitArea).toMatchObject({ width: 44, height: 44 });
    expect(anchors.find(({ id }) => id === 'carlitos')).toMatchObject({
      label: 'CARLITOS',
      description: 'Check his hunger, happiness, and health.',
      hitArea: { width: 54, height: 54 },
    });
    expect(anchors.find(({ id }) => id === 'repair-tools')?.visible).toBe(false);
    expect(anchors.find(({ id }) => id === 'end-day-lantern')?.visible).toBe(false);
    expect(anchors.find(({ id }) => id === 'persistent-chest')).toMatchObject({
      label: 'OPEN',
      action: 'openChest',
      hitArea: { width: 54, height: 54 },
    });
  });

  it('returns one empty output for zero viewports', () => {
    const fixture = createFixture();

    const zeroWidth = fixture.projector.projectAnchors(0, 720);

    expect(zeroWidth).toEqual([]);
    expect(fixture.projector.projectAnchors(1280, 0)).toBe(zeroWidth);
  });

  it('projects event interaction and result roots through the host', () => {
    const fixture = createFixture();
    const interactionRoot = meshRoot('interaction', -0.4);
    const resultRoot = meshRoot('result', 0.4);
    (fixture.roots.carlitosRoot.parent as Scene).add(interactionRoot, resultRoot);
    fixture.setActiveEventId('drifting-barrel');
    vi.mocked(fixture.eventHost.interactionRoot).mockReturnValue(interactionRoot);
    vi.mocked(fixture.eventHost.resultRoot).mockReturnValue(resultRoot);

    const interaction = fixture.projector.projectEventInteraction(
      'drifting-barrel',
      1280,
      720,
    );
    const result = fixture.projector.projectEventResult('drifting-barrel', 1280, 720);

    expect(interaction).toMatchObject({ visible: true });
    expect(result).toMatchObject({ visible: true });
    expect(fixture.eventHost.interactionRoot).toHaveBeenCalledWith('drifting-barrel');
    expect(fixture.eventHost.resultRoot).toHaveBeenCalledWith('drifting-barrel');
    expect(fixture.projector.projectEventInteraction('drifting-barrel', 1280, 720))
      .toBe(interaction);
    expect(fixture.projector.projectEventResult('drifting-barrel', 1280, 720))
      .toBe(result);
    expect(fixture.projector.projectEventInteraction('drifting-barrel', 0, 720))
      .toBeNull();
  });

  it('uses host roots for featured and focused targets', () => {
    const fixture = createFixture();
    const featuredRoot = meshRoot('barrel', -0.5);
    const handRoot = meshRoot('hand', 0.5);
    (fixture.roots.carlitosRoot.parent as Scene).add(featuredRoot, handRoot);
    fixture.setActiveEventId('drifting-barrel');
    vi.mocked(fixture.eventHost.interactionRoot).mockImplementation((id) => {
      if (id === 'drifting-barrel') return featuredRoot;
      if (id === 'handyman:hand') return handRoot;
      return null;
    });

    const anchors = fixture.projector.projectAnchors(1280, 720);

    expect(anchors.map(({ id }) => id).slice(-2)).toEqual([
      'event:drifting-barrel',
      'handyman:hand',
    ]);
    expect(anchors.at(-2)).toMatchObject({
      label: 'BARREL',
      description: 'Floating salvage within reach.',
      tooltip: false,
      eventFocusId: 'drifting-barrel',
      hitArea: { width: 64, height: 64 },
    });
    expect(anchors.at(-1)).toMatchObject({
      label: 'HAND',
      eventChoiceId: 'touch',
      tooltip: false,
      hitArea: { width: 82, height: 82 },
    });
  });

  it('reuses outputs until anchor membership changes', () => {
    const fixture = createFixture();
    const first = fixture.projector.projectAnchors(1280, 720);
    const firstSupply = first[0];
    const firstHitArea = firstSupply!.hitArea;

    fixture.roots.carlitosRoot.position.x = 0.2;
    const second = fixture.projector.projectAnchors(1280, 720);

    expect(second).toBe(first);
    expect(second[0]).toBe(firstSupply);
    expect(second[0]!.hitArea).toBe(firstHitArea);

    Object.assign(fixture.supplyRecord, { visibleCopies: 0 });
    const withoutSupply = fixture.projector.projectAnchors(1280, 720);
    expect(withoutSupply).not.toBe(first);
    expect(withoutSupply.some(({ id }) => id === 'supply:cannedFood')).toBe(false);

    Object.assign(fixture.supplyRecord, { visibleCopies: 1 });
    const restored = fixture.projector.projectAnchors(1280, 720);
    expect(restored).not.toBe(withoutSupply);
    expect(restored[0]).toBe(firstSupply);
  });

  it('resolves aim targets and disposes once', () => {
    const fixture = createFixture();
    const target = new Object3D();
    vi.mocked(fixture.eventHost.itemAimTarget).mockReturnValue(target);

    expect(fixture.projector.eventItemAimTarget('dangerous-waters')).toBe(target);
    expect(fixture.eventHost.itemAimTarget).toHaveBeenCalledOnce();

    fixture.projector.dispose();
    fixture.projector.dispose();

    expect(fixture.projector.eventItemAimTarget('dangerous-waters')).toBeNull();
    expect(fixture.projector.projectAnchors(1280, 720)).toEqual([]);
    expect(fixture.projector.projectEventInteraction('dangerous-waters', 1280, 720))
      .toBeNull();
  });
});
