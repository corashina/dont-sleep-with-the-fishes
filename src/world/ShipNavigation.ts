import {
  PLAYER_LAYOUT_RADIUS,
  type ClearanceClass,
  type Rect2,
  type ShipDeckHatchSpec,
  type ShipDoorSpec,
  type ShipFurniturePlacementSpec,
  type ShipLaneSpec,
  type ShipLayoutSpec,
  type ShipMastSpec,
  type ShipNavigationAnalysis,
  type ShipNavigationTargetSpec,
  type ShipRouteMetric,
  type ShipSecondaryAccessRectangle,
} from './ShipLayoutTypes';

const PI_OVER_TWO = 1.5707963267948966;
const WALL_THICKNESS = 0.2;
const RAIL_THICKNESS = 0.25;
const GRID_STEP = 0.1;

function rect(minX: number, maxX: number, minZ: number, maxZ: number): Rect2 {
  return { minX, maxX, minZ, maxZ };
}

function transformLocalPoint(
  furnitureSpec: ShipFurniturePlacementSpec,
  point: readonly [number, number, number],
): readonly [number, number] {
  const cosine = Math.cos(furnitureSpec.rotationY);
  const sine = Math.sin(furnitureSpec.rotationY);
  const localX = point[0] * furnitureSpec.scale[0];
  const localZ = point[2] * furnitureSpec.scale[2];
  return [
    furnitureSpec.position[0] + localX * cosine + localZ * sine,
    furnitureSpec.position[2] - localX * sine + localZ * cosine,
  ];
}

function doorNavigationTargets(
  doorSpecs: readonly ShipDoorSpec[],
): ShipNavigationTargetSpec[] {
  const result: ShipNavigationTargetSpec[] = [];
  doorSpecs.forEach((door) => {
    const [x, z] = door.center;
    if (door.orientation === 'side') {
      const direction = door.side === 'port' ? -1 : 1;
      result.push(
        { id: `${door.id}-inside`, position: [x - direction * 0.5, z], kind: 'door' },
        { id: `${door.id}-outside`, position: [x + direction * 0.5, z], kind: 'door' },
      );
    } else {
      result.push(
        { id: `${door.id}-inside`, position: [x, z + 0.5], kind: 'door' },
        { id: `${door.id}-outside`, position: [x, z - 0.5], kind: 'door' },
      );
    }
  });
  return result;
}

function validRect(bounds: Rect2): boolean {
  return [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)
    && bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ;
}

function contains(bounds: Rect2, point: readonly [number, number]): boolean {
  return point[0] >= bounds.minX && point[0] <= bounds.maxX
    && point[1] >= bounds.minZ && point[1] <= bounds.maxZ;
}

function inflate(bounds: Rect2, amount: number): Rect2 {
  return rect(
    bounds.minX - amount,
    bounds.maxX + amount,
    bounds.minZ - amount,
    bounds.maxZ + amount,
  );
}

export function furnitureRect(spec: ShipFurniturePlacementSpec): Rect2 {
  const turns = spec.rotationY === PI_OVER_TWO ? 1 : 0;
  const scaledWidth = spec.colliderSize[0] * spec.scale[0];
  const scaledDepth = spec.colliderSize[2] * spec.scale[2];
  const width = turns ? scaledDepth : scaledWidth;
  const depth = turns ? scaledWidth : scaledDepth;
  return rect(
    spec.position[0] - width / 2,
    spec.position[0] + width / 2,
    spec.position[2] - depth / 2,
    spec.position[2] + depth / 2,
  );
}

export function deckHatchRect(spec: ShipDeckHatchSpec): Rect2 {
  const cosine = Math.abs(Math.cos(spec.rotationY));
  const sine = Math.abs(Math.sin(spec.rotationY));
  const width = spec.colliderSize[0] * cosine + spec.colliderSize[2] * sine;
  const depth = spec.colliderSize[0] * sine + spec.colliderSize[2] * cosine;
  return rect(
    spec.position[0] - width / 2,
    spec.position[0] + width / 2,
    spec.position[2] - depth / 2,
    spec.position[2] + depth / 2,
  );
}

