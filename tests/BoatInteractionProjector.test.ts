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
  const pillowRoot = meshRoot('end-day-pillow', 0.5);
  const chestRoot = meshRoot('persistent-chest', 0.9);
  scene.add(
    supplyRoot,
    carlitosRoot,
    fishingRoot,
    repairRoot,
    pillowRoot,
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
    interactionTargets: vi.fn(() => []),
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
    pillowRoot,
    chestRoot,
    chestState: () => chestState,
    radioInteractionAvailable: () => true,
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
    fixture.roots.pillowRoot.visible = false;

    const anchors = fixture.projector.projectAnchors(1280, 720);

    expect(anchors.map(({ id }) => id)).toEqual([
      'supply:cannedFood',
      'carlitos',
      'fishing-tools',
      'repair-tools',
      'end-day-pillow',
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
    expect(anchors[0]!.hitArea).toMatchObject({ width: 36, height: 36 });
    expect(anchors.find(({ id }) => id === 'carlitos')).toMatchObject({
      label: 'CARLITOS',
      description: 'Check his hunger, happiness, and health.',
      hitArea: { width: 54, height: 54 },
    });
    expect(anchors.find(({ id }) => id === 'repair-tools')?.visible).toBe(false);
    expect(anchors.find(({ id }) => id === 'fishing-tools')?.hitArea).toMatchObject({
      width: 44,
      height: 72,
    });
    expect(anchors.find(({ id }) => id === 'end-day-pillow')).toMatchObject({
      toolId: 'pillow',
      visible: false,
    });
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

  it('places the fishing target on the upper rod section', () => {
    const fixture = createFixture();
    fixture.roots.fishingRoot.scale.y = 10;
    fixture.projector.installFocusedInteractionTargets([{
      id: 'full-fishing-bounds',
      label: 'FULL ROD',
      description: 'Full fishing rod bounds.',
      choiceId: 'inspect',
      root: fixture.roots.fishingRoot,
      minimumHitWidth: 0,
      minimumHitHeight: 0,
    }]);

    const anchors = fixture.projector.projectAnchors(1280, 720);
    const fishing = anchors.find(({ id }) => id === 'fishing-tools')!;
    const fullBounds = anchors.find(({ id }) => id === 'full-fishing-bounds')!;

    expect(fishing.hitArea!.height).toBeCloseTo(fullBounds.hitArea!.height * 0.44);
    expect(fishing.y).toBeCloseTo(fullBounds.y - fullBounds.hitArea!.height * 0.28);
  });

  it('projects event interaction and result roots through the host', () => {
    const fixture = createFixture();
    const interactionRoot = meshRoot('interaction', -0.4);
    const resultRoot = meshRoot('result', 0.4);
    (fixture.roots.carlitosRoot.parent as Scene).add(interactionRoot, resultRoot);
    fixture.setActiveEventId('drifting-supplies');
    vi.mocked(fixture.eventHost.interactionRoot).mockReturnValue(interactionRoot);
    vi.mocked(fixture.eventHost.resultRoot).mockReturnValue(resultRoot);

    const interaction = fixture.projector.projectEventInteraction(
      'drifting-supplies',
      1280,
      720,
    );
    const result = fixture.projector.projectEventResult('drifting-supplies', 1280, 720);

    expect(interaction).toMatchObject({ visible: true });
    expect(result).toMatchObject({ visible: true });
    expect(fixture.eventHost.interactionRoot).toHaveBeenCalledWith('drifting-supplies');
    expect(fixture.eventHost.resultRoot).toHaveBeenCalledWith('drifting-supplies');
    expect(fixture.projector.projectEventInteraction('drifting-supplies', 1280, 720))
      .toBe(interaction);
    expect(fixture.projector.projectEventResult('drifting-supplies', 1280, 720))
      .toBe(result);
    expect(fixture.projector.projectEventInteraction('drifting-supplies', 0, 720))
      .toBeNull();
  });

  it('uses featured roots and installed presenter metadata without frame rebuilds', () => {
    const fixture = createFixture();
    const featuredRoot = meshRoot('barrel', -0.5);
    const customRoot = meshRoot('custom', 0.5);
    const wreckageRoot = meshRoot('wreckage', 0.7);
    const chestRoot = fixture.roots.chestRoot;
    const targets = Object.freeze([
      Object.freeze({
        id: 'custom:signal',
        label: 'SIGNAL',
        description: 'Answer the custom signal.',
        choiceId: 'answer',
        root: customRoot,
        tooltip: true,
        minimumHitWidth: 91,
        minimumHitHeight: 73,
      }),
      Object.freeze({
        id: 'persistent-chest',
        label: 'OFFER',
        description: 'Offer this exact chest.',
        choiceId: 'offer',
        root: chestRoot,
      }),
      Object.freeze({
        id: 'event:wreckage',
        label: 'WRECKAGE',
        description: 'Inspect the floating debris.',
        focusEventId: 'wreckage',
        root: wreckageRoot,
      }),
    ]);
    (fixture.roots.carlitosRoot.parent as Scene).add(featuredRoot, customRoot, wreckageRoot);
    fixture.setActiveEventId('drifting-supplies');
    vi.mocked(fixture.eventHost.interactionRoot).mockImplementation((id) => {
      if (id === 'drifting-supplies') return featuredRoot;
      return null;
    });
    vi.mocked(fixture.eventHost.interactionTargets).mockReturnValue(targets);
    fixture.projector.installFocusedInteractionTargets(
      fixture.eventHost.interactionTargets(),
    );

    const anchors = fixture.projector.projectAnchors(1280, 720);

    expect(anchors.map(({ id }) => id).slice(-4)).toEqual([
      'event:drifting-supplies',
      'custom:signal',
      'persistent-chest',
      'event:wreckage',
    ]);
    expect(anchors.at(-4)).toMatchObject({
      label: 'SALVAGE',
      description: 'Floating salvage within reach.',
      tooltip: false,
      eventFocusId: 'drifting-supplies',
      hitArea: { width: 64, height: 64 },
    });
    expect(anchors.at(-3)).toMatchObject({
      label: 'SIGNAL',
      description: 'Answer the custom signal.',
      eventChoiceId: 'answer',
      tooltip: true,
      hitArea: { width: 91, height: 73 },
    });
    expect(anchors.at(-2)).toMatchObject({
      label: 'OFFER',
      description: 'Offer this exact chest.',
      eventChoiceId: 'offer',
      hitArea: { width: 64, height: 64 },
    });
    expect(anchors.at(-1)).toMatchObject({
      label: 'WRECKAGE',
      description: 'Inspect the floating debris.',
      eventFocusId: 'wreckage',
      hitArea: { width: 64, height: 64 },
    });

    const repeated = fixture.projector.projectAnchors(1280, 720);
    expect(repeated).toBe(anchors);
    expect(repeated.at(-2)).toBe(anchors.at(-2));
    expect(fixture.eventHost.interactionTargets).toHaveBeenCalledOnce();
    expect(fixture.eventHost.interactionRoot).toHaveBeenCalledTimes(2);

    fixture.projector.clearFocusedInteractionTargets();
    const cleared = fixture.projector.projectAnchors(1280, 720);
    expect(cleared.find(({ id }) => id === 'custom:signal')).toBeUndefined();
    expect(cleared.find(({ id }) => id === 'persistent-chest')).toMatchObject({
      label: 'OPEN',
      action: 'openChest',
    });
  });

  it('keeps installed targets when a replacement cache build fails', () => {
    const fixture = createFixture();
    const stableRoot = meshRoot('stable', 0.4);
    const replacementRoot = meshRoot('replacement', 0.6);
    const failingRoot = meshRoot('failing', 0.8);
    (fixture.roots.carlitosRoot.parent as Scene).add(
      stableRoot,
      replacementRoot,
      failingRoot,
    );
    fixture.projector.installFocusedInteractionTargets([{
      id: 'custom:stable',
      label: 'STABLE',
      description: 'Stable target.',
      choiceId: 'stable',
      root: stableRoot,
    }]);
    const failure = new Error('cache failure');
    vi.spyOn(failingRoot, 'updateWorldMatrix').mockImplementation(() => { throw failure; });

    expect(() => fixture.projector.installFocusedInteractionTargets([
      {
        id: 'custom:replacement',
        label: 'REPLACEMENT',
        description: 'Replacement target.',
        choiceId: 'replacement',
        root: replacementRoot,
      },
      {
        id: 'custom:failing',
        label: 'FAILING',
        description: 'Failing target.',
        choiceId: 'failing',
        root: failingRoot,
      },
    ])).toThrow(failure);

    const anchors = fixture.projector.projectAnchors(1280, 720);
    expect(anchors.find(({ id }) => id === 'custom:stable')).toBeDefined();
    expect(anchors.find(({ id }) => id === 'custom:replacement')).toBeUndefined();
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
