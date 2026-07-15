import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import {
  ShipFurnitureLibrary,
} from '../../src/world/ShipFurnitureLibrary';
import { createShip, type ShipBuild } from '../../src/world/Ship';
import {
  SHIP_FURNITURE_MODEL_IDS,
  SHIP_FURNITURE_MODEL_SPECS,
  type ShipFurnitureAssetId,
} from '../../src/world/shipFurnitureManifest';

export function createTestShipFurniture(): ShipFurnitureLibrary {
  const templates = new Map<ShipFurnitureAssetId, Group>(
    SHIP_FURNITURE_MODEL_IDS.map((id, index) => {
      const root = new Group();
      root.name = `ship-furniture:${id}`;
      const size = SHIP_FURNITURE_MODEL_SPECS[id].canonicalSize;
      const mesh = new Mesh(
        new BoxGeometry(...size),
        new MeshStandardMaterial({
          color: new Color().setHSL(index / SHIP_FURNITURE_MODEL_IDS.length, 0.4, 0.5),
        }),
      );
      mesh.position.y = size[1] / 2;
      root.add(mesh);
      return [id, root];
    }),
  );
  return ShipFurnitureLibrary.fromTemplatesForTest(templates);
}

export function createTestShip(maxTextureAnisotropy = 1): ShipBuild {
  const library = createTestShipFurniture();
  const ship = createShip(library, maxTextureAnisotropy);
  const disposeShip = ship.dispose.bind(ship);
  return {
    ...ship,
    dispose: () => {
      disposeShip();
      library.dispose();
    },
  };
}