export function mastRect(spec: ShipMastSpec): Rect2 {
  const radius = spec.baseDiameter / 2;
  return rect(spec.position[0] - radius, spec.position[0] + radius, spec.position[2] - radius, spec.position[2] + radius);
}

function pointInPolygon(
  point: readonly [number, number],
  polygon: readonly (readonly [number, number])[],
): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [currentX, currentZ] = polygon[current]!;
    const [previousX, previousZ] = polygon[previous]!;
    const crosses = (currentZ > point[1]) !== (previousZ > point[1])
      && point[0] < ((previousX - currentX) * (point[1] - currentZ))
        / (previousZ - currentZ) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function measuredLaneWidth(lane: ShipLaneSpec): number {
  return Number(Math.min(
    lane.bounds.maxX - lane.bounds.minX,
    lane.bounds.maxZ - lane.bounds.minZ,
  ).toFixed(9));
}

function secondaryAccessRectangles(
  furnitureSpecs: readonly ShipFurniturePlacementSpec[],
): ShipSecondaryAccessRectangle[] {
  const result: ShipSecondaryAccessRectangle[] = [];
  furnitureSpecs.forEach((owner) => owner.surfaces.forEach((surface) => {
    const center = transformLocalPoint(owner, surface.localPosition);
    surface.standingPoints.forEach((point, index) => {
      const standing = transformLocalPoint(owner, point);
      result.push({
        id: `${surface.id}-access-${index}`,
        bounds: rect(
          Math.min(center[0], standing[0]) - PLAYER_LAYOUT_RADIUS,
          Math.max(center[0], standing[0]) + PLAYER_LAYOUT_RADIUS,
          Math.min(center[1], standing[1]) - PLAYER_LAYOUT_RADIUS,
          Math.max(center[1], standing[1]) + PLAYER_LAYOUT_RADIUS,
        ),
      });
    });
  }));
  return result;
}

function measuredAccessClearance(access: ShipSecondaryAccessRectangle): number {
  const sweptCenterWidth = Math.min(
    access.bounds.maxX - access.bounds.minX,
    access.bounds.maxZ - access.bounds.minZ,
  );
  return Number((sweptCenterWidth + PLAYER_LAYOUT_RADIUS * 2).toFixed(9));
}

function minimumClearance(
  layout: ShipLayoutSpec,
  className: ClearanceClass,
  accessRectangles: readonly ShipSecondaryAccessRectangle[] = [],
): number {
  const widths = layout.lanes
    .filter((lane) => lane.className === className)
    .map(measuredLaneWidth);
  if (className === 'secondary') {
    widths.push(...accessRectangles.map(measuredAccessClearance));
  }
  return widths.length > 0 ? Math.min(...widths) : Number.POSITIVE_INFINITY;
}

function effectiveNavigationTargets(layout: ShipLayoutSpec): ShipNavigationTargetSpec[] {
  const targets = new Map(layout.targets
    .filter(({ kind }) => kind !== 'door' && kind !== 'surface')
    .map((target) => [target.id, target]));
  doorNavigationTargets(layout.doors)
    .forEach((target) => targets.set(target.id, target));
  return [...targets.values()];
}

