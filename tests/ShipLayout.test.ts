// Importance: 8/10 (scaled from 4/5). Protects reachable ship layout constraints.
import { describe, expect, it } from 'vitest';
import { SHIP_LAYOUT, SHIP_ROOF_ENGINE } from '../src/world/shipLayoutData';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
  SHIP_ROOM_ROOF_THICKNESS,
  SHIP_ROOM_WALL_HEIGHT,
  SHIP_ROOM_WALL_THICKNESS,
  SHIP_TRANSVERSE_PORTHOLE_CENTER_X,
  type ShipZoneId,
} from '../src/world/ShipLayoutTypes';
import {
  furnitureRect,
} from '../src/world/ShipNavigation';

interface TestRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function rectsOverlap(left: TestRect, right: TestRect): boolean {
  return left.minX < right.maxX && left.maxX > right.minX
    && left.minZ < right.maxZ && left.maxZ > right.minZ;
}

function expectClosedLaneCycle(prefix: string, minimumLaneCount = 4): void {
  const lanes = SHIP_LAYOUT.lanes.filter(({ id }) => id.startsWith(prefix));
  expect(lanes.length).toBeGreaterThanOrEqual(minimumLaneCount);
  const neighbors = lanes.map((lane, index) => lanes
    .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
    .filter(({ candidate, candidateIndex }) => candidateIndex !== index
      && rectsOverlap(lane.bounds, candidate.bounds))
    .map(({ candidateIndex }) => candidateIndex));
  neighbors.forEach((laneNeighbors, index) => expect(
    laneNeighbors.length,
    lanes[index]!.id,
  ).toBeGreaterThanOrEqual(2));
  const visited = new Set<number>([0]);
  const pending = [0];
  while (pending.length > 0) {
    const current = pending.pop()!;
    neighbors[current]!.forEach((neighbor) => {
      if (visited.has(neighbor)) return;
      visited.add(neighbor);
      pending.push(neighbor);
    });
  }
  expect(visited.size).toBe(lanes.length);
}

