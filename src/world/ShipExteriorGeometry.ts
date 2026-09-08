import {
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  Vector3,
} from 'three';
import { addDeckHatch } from './ShipDeckFittings';
import { addShipRails } from './ShipRailGeometry';
import {
  SHIP_ROOF_ENGINE,
} from './shipLayoutData';
import {
  requiredShipZone,
  shipRoomRoofTopY,
  type ShipLayoutSpec,
} from './ShipLayoutTypes';
import type { ShipMaterials } from './ShipMaterials';
import { addShipMachineryDetails } from './ShipMachineryDetails';
import {
  addBlock,
  addBeveledBlock,
  type ShipGeometryBuildContext,
} from './ShipGeometryPrimitives';
const STACK_X = 1.35;
const STACK_SHAFT_HEIGHT = 3.5;
const STACK_RADIUS = 0.58;
const STACK_COLLAR_RADIUS = 0.72;
const STACK_COLLAR_HEIGHT = 0.22;

function addCylinder(
  context: ShipGeometryBuildContext,
  parent: Group,
  name: string,
  radius: number,
  height: number,
  position: readonly [number, number, number],
  material: Material,
): Mesh {
  const geometry = new CylinderGeometry(radius, radius * 1.08, height, 12);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  context.geometries.add(geometry);
  return mesh;
}

function addRoofEngine(
  context: ShipGeometryBuildContext,
  root: Group,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): readonly [Vector3, Vector3] {
  const storage = requiredShipZone(layout, 'storageWorkroom');
  const engineZ = (storage.bounds.minZ + storage.bounds.maxZ) / 2;
  const roofY = shipRoomRoofTopY(storage.id);
  const engineCenterY = roofY + SHIP_ROOF_ENGINE.height / 2;
  const engineTopY = roofY + SHIP_ROOF_ENGINE.height;
  const engineFrontZ = engineZ + SHIP_ROOF_ENGINE.depth / 2;
  addBeveledBlock(context, root, {
    name: 'roof-engine-body',
    size: [SHIP_ROOF_ENGINE.width, SHIP_ROOF_ENGINE.height, SHIP_ROOF_ENGINE.depth],
    position: [SHIP_ROOF_ENGINE.centerX, engineCenterY, engineZ],
    material: materials.paintedSteel,
  });
  addBlock(context, root, {
    name: 'roof-engine-service-panel',
    size: [4.8, 1.08, 0.06],
    position: [SHIP_ROOF_ENGINE.centerX, engineCenterY, engineFrontZ + 0.03],
    material: materials.darkMetal,
  });
  [-0.34, 0, 0.34].forEach((offsetY, index) => {
    addBlock(context, root, {
      name: `roof-engine-vent-${index + 1}`,
      size: [3.8, 0.08, 0.07],
      position: [
        SHIP_ROOF_ENGINE.centerX,
        engineCenterY + offsetY,
        engineFrontZ + 0.07,
      ],
      material: materials.exposedMetal,
    });
  });
  const crank = addCylinder(
    context,
    root,
    'roof-engine-crank',
    0.42,
    0.14,
    [SHIP_ROOF_ENGINE.centerX, engineCenterY, engineFrontZ + 0.14],
    materials.exposedMetal,
  );
  crank.rotation.x = Math.PI / 2;

  const stackZ = engineZ;
  const stackBaseY = engineTopY;
  const stackShaftBaseY = stackBaseY + STACK_COLLAR_HEIGHT;
  const stackOutletY = stackShaftBaseY + STACK_SHAFT_HEIGHT;
  const stackCenterY = stackShaftBaseY + STACK_SHAFT_HEIGHT / 2;
  const stackOutlets = [
    new Vector3(-STACK_X, stackOutletY, stackZ),
    new Vector3(STACK_X, stackOutletY, stackZ),
  ] as const;
  stackOutlets.forEach((outlet, index) => {
    const side = index === 0 ? 'port' : 'starboard';
    addCylinder(context, root, `smokestack-${side}`, STACK_RADIUS, STACK_SHAFT_HEIGHT, [
      outlet.x,
      stackCenterY,
      outlet.z,
    ], materials.darkMetal);
    addCylinder(context, root, `smokestack-${side}-collar`, STACK_COLLAR_RADIUS, STACK_COLLAR_HEIGHT, [
      outlet.x,
      stackBaseY + STACK_COLLAR_HEIGHT / 2,
      outlet.z,
    ], materials.exposedMetal);
  });
  return stackOutlets;
}

export function addShipExterior(
  context: ShipGeometryBuildContext,
  layout: ShipLayoutSpec,
): readonly [Vector3, Vector3] {
  addDeckHatch(context, layout);
  const stackOutlets = addRoofEngine(
    context,
    context.root,
    context.materials,
    layout,
  );
  addShipMachineryDetails(context, layout, stackOutlets);
  addShipRails(context, layout);
  return stackOutlets;
}
