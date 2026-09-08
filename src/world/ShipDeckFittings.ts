import { Group } from 'three';
import { ShipDetailGeometry } from './ShipDetailGeometry';
import type { ShipGeometryBuildContext } from './ShipGeometryPrimitives';
import type { ShipLayoutSpec } from './ShipLayoutTypes';

export function addDeckHatch(context: ShipGeometryBuildContext, layout: ShipLayoutSpec): void {
  const hatch = layout.deckHatch;
  const [width, height, depth] = hatch.size;
  const root = new Group();
  root.name = hatch.id;
  root.position.set(...hatch.position);
  root.rotation.y = hatch.rotationY;
  context.root.add(root);
  const details = new ShipDetailGeometry(context.geometries);
  const { darkMetal, deckSteel, deckTimber, exposedMetal } = context.materials;
  details.box(darkMetal, [width, height, depth], [0, height / 2, 0], 0, 0.035);
  const panelWidth = width - 0.24;
  const plankDepth = (depth - 0.24 - 0.036) / 4;
  for (let index = 0; index < 4; index += 1) {
    details.box(deckTimber, [panelWidth, 0.045, plankDepth],
      [0, height + 0.018, (index - 1.5) * (plankDepth + 0.012)], 0, 0.009);
  }
  // Steel straps connect the lid planks to two working hinges.
  for (const x of [-panelWidth * 0.32, panelWidth * 0.32]) {
    details.box(deckSteel, [0.085, 0.018, depth - 0.2], [x, height + 0.049, 0], 0, 0.004);
    const z = -depth / 2 + 0.07;
    details.box(deckSteel, [0.16, 0.025, 0.16], [x, height + 0.015, z], 0, 0.006);
    details.rod(exposedMetal, [x - 0.09, height + 0.055, z],
      [x + 0.09, height + 0.055, z], 0.026);
    for (const boltZ of [-depth / 2 + 0.24, depth / 2 - 0.24]) {
      details.rod(exposedMetal, [x, height + 0.056, boltZ], [x, height + 0.062, boltZ], 0.013);
    }
  }
  // A dark inset under a low pull reads as a recessed handle at deck height.
  const handleZ = depth * 0.28;
  details.box(darkMetal, [0.3, 0.009, 0.15], [0, height + 0.044, handleZ], 0, 0.012);
  details.rod(exposedMetal, [-0.105, height + 0.06, handleZ],
    [0.105, height + 0.06, handleZ], 0.014);
  for (const x of [-0.105, 0.105]) {
    details.box(exposedMetal, [0.03, 0.023, 0.06], [x, height + 0.05, handleZ], 0, 0);
  }
  details.finish(root, 'deck-hatch-fittings');
}