function wallRectangles(layout: ShipLayoutSpec): Rect2[] {
  const walls: Rect2[] = [];
  const enclosedZones = layout.zones.filter(({ id }) =>
    id === 'crewCabin' || id === 'wheelhouse' || id === 'storageWorkroom');
  enclosedZones.forEach((zone) => {
    const zoneDoors = layout.doors.filter(({ zoneId }) => zoneId === zone.id);
    const portDoor = zoneDoors.find(({ orientation, side }) => orientation === 'side' && side === 'port');
    const starboardDoor = zoneDoors.find(({ orientation, side }) => orientation === 'side' && side === 'starboard');
    const aft = zoneDoors.find(({ orientation }) => orientation === 'aft');
    const addSide = (x: number, door: ShipDoorSpec | undefined): void => {
      if (!door) {
        walls.push(rect(x - WALL_THICKNESS / 2, x + WALL_THICKNESS / 2, zone.bounds.minZ, zone.bounds.maxZ));
        return;
      }
      const gapMin = door.center[1] - door.width / 2;
      const gapMax = door.center[1] + door.width / 2;
      walls.push(rect(x - WALL_THICKNESS / 2, x + WALL_THICKNESS / 2, zone.bounds.minZ, gapMin));
      walls.push(rect(x - WALL_THICKNESS / 2, x + WALL_THICKNESS / 2, gapMax, zone.bounds.maxZ));
    };
    addSide(zone.bounds.minX, portDoor);
    addSide(zone.bounds.maxX, starboardDoor);
    if (aft) {
      const gapMin = aft.center[0] - aft.width / 2;
      const gapMax = aft.center[0] + aft.width / 2;
      walls.push(rect(zone.bounds.minX, gapMin, zone.bounds.minZ - WALL_THICKNESS / 2, zone.bounds.minZ + WALL_THICKNESS / 2));
      walls.push(rect(gapMax, zone.bounds.maxX, zone.bounds.minZ - WALL_THICKNESS / 2, zone.bounds.minZ + WALL_THICKNESS / 2));
    } else {
      walls.push(rect(zone.bounds.minX, zone.bounds.maxX, zone.bounds.minZ - WALL_THICKNESS / 2, zone.bounds.minZ + WALL_THICKNESS / 2));
    }
    walls.push(rect(zone.bounds.minX, zone.bounds.maxX, zone.bounds.maxZ - WALL_THICKNESS / 2, zone.bounds.maxZ + WALL_THICKNESS / 2));
  });
  return walls.filter(validRect);
}

function activeObstacles(layout: ShipLayoutSpec): Rect2[] {
  const hullBounds = layout.zones.find(({ id }) => id === 'cargoDeck')!.bounds;
  const opening = layout.rail.starboardOpening;
  const openingMinZ = opening.centerZ - opening.width / 2;
  const openingMaxZ = opening.centerZ + opening.width / 2;
  const innerX = layout.rail.innerFaceX;
  return [
    ...wallRectangles(layout),
    ...layout.furniture.map(furnitureRect),
    deckHatchRect(layout.deckHatch),
    ...layout.rigging.masts.map(mastRect),
    rect(-innerX - RAIL_THICKNESS, -innerX, hullBounds.minZ, hullBounds.maxZ),
    rect(innerX, innerX + RAIL_THICKNESS, hullBounds.minZ, openingMinZ),
    rect(innerX, innerX + RAIL_THICKNESS, openingMaxZ, hullBounds.maxZ),
    rect(-innerX, innerX, hullBounds.minZ, hullBounds.minZ + RAIL_THICKNESS),
    rect(-innerX, innerX, hullBounds.maxZ - RAIL_THICKNESS, hullBounds.maxZ),
  ].filter(validRect);
}

interface ShipNavigationGrid {
  readonly minX: number;
  readonly minZ: number;
  readonly columns: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
  toCell(point: readonly [number, number]): number | undefined;
  cellPoint(index: number): readonly [number, number];
}

