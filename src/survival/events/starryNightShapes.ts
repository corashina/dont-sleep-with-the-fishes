import type { ItemId } from '../../game/ItemState';
import type { StarryNightItem } from '../starryNight';

type Point = readonly [number, number];
export interface ConstellationShape {
  readonly stars: readonly Point[];
  readonly edges: readonly (readonly [number, number])[];
}
function shape(...paths: readonly (readonly Point[])[]): ConstellationShape {
  const stars: Point[] = [];
  const edges: [number, number][] = [];
  for (const path of paths) {
    let previous = -1;
    for (const point of path) {
      let index = stars.findIndex(([x, y]) => x === point[0] && y === point[1]);
      if (index < 0) { index = stars.length; stars.push(point); }
      if (previous >= 0 && previous !== index) edges.push([previous, index]);
      previous = index;
    }
  }
  return { stars, edges };
}

// Keep only the silhouette and the details that identify each item.
const SHAPES: Record<StarryNightItem, ConstellationShape> = {
  // Tall can with a lid and pull tab.
  cannedFood: shape(
    [[-8,7],[-5,10],[5,10],[8,7],[8,-9],[-8,-9],[-8,7]],
    [[-8,7],[0,4],[8,7]],
    [[0,9],[2,7],[0,5],[-2,7],[0,9]],
  ),
  // Capped jar with one large worm.
  baitTin: shape(
    [[-7,6],[-9,0],[-7,-8],[0,-10],[7,-8],[9,0],[7,6],[-7,6]],
    [[-7,6],[-7,10],[7,10],[7,6]],
    [[-5,-3],[-3,1],[0,1],[2,-3],[5,-3],[6,0]],
  ),
  // Open ring with a loose strip.
  ductTape: shape(
    [[-11,0],[-7,9],[1,10],[7,3],[4,-6],[-5,-9],[-11,0]],
    [[-7,0],[-4,5],[0,6],[3,2],[1,-3],[-4,-5],[-7,0]],
    [[7,3],[7,-6],[12,-9],[7,-12],[4,-6]],
  ),
  // Circular case with a long compass needle.
  compass: shape(
    [[0,11],[8,8],[11,0],[8,-8],[0,-11],[-8,-8],[-11,0],[-8,8],[0,11]],
    [[3,7],[3,-1],[-3,-7],[-3,1],[3,7]],
    [[-3,1],[3,-1]],
  ),
  // Folded chart with one large destination cross.
  map: shape(
    [[-12,8],[-4,6],[4,9],[12,6],[12,-9],[4,-6],[-4,-9],[-12,-6],[-12,8]],
    [[-4,6],[-4,-9]], [[4,9],[4,-6]],
    [[6,4],[10,0]], [[6,0],[10,4]],
  ),
  // Handle and a single pointed blade.
  knife: shape(
    [[-12,-2],[-12,3],[-3,3],[5,3],[13,-3],[-3,-2],[-12,-2]],
    [[-3,5],[-3,-4]],
  ),
  // Chocolate bar with three large segments.
  energyBar: shape(
    [[-12,3],[9,9],[12,-3],[-9,-9],[-12,3]],
    [[-5,5],[-2,-7]], [[2,7],[5,-5]],
  ),
};

export function constellationShape(item: ItemId): ConstellationShape {
  if (!(item in SHAPES)) throw new Error('Missing constellation shape: ' + item);
  return SHAPES[item as StarryNightItem];
}