describe('scavenging ship layout', () => {
  const minimumSpots = {
    crewCabin: 10,
    wheelhouse: 3,
    storageWorkroom: 8,
    centralCargo: 11,
    bow: 1,
    stern: 2,
  } as const;

  it('provides the approved spread of raised item spots', () => {
    const surfaces = SHIP_LAYOUT.furniture.flatMap(({ surfaces }) => surfaces);
    expect(surfaces.length).toBeGreaterThanOrEqual(40);
    for (const [regionId, minimum] of Object.entries(minimumSpots)) {
      const regionSurfaces = surfaces.filter((surface) => surface.regionId === regionId);
      expect(new Set(regionSurfaces.map(({ physicalSlotId }) => physicalSlotId)).size)
        .toBeGreaterThanOrEqual(minimum);
    }
    expect(surfaces.filter(({ branch }) => branch)).toHaveLength(9);
  });

  it('authors closed, connected room lane cycles', () => {
    expectClosedLaneCycle('crew-loop-', 7);
    expectClosedLaneCycle('wheelhouse-loop-');
    expectClosedLaneCycle('workroom-loop-', 7);
  });

  it('authors linked room loops and protected ship routes', () => {
    const targetIds = SHIP_LAYOUT.targets.map(({ id }) => id);
    const laneIds = SHIP_LAYOUT.lanes.map(({ id }) => id);
    for (const room of ['crew', 'wheelhouse', 'workroom'] as const) {
      expect(targetIds.filter((id) => id.startsWith(`${room}-loop-`))).toHaveLength(2);
    }
    expect(laneIds).toEqual(expect.arrayContaining([
      'cargo-port-full-route',
      'cargo-starboard-full-route',
      'cargo-forward-cross-route',
      'cargo-aft-cross-route',
      'crew-loop-aft-cross',
      'crew-loop-forward-cross',
      'wheelhouse-loop-port',
      'wheelhouse-loop-starboard',
      'workroom-loop-aft-cross',
      'workroom-loop-forward-cross',
    ]));

    expect(SHIP_LAYOUT.targets.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'crew-ladder-route',
      'deck-hatch-route',
      'mainmast-route',
      'evacuation',
    ]));
    SHIP_LAYOUT.doors.forEach(({ id }) => {
      expect(SHIP_LAYOUT.targets.map(({ id: targetId }) => targetId))
        .toEqual(expect.arrayContaining([`${id}-inside`, `${id}-outside`]));
    });
  });

  it('uses plausible raised cargo owners at both end decks', () => {
    const endSurfaces = SHIP_LAYOUT.furniture.flatMap((owner) =>
      owner.surfaces
        .filter(({ regionId }) => regionId === 'bow' || regionId === 'stern')
        .map((surface) => ({ owner, surface })));

    expect(endSurfaces).toHaveLength(3);
    endSurfaces.forEach(({ owner, surface }) => {
      expect(['cargoCrate', 'barrel']).toContain(owner.modelId);
      expect(surface.branch).toBe(false);
      expect(owner.position[1]).toBe(FREIGHTER_DIMENSIONS.deckY);
    });
  });

  it('moves bow cargo inside and keeps searchable stern cargo clear of machinery', () => {
    const bowOwners = SHIP_LAYOUT.furniture.filter((owner) =>
      owner.surfaces.some(({ regionId }) => regionId === 'bow'));
    expect(bowOwners.map(({ id }) => id)).toEqual(['bow-crate-starboard']);
    expect(bowOwners[0]!.position[0]).toBe(0);

    expect(SHIP_LAYOUT.furniture.some(({ modelId }) => modelId === 'cargoBox')).toBe(false);
    for (const id of ['crew-wall-crate-starboard', 'crew-wall-barrel-port']) {
      const owner = SHIP_LAYOUT.furniture.find((candidate) => candidate.id === id)!;
      expect(owner.zoneId).toBe('cargoDeck');
      expect(owner.surfaces.map(({ id: surfaceId }) => surfaceId)).toEqual([`${id}:top`]);
      expect(owner.surfaces[0]?.regionId).toBe('centralCargo');
    }

    expect(SHIP_LAYOUT.furniture.some(({ id }) => id.startsWith('deck-bench-'))).toBe(false);
    expect(SHIP_LAYOUT.furniture.filter(({ modelId }) => modelId === 'cargoRack')).toHaveLength(3);

    const storage = SHIP_LAYOUT.zones.find(
      ({ id }) => id === 'storageWorkroom',
    )!.bounds;
    const sternOwners = SHIP_LAYOUT.furniture.filter((owner) =>
      owner.surfaces.some(({ regionId }) => regionId === 'stern'));
    const sternOwnerRect = (id: string) => furnitureRect(
      sternOwners.find((owner) => owner.id === id)!,
    );
    sternOwners.forEach(({ position }) => expect(position[2]).toBeLessThan(storage.minZ));
    for (const id of ['stern-crate-port', 'stern-crate-starboard']) {
      expect(sternOwnerRect(id).maxZ).toBeCloseTo(storage.minZ - 0.02);
    }
  });

  it('keeps two searchable stern crates against the storage wall', () => {
    const sternOwner = (id: string) => SHIP_LAYOUT.furniture.find(
      (owner) => owner.id === id,
    )!;
    const storage = SHIP_LAYOUT.zones.find(
      ({ id }) => id === 'storageWorkroom',
    )!.bounds;
    const chimneyCrates = ['stern-crate-port', 'stern-crate-starboard']
      .map(sternOwner);

    expect(chimneyCrates.map(({ modelId }) => modelId)).toEqual([
      'cargoCrate',
      'cargoCrate',
    ]);
    chimneyCrates.forEach(({ id, surfaces }) => {
      expect(furnitureRect(sternOwner(id)).maxZ).toBeCloseTo(storage.minZ - 0.02);
      expect(surfaces.map(({ id: surfaceId }) => surfaceId)).toEqual([`${id}:top`]);
    });
    expect(chimneyCrates.map(({ position }) => position[0])).toEqual([
      (storage.minX - SHIP_TRANSVERSE_PORTHOLE_CENTER_X) / 2,
      (storage.maxX + SHIP_TRANSVERSE_PORTHOLE_CENTER_X) / 2,
    ]);

    expect(SHIP_LAYOUT.furniture.filter((owner) =>
      owner.surfaces.some(({ regionId }) => regionId === 'stern'))
      .map(({ id }) => id)).toEqual([
      'stern-crate-port',
      'stern-crate-starboard',
    ]);
  });

  it('defines the approved enlarged single-level plan', () => {
    expect(FREIGHTER_DIMENSIONS).toEqual({ width: 16.25, length: 55, deckY: 2.22 });

    const zone = (id: ShipZoneId) =>
      SHIP_LAYOUT.zones.find((candidate) => candidate.id === id)!.bounds;
    const crew = zone('crewCabin');
    const wheelhouse = zone('wheelhouse');
    const storage = zone('storageWorkroom');

    expect(crew.maxX - crew.minX).toBeCloseTo(11.5);
    expect(storage.maxX - storage.minX).toBeCloseTo(11.5);
    expect(wheelhouse.maxX - wheelhouse.minX).toBeCloseTo(11);
    expect(wheelhouse.minZ - crew.maxZ).toBeCloseTo(3.5);
    expect(SHIP_LAYOUT.zones.find(({ id }) => id === 'wheelhouse')!.polygon).toEqual([
      [-5.5, 17],
      [5.5, 17],
      [5.5, 20.7],
      [4.2, 22],
      [-4.2, 22],
      [-5.5, 20.7],
    ]);
    expect(SHIP_LAYOUT.furniture.find(({ id }) => id === 'helm-desk-forward')).toBeUndefined();
    expect(FREIGHTER_DIMENSIONS.deckY).toBe(2.22);
  });

  it('centers the chart table at the front window and keeps the other table clear', () => {
    const fixture = (id: string) => SHIP_LAYOUT.furniture.find(
      (candidate) => candidate.id === id,
    )!;
    const tables = [fixture('chart-table-port'), fixture('chart-table-forward')];

    expect(tables.map(({ position }) => position)).toEqual([
      [0, FREIGHTER_DIMENSIONS.deckY, 21.15],
      [-4.12, FREIGHTER_DIMENSIONS.deckY, 17.615],
    ]);
    tables.forEach(({ id, surfaces }) => {
      expect(surfaces.map(({ id: surfaceId }) => surfaceId)).toEqual([`${id}:top`]);
    });
    tables.forEach(({ rotationY }) => expect(rotationY).toBe(0));
    const frontTableBounds = furnitureRect(tables[0]!);
    const wheelhouse = SHIP_LAYOUT.zones.find(({ id }) => id === 'wheelhouse')!.bounds;
    expect(frontTableBounds.minX).toBeCloseTo(-frontTableBounds.maxX);
    expect(wheelhouse.maxZ - SHIP_ROOM_WALL_THICKNESS - frontTableBounds.maxZ)
      .toBeLessThan(0.15);
    const portCornerTable = fixture('chart-table-forward');
    const portCornerBounds = furnitureRect(portCornerTable);
    const portDoor = SHIP_LAYOUT.doors.find(({ id }) => id === 'wheelhouse-port-door')!;
    expect(portCornerTable.scale).toEqual([1, 1, 0.58]);
    expect(portCornerBounds.minX).toBeGreaterThan(
      wheelhouse.minX + SHIP_ROOM_WALL_THICKNESS,
    );
    expect(portCornerBounds.minZ).toBeGreaterThan(
      wheelhouse.minZ + SHIP_ROOM_WALL_THICKNESS,
    );
    expect(portCornerBounds.maxZ).toBeLessThan(portDoor.approach.minZ);
    expect(SHIP_LAYOUT.furniture.some(({ modelId }) => modelId === 'cargoBox')).toBe(false);
    expect(fixture('crew-wall-barrel-port').position)
      .toEqual([-4.7, FREIGHTER_DIMENSIONS.deckY, 14.0647535]);
    expect(fixture('crew-wall-crate-starboard').position)
      .toEqual([4.7, FREIGHTER_DIMENSIONS.deckY, 14.025]);
    const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
    for (const id of ['crew-wall-barrel-port', 'crew-wall-crate-starboard']) {
      expect(furnitureRect(fixture(id)).minZ).toBeCloseTo(crew.maxZ);
    }
  });

  it('keeps fixed rooms while reducing both exterior walkways by about half', () => {
    const zone = (id: ShipZoneId) =>
      SHIP_LAYOUT.zones.find((candidate) => candidate.id === id)!.bounds;
    const crew = zone('crewCabin');
    const storage = zone('storageWorkroom');
    const wheelhouse = zone('wheelhouse');
    const cargo = zone('cargoDeck');
    const lifeboat = zone('lifeboatStation');
    const exterior = SHIP_LAYOUT.lanes.filter(({ id }) => id.endsWith('exterior-main'));
    const evacuation = SHIP_LAYOUT.targets.find(({ kind }) => kind === 'evacuation');

    expect(crew).toEqual({ minX: -5.75, maxX: 5.75, minZ: 4.5, maxZ: 13.5 });
    expect(storage).toEqual({
      minX: -5.75,
      maxX: 5.75,
      minZ: -17.4,
      maxZ: -10.65,
    });
    expect(wheelhouse).toEqual({ minX: -5.5, maxX: 5.5, minZ: 17, maxZ: 22 });
    expect(SHIP_LAYOUT.rail.innerFaceX).toBeCloseTo(7.875);
    expect(SHIP_LAYOUT.rail.innerFaceX - crew.maxX).toBeCloseTo(2.125);
    expect(SHIP_LAYOUT.rail.innerFaceX - wheelhouse.maxX).toBeCloseTo(2.375);
    expect(cargo.minX).toBeCloseTo(-7.725);
    expect(cargo.maxX).toBeCloseTo(7.725);
    expect(exterior).toHaveLength(2);
    exterior.forEach((lane) => {
      expect(lane.className).toBe('secondary');
      expect(lane.clearWidth).toBeCloseTo(1.4);
    });
    expect(lifeboat.minX).toBeCloseTo(4.925);
    expect(lifeboat.maxX).toBeCloseTo(7.725);
    expect(lifeboat.minZ).toBe(-2);
    expect(lifeboat.maxZ).toBe(2);
    expect(evacuation?.position[0]).toBeCloseTo(7.025);
    expect(evacuation?.position[1]).toBe(0);
    expect(SHIP_LAYOUT.evacuationRect.minX).toBeCloseTo(6.675);
    expect(SHIP_LAYOUT.evacuationRect.maxX).toBeCloseTo(7.375);
    expect(SHIP_LAYOUT.evacuationRect.minZ).toBe(-0.35);
    expect(SHIP_LAYOUT.evacuationRect.maxZ).toBe(0.35);
  });

  it('adds the selected room dressing without replacing retained fixtures', () => {
    const furnitureIds = SHIP_LAYOUT.furniture.map(({ id }) => id);
    expect(furnitureIds).toEqual(expect.arrayContaining([
      'cabin-bunk-port',
      'cabin-bunk-starboard',
      'cabin-bunk-port-wall',
      'cabin-bunk-starboard-wall-aft',
      'cabin-bunk-starboard-wall-forward',
      'cabin-desk-aft',
      'chart-table-port',
      'chart-table-forward',
      'workbench-starboard',
      'storage-shelf-forward',
      'cabin-night-stand-forward-starboard',
      'cabin-desk-starboard-aft',
      'cabin-cabinet-port-forward',
      'cabin-table-starboard-center',
      'workroom-storage-shelf-port-forward',
      'workroom-crate-stack-port-forward',
      'workroom-crate-stack-starboard-forward',
    ]));
    expect(furnitureIds).not.toEqual(expect.arrayContaining([
      'cabin-food-cabinet',
      'cabin-side-cabinet',
      'instrument-cabinet-starboard-aft',
      'instrument-cabinet-starboard-center',
      'workbench-port',
      'instrument-cabinet-starboard-forward',
    ]));

    expect(SHIP_LAYOUT.decorations.map(({ modelId }) => modelId)).toEqual(
      expect.arrayContaining([
        'crewCeilingLight',
        'crewWallPainting',
        'crewWallArt',
        'wheelhouseCorkboard',
      ]),
    );
    expect(SHIP_LAYOUT.decorations.filter(({ modelId }) =>
      modelId === 'workroomCardboardBox')).toEqual([]);
  });

  it('uses one central mast outside the clear forward-room passage', () => {
    expect(SHIP_LAYOUT.rigging.masts).toHaveLength(1);
    const mast = SHIP_LAYOUT.rigging.masts[0]!;
    expect(mast.id).toBe('mainmast');
    expect(mast.position).toEqual([0, FREIGHTER_DIMENSIONS.deckY, -3.075]);
    expect(mast.sails.map(({ id }) => id)).toEqual(['mainsail', 'staysail']);

    const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
    const wheelhouse = SHIP_LAYOUT.zones.find(({ id }) => id === 'wheelhouse')!.bounds;
    expect(
      mast.position[2] <= crew.maxZ || mast.position[2] >= wheelhouse.minZ,
    ).toBe(true);
  });

  it('authors the mainmast lookout and ladder', () => {
    expect(SHIP_LAYOUT.rigging.crowsNest).toEqual({
      id: 'mainmast-lookout',
      mastId: 'mainmast',
      floorOffsetY: 14.5,
      outerWidth: 4,
      openingSize: 0.9,
      guardHeight: 1.05,
      ladder: {
        id: 'mainmast-ladder',
        width: 0.8,
        mastOffset: 0.18,
        rungSpacing: 0.32,
        outwardZ: -1,
      },
    });
  });

  it('keeps only the crew roof balcony and ladder', () => {
    expect(SHIP_LAYOUT.balconies).toEqual([
      expect.objectContaining({
        id: 'crew-balcony',
        zoneId: 'crewCabin',
        ladderId: 'crew-ladder',
        edge: 'aft',
        coamingHeight: 0.12,
        openingWidth: 1.5,
      }),
    ]);
    expect(SHIP_LAYOUT.ladders).toEqual([
      expect.objectContaining({
        id: 'crew-ladder',
        zoneId: 'crewCabin',
        edge: 'aft',
        centerX: 0,
      }),
    ]);
  });

  it('faces the raised sails forward with stays on the cabin roof and roof engine', () => {
    const mast = SHIP_LAYOUT.rigging.masts[0]!;
    const sailSpan = mast.sails.reduce((span, sail) => span + Math.abs(sail.clewZ), 0);
    expect(sailSpan).toBeGreaterThanOrEqual(FREIGHTER_DIMENSIONS.width * 0.85);
    expect(mast.sails.every(({ rotationY }) => rotationY === Math.PI / 2)).toBe(true);
    expect(mast.sails.every(({ footY }) => footY >= 10)).toBe(true);

    const roofTop = SHIP_ROOM_WALL_HEIGHT + SHIP_ROOM_ROOF_THICKNESS;
    const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
    const storage = SHIP_LAYOUT.zones.find(({ id }) => id === 'storageWorkroom')!.bounds;

    expect(mast.stays).toEqual([
      {
        id: 'fore-port',
        anchor: [
          crew.minX + 0.42,
          roofTop + 0.08,
          (crew.minZ + crew.maxZ) / 2 - mast.position[2],
        ],
      },
      {
        id: 'fore-starboard',
        anchor: [
          crew.maxX - 0.42,
          roofTop + 0.08,
          (crew.minZ + crew.maxZ) / 2 - mast.position[2],
        ],
      },
      {
        id: 'aft-port',
        anchor: [
          SHIP_ROOF_ENGINE.centerX - SHIP_ROOF_ENGINE.width / 2
            + SHIP_ROOF_ENGINE.stayInset,
          roofTop + SHIP_ROOF_ENGINE.height * SHIP_ROOF_ENGINE.stayHeightRatio,
          SHIP_ROOF_ENGINE.centerZ + SHIP_ROOF_ENGINE.depth / 2 - mast.position[2],
        ],
      },
      {
        id: 'aft-starboard',
        anchor: [
          SHIP_ROOF_ENGINE.centerX + SHIP_ROOF_ENGINE.width / 2
            - SHIP_ROOF_ENGINE.stayInset,
          roofTop + SHIP_ROOF_ENGINE.height * SHIP_ROOF_ENGINE.stayHeightRatio,
          SHIP_ROOF_ENGINE.centerZ + SHIP_ROOF_ENGINE.depth / 2 - mast.position[2],
        ],
      },
    ]);
    expect(SHIP_ROOF_ENGINE.centerZ).toBe((storage.minZ + storage.maxZ) / 2);
    mast.stays.filter(({ id }) => id.startsWith('aft-')).forEach(({ anchor }) => {
      expect(anchor[1]).toBeLessThan(roofTop + SHIP_ROOF_ENGINE.height);
      expect(mast.position[2] + anchor[2]).toBe(
        SHIP_ROOF_ENGINE.centerZ + SHIP_ROOF_ENGINE.depth / 2,
      );
    });
    expect(mast.stays.every(({ anchor }) => anchor[1] >= roofTop)).toBe(true);
  });

  it('centers the deck hatch on the fore-aft ship axis', () => {
    expect(SHIP_LAYOUT.deckHatch).toEqual({
      id: 'deck-hatch',
      position: [0, 2.22, -7],
      rotationY: 0,
      size: [1.45, 0.18, 1.8],
      colliderSize: [1.45, 0.18, 1.8],
    });
    expect(SHIP_LAYOUT.deckHatch.size[2]).toBeGreaterThan(SHIP_LAYOUT.deckHatch.size[0]);
    const bypasses = SHIP_LAYOUT.lanes.filter(({ id }) => id.startsWith('deck-hatch-'));
    expect(bypasses.map(({ id }) => id)).toEqual([
      'deck-hatch-port-bypass',
      'deck-hatch-starboard-bypass',
    ]);
    expect(bypasses[0]!.bounds.minX).toBe(-bypasses[1]!.bounds.maxX);
    expect(bypasses[0]!.bounds.maxX).toBe(-bypasses[1]!.bounds.minX);
  });

  it('requires reachable targets across both rounded end decks', () => {
    const endTargets = SHIP_LAYOUT.targets
      .filter(({ kind }) => (kind as string) === 'endDeck')
      .map(({ id }) => id)
      .sort();

    expect(endTargets).toEqual([
      'bow-center', 'bow-port', 'bow-starboard',
      'stern-port', 'stern-starboard',
    ]);
  });

  it('aligns crates exactly against exterior wall faces', () => {
    const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
    const storage = SHIP_LAYOUT.zones.find(({ id }) => id === 'storageWorkroom')!.bounds;
    const mast = SHIP_LAYOUT.rigging.masts[0]!;
    const fixture = (id: string) => SHIP_LAYOUT.furniture.find(
      (candidate) => candidate.id === id,
    )!;
    const fixtureRect = (id: string) => furnitureRect(
      fixture(id),
    );

    expect(fixture('cargo-rack-mast-port').position).toEqual([
      (crew.minX - SHIP_TRANSVERSE_PORTHOLE_CENTER_X) / 2,
      FREIGHTER_DIMENSIONS.deckY,
      mast.position[2],
    ]);
    expect(fixture('cargo-rack-mast-starboard').position).toEqual([
      (crew.maxX + SHIP_TRANSVERSE_PORTHOLE_CENTER_X) / 2,
      FREIGHTER_DIMENSIONS.deckY,
      mast.position[2],
    ]);
    expect(fixture('cargo-rack-mast-port').rotationY).toBe(0);
    expect(fixture('cargo-rack-mast-starboard').rotationY).toBe(0);
    expect([
      fixture('cargo-crate-crew-port').modelId,
      fixture('cargo-barrel-crew-starboard').modelId,
    ]).toEqual(['cargoCrate', 'barrel']);
    expect([
      fixture('cargo-barrel-storage-port').modelId,
      fixture('cargo-crate-storage-starboard').modelId,
    ]).toEqual(['barrel', 'cargoCrate']);
    expect(fixtureRect('cargo-crate-crew-port').minX)
      .toBeCloseTo(crew.minX + SHIP_ROOM_WALL_THICKNESS);
    expect(fixtureRect('cargo-crate-crew-port').maxZ)
      .toBeCloseTo(crew.minZ);
    expect(fixtureRect('cargo-barrel-crew-starboard').maxX)
      .toBeCloseTo(crew.maxX - SHIP_ROOM_WALL_THICKNESS);
    expect(fixtureRect('cargo-barrel-crew-starboard').maxZ)
      .toBeCloseTo(crew.minZ);
    expect(fixtureRect('cargo-barrel-storage-port').minX)
      .toBeCloseTo(storage.minX + SHIP_ROOM_WALL_THICKNESS);
    expect(fixtureRect('cargo-barrel-storage-port').minZ)
      .toBeCloseTo(storage.maxZ);
    expect(fixtureRect('cargo-crate-storage-starboard').maxX)
      .toBeCloseTo(storage.maxX - SHIP_ROOM_WALL_THICKNESS);
    expect(fixtureRect('cargo-crate-storage-starboard').minZ)
      .toBeCloseTo(storage.maxZ);

    expect(SHIP_LAYOUT.furniture.some(({ modelId }) => modelId === 'cargoBox')).toBe(false);
  });

  it('authors five cabin bunks, a corner table, and stacked storage crates', () => {
    const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
    const storage = SHIP_LAYOUT.zones.find(({ id }) => id === 'storageWorkroom')!.bounds;
    const fixtureRect = (id: string) => furnitureRect(
      SHIP_LAYOUT.furniture.find((fixture) => fixture.id === id)!,
    );

    expect(SHIP_LAYOUT.furniture.find(({ id }) => id === 'cabin-bunk-port')?.position)
      .toEqual([-0.72, FREIGHTER_DIMENSIONS.deckY, 7.75]);
    expect(SHIP_LAYOUT.furniture.find(({ id }) => id === 'cabin-bunk-starboard')?.position)
      .toEqual([0.72, FREIGHTER_DIMENSIONS.deckY, 7.75]);
    const wallBunks = SHIP_LAYOUT.furniture.filter(({ id }) => [
      'cabin-bunk-port-wall',
      'cabin-bunk-starboard-wall-aft',
      'cabin-bunk-starboard-wall-forward',
    ].includes(id));
    expect(wallBunks).toHaveLength(3);
    wallBunks.forEach(({ rotationY }) => expect(rotationY).toBe(Math.PI / 2));
    const cornerBunk = SHIP_LAYOUT.furniture.find(
      ({ id }) => id === 'cabin-bunk-starboard-wall-forward',
    )!;
    const cornerBunkBounds = fixtureRect(cornerBunk.id);
    expect(cornerBunk.position).toEqual([4.42, FREIGHTER_DIMENSIONS.deckY, 12.7]);
    expect(crew.maxX - SHIP_ROOM_WALL_THICKNESS - cornerBunkBounds.maxX)
      .toBeGreaterThanOrEqual(0);
    expect(crew.maxX - SHIP_ROOM_WALL_THICKNESS - cornerBunkBounds.maxX)
      .toBeLessThan(0.02);
    expect(crew.maxZ - SHIP_ROOM_WALL_THICKNESS - cornerBunkBounds.maxZ)
      .toBeGreaterThanOrEqual(0);
    expect(crew.maxZ - SHIP_ROOM_WALL_THICKNESS - cornerBunkBounds.maxZ)
      .toBeLessThan(0.02);
    const cabinDeskBounds = fixtureRect('cabin-desk-aft');
    expect(SHIP_LAYOUT.furniture.find(({ id }) => id === 'cabin-desk-aft')?.position)
      .toEqual([-4.62, FREIGHTER_DIMENSIONS.deckY, 5.14]);
    expect(cabinDeskBounds.maxZ).toBeLessThan(
      SHIP_LAYOUT.doors.find(({ id }) => id === 'cabin-port-door')!.approach.minZ,
    );
    expect(cabinDeskBounds.minZ - (crew.minZ + SHIP_ROOM_WALL_THICKNESS))
      .toBeLessThan(0.1);
    const cabinCabinet = SHIP_LAYOUT.furniture.find(
      ({ id }) => id === 'cabin-cabinet-port-forward',
    )!;
    const cabinNightStand = SHIP_LAYOUT.furniture.find(
      ({ id }) => id === 'cabin-night-stand-forward-starboard',
    )!;
    expect(cabinCabinet.position).toEqual([0.4, FREIGHTER_DIMENSIONS.deckY, 12.75]);
    expect(cabinCabinet.rotationY).toBe(Math.PI);
    expect(cabinNightStand.position).toEqual([-0.78, FREIGHTER_DIMENSIONS.deckY, 12.85]);
    expect(cabinCabinet.position[2] + cabinCabinet.colliderSize[2] / 2)
      .toBeCloseTo(cabinNightStand.position[2] + cabinNightStand.colliderSize[2] / 2, 2);
    expect(crew.maxZ - SHIP_ROOM_WALL_THICKNESS - fixtureRect(cabinCabinet.id).maxZ)
      .toBeLessThan(0.15);
    expect(fixtureRect(cabinNightStand.id).minX).toBeGreaterThan(-1.5);
    expect(fixtureRect(cabinNightStand.id).maxX).toBeLessThan(fixtureRect(cabinCabinet.id).minX);
    expect(fixtureRect(cabinCabinet.id).maxX).toBeLessThan(1.5);
    expect(cabinCabinet.surfaces[0]!.standingPoints[0]![2]).toBeGreaterThan(0);
    const cabinTable = SHIP_LAYOUT.furniture.find(
      ({ id }) => id === 'cabin-table-starboard-center',
    )!;
    expect(cabinTable.position).toEqual([-4.45, FREIGHTER_DIMENSIONS.deckY, 12.25]);
    const cornerDesk = SHIP_LAYOUT.furniture.find(
      ({ id }) => id === 'cabin-desk-starboard-aft',
    )!;
    const cornerDeskBounds = fixtureRect(cornerDesk.id);
    expect(cornerDesk.position).toEqual([4.7, FREIGHTER_DIMENSIONS.deckY, 5.18]);
    expect(crew.maxX - SHIP_ROOM_WALL_THICKNESS - cornerDeskBounds.maxX)
      .toBeLessThan(0.05);
    expect(cornerDeskBounds.maxZ).toBeLessThan(
      SHIP_LAYOUT.doors.find(({ id }) => id === 'cabin-starboard-door')!.approach.minZ,
    );
    expect(SHIP_LAYOUT.furniture.filter(({ zoneId }) => zoneId === 'wheelhouse'))
      .toHaveLength(3);
    const storageStacks = SHIP_LAYOUT.furniture.filter(({ modelId }) => modelId === 'cargoCrateStack');
    expect(storageStacks).toHaveLength(2);
    expect(storageStacks.map(({ position }) => position[0])).toEqual([
      -4.45,
      storage.maxX - SHIP_ROOM_WALL_THICKNESS - 1.05 / 2,
    ]);
    const deskBoxes = SHIP_LAYOUT.decorations.filter(({ id }) =>
      id === 'workroom-box-pallet-a' || id === 'workroom-box-pallet-b');
    expect(deskBoxes).toEqual([]);
    const workroomCorkboard = SHIP_LAYOUT.decorations.find(
      ({ id }) => id === 'workroom-corkboard-aft',
    )!;
    expect(workroomCorkboard.zoneId).toBe('storageWorkroom');
    expect(workroomCorkboard.position[0]).toBe(4.25);
    expect(workroomCorkboard.position[2])
      .toBeCloseTo(storage.minZ + SHIP_ROOM_WALL_THICKNESS + 0.02);
    expect(workroomCorkboard.rotation).toEqual([0, 0, 0]);
    const cabinWallPainting = SHIP_LAYOUT.decorations.find(
      ({ id }) => id === 'cabin-wall-painting-aft',
    )!;
    expect(cabinWallPainting.position).toEqual([
      -0.75,
      4.2,
      crew.minZ + SHIP_ROOM_WALL_THICKNESS + 0.02,
    ]);
    const cabinWallArt = SHIP_LAYOUT.decorations.find(
      ({ id }) => id === 'cabin-wall-art-aft-center',
    )!;
    expect(cabinWallArt.position).toEqual([
      0.75,
      4.2,
      crew.minZ + SHIP_ROOM_WALL_THICKNESS + 0.02,
    ]);
    expect((cabinWallPainting.position[0] + cabinWallArt.position[0]) / 2).toBe(0);
    expect(cabinWallArt.rotation).toEqual([0, 0, 0]);
    SHIP_LAYOUT.doors.filter(({ zoneId }) => zoneId === 'crewCabin').forEach(({ approach }) => {
      expect(cabinWallArt.position[2]).toBeLessThan(approach.minZ);
    });
  });

  it('mounts the cabin shelf above the big table on the port wall', () => {
    const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
    const cabinShelf = SHIP_LAYOUT.decorations.find(
      ({ id }) => id === 'cabin-wall-shelf-port-table',
    )!;
    const cabinTable = SHIP_LAYOUT.furniture.find(
      ({ id }) => id === 'cabin-table-starboard-center',
    )!;

    expect(cabinShelf.modelId).toBe('bookcaseOpen');
    expect(cabinShelf.position[0]).toBeCloseTo(
      crew.minX + SHIP_ROOM_WALL_THICKNESS + 0.310193 / 2 + 0.02,
    );
    expect(cabinShelf.position[1]).toBeGreaterThan(
      cabinTable.position[1] + cabinTable.colliderSize[1] * cabinTable.scale[1],
    );
    expect(cabinShelf.position[2]).toBe(cabinTable.position[2]);
    expect(cabinShelf.rotation).toEqual([0, 0, 0]);
  });

  it('centers both storage shelves between their nearest portholes', () => {
    const shelf = (id: string) => SHIP_LAYOUT.furniture.find(
      (fixture) => fixture.id === id,
    )!;
    const forwardShelf = shelf('storage-shelf-forward');
    const sideShelf = shelf('workroom-storage-shelf-port-forward');

    expect(forwardShelf.position[0]).toBe(0);
    expect(furnitureRect(forwardShelf).minX)
      .toBeCloseTo(-furnitureRect(forwardShelf).maxX);
    expect(sideShelf.position[0]).toBe(0);
    expect(sideShelf.rotationY).toBe(Math.PI);
    expect(furnitureRect(sideShelf).minX)
      .toBeCloseTo(-furnitureRect(sideShelf).maxX);
    expect(furnitureRect(sideShelf).minZ)
      .toBeCloseTo(-17.4 + SHIP_ROOM_WALL_THICKNESS + 0.02);
    expect(SHIP_LAYOUT.decorations.find(
      ({ id }) => id === 'workroom-box-shelf-top',
    )).toBeUndefined();

  });

  it('centers one loose storage crate and groups the other with the stack', () => {
    const crate = (id: string) => SHIP_LAYOUT.furniture.find(
      (fixture) => fixture.id === id,
    )!;
    const port = crate('workroom-crate-center-port');
    const starboard = crate('workroom-crate-center-starboard');

    const storage = SHIP_LAYOUT.zones.find(
      ({ id }) => id === 'storageWorkroom',
    )!.bounds;
    const stack = crate('workroom-crate-stack-starboard-forward');

    expect(port.position).toEqual([
      (storage.minX + storage.maxX) / 2,
      FREIGHTER_DIMENSIONS.deckY,
      (storage.minZ + storage.maxZ) / 2,
    ]);
    expect(furnitureRect(stack).maxX)
      .toBeCloseTo(storage.maxX - SHIP_ROOM_WALL_THICKNESS);
    expect(furnitureRect(stack).maxZ)
      .toBeCloseTo(storage.maxZ - SHIP_ROOM_WALL_THICKNESS);
    expect(starboard.position[2]).toBe(stack.position[2]);
    expect(furnitureRect(stack).minX - furnitureRect(starboard).maxX).toBeCloseTo(0.001);
    const workroomLoops = SHIP_LAYOUT.lanes.filter(({ id }) =>
      id.startsWith('workroom-loop-'));
    [port, starboard].forEach((fixture) => {
      workroomLoops.forEach(({ bounds }) => {
        expect(rectsOverlap(furnitureRect(fixture), bounds)).toBe(false);
      });
    });
  });

  it('uses one centered item slot on the starboard workbench', () => {
    const workbench = SHIP_LAYOUT.furniture.find(
      ({ id }) => id === 'workbench-starboard',
    )!;

    expect(workbench.surfaces).toHaveLength(1);
    expect(workbench.surfaces[0]).toMatchObject({
      id: 'workbench-starboard:top',
      localPosition: [0, 0.82, 0],
      localRotation: [0, 0, 0],
      footprint: { width: 1.6, depth: 0.72 },
    });
  });

  it('rests the scavenging swim ring flat on the cabin desk', () => {
    const desk = SHIP_LAYOUT.furniture.find(
      ({ id }) => id === 'cabin-desk-starboard-aft',
    )!;
    const ringSurface = desk.surfaces.find(
      ({ id }) => id === 'cabin-desk-starboard-aft:top-left',
    )!;

    expect(ringSurface.localRotation).toEqual([0, 0, 0]);
  });

  it('keeps stern standing points and their access paths aft of the storage wall', () => {
    const storage = SHIP_LAYOUT.zones.find(({ id }) => id === 'storageWorkroom')!.bounds;
    for (const id of [
      'stern-crate-port',
      'stern-crate-starboard',
    ]) {
      const owner = SHIP_LAYOUT.furniture.find((candidate) => candidate.id === id)!;
      const localStanding = owner.surfaces[0]!.standingPoints[0]!;
      const standingZ = owner.position[2] + localStanding[2] * owner.scale[2];
      expect(standingZ).toBeLessThan(storage.minZ - PLAYER_LAYOUT_RADIUS);
    }
  });
});