function buildShipNavigationGrid(layout: ShipLayoutSpec): ShipNavigationGrid {
  const bounds = layout.zones.find(({ id }) => id === 'cargoDeck')!.bounds;
  const minX = bounds.minX;
  const minZ = bounds.minZ;
  const columns = Math.round((bounds.maxX - minX) / GRID_STEP) + 1;
  const rows = Math.round((bounds.maxZ - minZ) / GRID_STEP) + 1;
  const obstacles = activeObstacles(layout).map((obstacle) =>
    inflate(obstacle, PLAYER_LAYOUT_RADIUS));
  const hull = layout.zones.find(({ id }) => id === 'cargoDeck');
  const cellPoint = (index: number): readonly [number, number] => {
    const xIndex = index % columns;
    const zIndex = Math.floor(index / columns);
    return [minX + xIndex * GRID_STEP, minZ + zIndex * GRID_STEP];
  };
  const blocked = new Uint8Array(columns * rows);
  for (let index = 0; index < blocked.length; index += 1) {
    const point = cellPoint(index);
    if (!hull || !pointInPolygon(point, hull.polygon)
      || obstacles.some((obstacle) => contains(obstacle, point))) blocked[index] = 1;
  }
  return {
    minX,
    minZ,
    columns,
    rows,
    blocked,
    toCell(point): number | undefined {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return undefined;
      const xIndex = Math.round((point[0] - minX) / GRID_STEP);
      const zIndex = Math.round((point[1] - minZ) / GRID_STEP);
      if (xIndex < 0 || xIndex >= columns || zIndex < 0 || zIndex >= rows) {
        return undefined;
      }
      return zIndex * columns + xIndex;
    },
    cellPoint,
  };
}

function forEachNavigableNeighbor(
  grid: ShipNavigationGrid,
  index: number,
  visit: (neighbor: number, cost: number) => void,
): void {
  const x = index % grid.columns;
  const z = Math.floor(index / grid.columns);
  for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (dx === 0 && dz === 0) continue;
    const nextX = x + dx;
    const nextZ = z + dz;
    if (!gridContains(grid, nextX, nextZ)) continue;
    const next = nextZ * grid.columns + nextX;
    if (grid.blocked[next]) continue;
    if (diagonalStepBlocked(grid, x, z, nextX, nextZ)) continue;
    visit(next, dx !== 0 && dz !== 0 ? GRID_STEP * Math.SQRT2 : GRID_STEP);
  }
}

function gridContains(grid: ShipNavigationGrid, x: number, z: number): boolean {
  return x >= 0 && x < grid.columns && z >= 0 && z < grid.rows;
}

function diagonalStepBlocked(
  grid: ShipNavigationGrid,
  x: number,
  z: number,
  nextX: number,
  nextZ: number,
): boolean {
  if (x === nextX || z === nextZ) return false;
  const horizontal = z * grid.columns + nextX;
  const vertical = nextZ * grid.columns + x;
  return Boolean(grid.blocked[horizontal] || grid.blocked[vertical]);
}

function routeDistance(
  grid: ShipNavigationGrid,
  start: number,
  goal: number,
): number | null {
  if (start === goal) return 0;
  const distances = new Float64Array(grid.blocked.length);
  distances.fill(Number.POSITIVE_INFINITY);
  distances[start] = 0;
  const closed = new Uint8Array(grid.blocked.length);
  const heapCells: number[] = [];
  const heapScores: number[] = [];
  const goalX = goal % grid.columns;
  const goalZ = Math.floor(goal / grid.columns);
  const heuristic = (cell: number): number => {
    const dx = Math.abs(cell % grid.columns - goalX);
    const dz = Math.abs(Math.floor(cell / grid.columns) - goalZ);
    const diagonal = Math.min(dx, dz);
    return GRID_STEP * (Math.max(dx, dz) + (Math.SQRT2 - 1) * diagonal);
  };
  const push = (cell: number, score: number): void => {
    let child = heapCells.length;
    heapCells.push(cell);
    heapScores.push(score);
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (heapScores[parent]! <= score) break;
      heapCells[child] = heapCells[parent]!;
      heapScores[child] = heapScores[parent]!;
      child = parent;
    }
    heapCells[child] = cell;
    heapScores[child] = score;
  };
  const pop = (): number => {
    const result = heapCells[0]!;
    const lastCell = heapCells.pop()!;
    const lastScore = heapScores.pop()!;
    if (heapCells.length === 0) return result;
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      if (left >= heapCells.length) break;
      const right = left + 1;
      const child = right < heapCells.length && heapScores[right]! < heapScores[left]!
        ? right : left;
      if (heapScores[child]! >= lastScore) break;
      heapCells[parent] = heapCells[child]!;
      heapScores[parent] = heapScores[child]!;
      parent = child;
    }
    heapCells[parent] = lastCell;
    heapScores[parent] = lastScore;
    return result;
  };
  push(start, heuristic(start));
  while (heapCells.length > 0) {
    const current = pop();
    if (closed[current]) continue;
    if (current === goal) return distances[current]!;
    closed[current] = 1;
    forEachNavigableNeighbor(grid, current, (neighbor, cost) => {
      if (closed[neighbor]) return;
      const distance = distances[current]! + cost;
      if (distance >= distances[neighbor]!) return;
      distances[neighbor] = distance;
      push(neighbor, distance + heuristic(neighbor));
    });
  }
  return null;
}

