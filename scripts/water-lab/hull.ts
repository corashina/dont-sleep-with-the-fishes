import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { createWaterExclusion } from '../../src/ocean/WaterExclusion';

/** Keep the lab hull and its water mask together. */
export function createWaterLabHull() {
  const hull = new Group();
  hull.name = 'water-lab-test-hull';
  const body = new Mesh(
    new BoxGeometry(3.8, 0.65, 7),
    new MeshStandardMaterial({ color: '#936044', roughness: 0.82 }),
  );
  body.position.y = -0.25;
  hull.add(body);
  const cabin = new Mesh(
    new BoxGeometry(2, 1, 2),
    new MeshStandardMaterial({ color: '#d2b589', roughness: 0.8 }),
  );
  cabin.position.set(0, 0.5, 0.5);
  hull.add(cabin);
  const { width, height, depth } = body.geometry.parameters;
  const halfWidth = width / 2;
  const halfLength = depth / 2;
  const exclusion = createWaterExclusion(body, halfWidth, halfLength, halfLength, -height / 2, {
    lowerHalfWidth: halfWidth,
    lowerHalfLength: halfLength,
    lowerTaperStart: halfLength,
    upperLocalY: height / 2,
  });
  return { hull, body, exclusion };
}
