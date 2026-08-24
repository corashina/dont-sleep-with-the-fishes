// Importance: 10/10. Protects room order, colliders, and geometry ownership.
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Group, Mesh } from 'three';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import { addShipRooms } from '../src/world/ShipRoomGeometry';
import type { ShipGeometryBuildContext } from '../src/world/ShipGeometryPrimitives';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { SHIP_SHELL_COLLIDERS_BASE } from './fixtures/shipGeometryBase';

function createTestContext(): ShipGeometryBuildContext {
  return {
    root: new Group(),
    geometries: new Set<BufferGeometry>(),
    shellColliders: [],
    materials: createShipMaterials(),
  };
}

const colliderValues = (context: ShipGeometryBuildContext): readonly (readonly number[])[] =>
  context.shellColliders.map((collider) => [
    collider.minX,
    collider.maxX,
    collider.minY,
    collider.maxY,
    collider.minZ,
    collider.maxZ,
    ...(collider.orientedFootprint ? [
      collider.orientedFootprint.centerX,
      collider.orientedFootprint.centerZ,
      collider.orientedFootprint.halfWidth,
      collider.orientedFootprint.halfDepth,
      collider.orientedFootprint.rotationY,
    ] : []),
  ]);

describe('ship room geometry', () => {
  it('preserves room order, names, collider slice, and geometry registration', () => {
    const context = createTestContext();
    try {
      expect(addShipRooms(context, SHIP_LAYOUT)).toBeUndefined();

      expect(context.root.children.map(({ name }) => name)).toEqual([
        'crew-cabin-wall-port-0',
        'crew-cabin-wall-port-1',
        'crew-cabin-wall-starboard-2',
        'crew-cabin-wall-starboard-3',
        'crew-cabin-wall-aft-4',
        'crew-cabin-wall-forward-5',
        'storage-workroom-wall-port-12',
        'storage-workroom-wall-port-13',
        'storage-workroom-wall-starboard-14',
        'storage-workroom-wall-starboard-15',
        'storage-workroom-wall-aft-16',
        'storage-workroom-wall-forward-17',
        'wheelhouse-facade',
        'door-frame:cabin-port-door:jamb-left',
        'door-frame:cabin-port-door:jamb-right',
        'door-frame:cabin-port-door:header',
        'door-wall:cabin-port-door:header-infill',
        'door-frame:cabin-starboard-door:jamb-left',
        'door-frame:cabin-starboard-door:jamb-right',
        'door-frame:cabin-starboard-door:header',
        'door-wall:cabin-starboard-door:header-infill',
        'door-wall:wheelhouse-aft-door:header-infill',
        'door-wall:wheelhouse-port-door:header-infill',
        'door-frame:storage-port-door:jamb-left',
        'door-frame:storage-port-door:jamb-right',
        'door-frame:storage-port-door:header',
        'door-wall:storage-port-door:header-infill',
        'door-frame:storage-starboard-door:jamb-left',
        'door-frame:storage-starboard-door:jamb-right',
        'door-frame:storage-starboard-door:header',
        'door-wall:storage-starboard-door:header-infill',
        'porthole:crewCabin:aft:1',
        'porthole:crewCabin:aft:2',
        'porthole:crewCabin:forward:1',
        'porthole:crewCabin:forward:2',
        'porthole:storageWorkroom:aft:1',
        'porthole:storageWorkroom:aft:2',
        'porthole:storageWorkroom:forward:1',
        'porthole:storageWorkroom:forward:2',
        'crewCabin-roof',
        'wheelhouse-roof',
        'storageWorkroom-roof',
        'balcony:crew-balcony:coaming:port:0',
        'balcony:crew-balcony:coaming:starboard:0',
        'balcony:crew-balcony:coaming:forward:0',
        'balcony:crew-balcony:coaming:aft:0',
        'balcony:crew-balcony:coaming:aft:1',
      ]);
      expect(context.root.getObjectByName('wheelhouse-facade')).toBeDefined();
      expect(context.root.children.filter(({ name }) => name.startsWith('porthole:'))
        .map(({ name }) => name)).toEqual([
        'porthole:crewCabin:aft:1',
        'porthole:crewCabin:aft:2',
        'porthole:crewCabin:forward:1',
        'porthole:crewCabin:forward:2',
        'porthole:storageWorkroom:aft:1',
        'porthole:storageWorkroom:aft:2',
        'porthole:storageWorkroom:forward:1',
        'porthole:storageWorkroom:forward:2',
      ]);
      expect(context.root.getObjectByName('wheelhouse-roof')).toBeDefined();
      expect(context.root.getObjectByName('crewCabin-roof')).toBeDefined();
      expect(context.root.getObjectByName('storageWorkroom-roof')).toBeDefined();
      const wallUvs = (
        context.root.getObjectByName('crew-cabin-wall-port-0') as Mesh
      ).geometry.getAttribute('uv');
      expect(Array.from(wallUvs.array)).toEqual([
        -5.114999771118164, 5.630000114440918,
        -5.335000038146973, 5.630000114440918,
        -5.114999771118164, 2.2100000381469727,
        -5.335000038146973, 2.2100000381469727,
        -5.335000038146973, 5.630000114440918,
        -5.114999771118164, 5.630000114440918,
        -5.335000038146973, 2.2100000381469727,
        -5.114999771118164, 2.2100000381469727,
        -5.949999809265137, 5.630000114440918,
        -4.5, 5.630000114440918,
        -5.949999809265137, 5.630000114440918,
        -4.5, 5.630000114440918,
        -5.949999809265137, 2.2100000381469727,
        -4.5, 2.2100000381469727,
        -5.949999809265137, 2.2100000381469727,
        -4.5, 2.2100000381469727,
        -5.949999809265137, 5.630000114440918,
        -4.5, 5.630000114440918,
        -5.949999809265137, 2.2100000381469727,
        -4.5, 2.2100000381469727,
        -4.5, 5.630000114440918,
        -5.949999809265137, 5.630000114440918,
        -4.5, 2.2100000381469727,
        -5.949999809265137, 2.2100000381469727,
      ]);
      const roofUvs = (
        context.root.getObjectByName('crewCabin-roof') as Mesh
      ).geometry.getAttribute('uv');
      expect(Array.from(roofUvs.array)).toEqual([
        13.5, 0.11999999731779099,
        4.5, 0.11999999731779099,
        13.5, -0.11999999731779099,
        4.5, -0.11999999731779099,
        4.5, 0.11999999731779099,
        13.5, 0.11999999731779099,
        4.5, -0.11999999731779099,
        13.5, -0.11999999731779099,
        -5.75, 4.5,
        5.75, 4.5,
        -5.75, 13.5,
        5.75, 13.5,
        -5.75, 13.5,
        5.75, 13.5,
        -5.75, 4.5,
        5.75, 4.5,
        -5.75, 0.11999999731779099,
        5.75, 0.11999999731779099,
        -5.75, -0.11999999731779099,
        5.75, -0.11999999731779099,
        5.75, 0.11999999731779099,
        -5.75, 0.11999999731779099,
        5.75, -0.11999999731779099,
        -5.75, -0.11999999731779099,
      ]);

      let meshCount = 0;
      const meshGeometries = new Set<BufferGeometry>();
      context.root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        meshCount += 1;
        meshGeometries.add(object.geometry);
        expect(context.geometries.has(object.geometry)).toBe(true);
      });
      expect(meshCount).toBe(275);
      expect(context.geometries).toHaveLength(66);
      expect(context.geometries).toEqual(meshGeometries);
      expect(colliderValues(context)).toEqual(SHIP_SHELL_COLLIDERS_BASE.slice(0, 19));
    } finally {
      context.geometries.forEach((geometry) => geometry.dispose());
      context.materials.dispose();
    }
  });
});