export function createShipRouteMetric(layout: ShipLayoutSpec): ShipRouteMetric {
  const grid = buildShipNavigationGrid(layout);
  const cache = new Map<string, number | null>();
  return Object.freeze({
    stable: true as const,
    distance(
      from: readonly [number, number],
      to: readonly [number, number],
    ): number | null {
      const fromCell = grid.toCell(from);
      const toCell = grid.toCell(to);
      if (fromCell === undefined || toCell === undefined) return null;
      const first = Math.min(fromCell, toCell);
      const second = Math.max(fromCell, toCell);
      const key = `${first}:${second}`;
      if (cache.has(key)) return cache.get(key)!;
      const distance = grid.blocked[fromCell] || grid.blocked[toCell]
        ? null : routeDistance(grid, fromCell, toCell);
      cache.set(key, distance);
      return distance;
    },
  });
}

export function analyzeShipNavigation(layout: ShipLayoutSpec): ShipNavigationAnalysis {
  const grid = buildShipNavigationGrid(layout);
  const targets = effectiveNavigationTargets(layout);
  const accessRectangles = secondaryAccessRectangles(layout.furniture);
  const start = targets.find(({ kind }) => kind === 'start');
  const startCell = start ? grid.toCell(start.position) : undefined;
  const visited = new Uint8Array(grid.columns * grid.rows);
  if (startCell !== undefined && grid.blocked[startCell] === 0) {
    const queue = new Int32Array(grid.columns * grid.rows);
    let head = 0;
    let tail = 0;
    queue[tail++] = startCell;
    visited[startCell] = 1;
    while (head < tail) {
      const current = queue[head++]!;
      forEachNavigableNeighbor(grid, current, (next) => {
        if (visited[next]) return;
        visited[next] = 1;
        queue[tail++] = next;
      });
    }
  }
  const unreachableTargetIds = targets
    .filter((target) => {
      const cell = grid.toCell(target.position);
      return cell === undefined || grid.blocked[cell] === 1 || visited[cell] === 0;
    })
    .map(({ id }) => id);
  const reachableSurfaceStandingPointIds: string[] = [];
  layout.furniture.forEach((owner) => owner.surfaces.forEach((surface) => {
    const candidates = surface.standingPoints.map((point, index) => ({
      id: `${surface.id}-standing-${index}`,
      position: transformLocalPoint(owner, point),
    }));
    const reachable = candidates.filter((candidate) => {
      const cell = grid.toCell(candidate.position);
      return cell !== undefined && grid.blocked[cell] === 0 && visited[cell] === 1;
    });
    reachableSurfaceStandingPointIds.push(...reachable.map(({ id }) => id));
  }));
  const reachableAccessIds = new Set(reachableSurfaceStandingPointIds.map((id) =>
    id.replace('-standing-', '-access-')));
  const reachableAccessRectangles = accessRectangles.filter(({ id }) => reachableAccessIds.has(id));
  return {
    unreachableTargetIds,
    reachableSurfaceStandingPointIds,
    minimumPrimaryClearance: minimumClearance(layout, 'primary'),
    minimumSecondaryClearance: minimumClearance(layout, 'secondary', reachableAccessRectangles),
    secondaryAccessLaneCount: reachableAccessRectangles.length,
    secondaryAccessRectangles: reachableAccessRectangles,
  };
}
