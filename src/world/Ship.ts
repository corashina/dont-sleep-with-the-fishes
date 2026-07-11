import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { CollisionBox } from '../player/collisions';

export interface ShipBuild {
  root: Group;
  colliders: CollisionBox[];
  itemSpawnPoints: Vector3[];
  playerStart: Vector3;
  evacuationPoint: Vector3;
}

const steel = new MeshStandardMaterial({ color: 0x586166, roughness: 0.82, metalness: 0.28, flatShading: true });
const darkSteel = new MeshStandardMaterial({ color: 0x30383b, roughness: 0.88, metalness: 0.24, flatShading: true });
const deckMaterial = new MeshStandardMaterial({ color: 0x62584b, roughness: 0.94, flatShading: true });
const alarmMaterial = new MeshStandardMaterial({ color: 0x9c4f3f, emissive: 0x3d120d, emissiveIntensity: 0.35 });

function block(size: [number, number, number], position: [number, number, number], material = steel): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function selectSpawnPoints(
  points: readonly Vector3[],
  random: () => number = Math.random,
): Vector3[] {
  const selected = points.map((point) => point.clone());
  for (let index = selected.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(
      Math.max(0, Math.min(0.999999, random())) * (index + 1),
    );
    [selected[index], selected[swapIndex]] = [selected[swapIndex]!, selected[index]!];
  }
  return selected;
}

export function createShip(): ShipBuild {
  const root = new Group();
  root.name = 'sinking-ship';
  root.add(block([8.4, 2.8, 24], [0, 0.2, 0], darkSteel));
  root.add(block([8, 0.35, 21], [0, 2, 0], deckMaterial));
  root.add(block([7.4, 0.25, 8], [0, 5.25, 5.2], steel));
  root.add(block([0.25, 3.1, 8], [-3.7, 3.65, 5.2], steel));
  root.add(block([0.25, 3.1, 8], [3.7, 3.65, 5.2], steel));
  root.add(block([7.4, 3.1, 0.25], [0, 3.65, 9.08], steel));
  root.add(block([2.65, 3.1, 0.25], [-2.38, 3.65, 1.2], steel));
  root.add(block([2.65, 3.1, 0.25], [2.38, 3.65, 1.2], steel));
  root.add(block([2.5, 0.9, 0.9], [0, 2.55, 7.1], darkSteel));
  root.add(block([0.18, 1.1, 13], [-3.85, 2.65, -4.2], steel));
  root.add(block([0.18, 1.1, 13], [3.85, 2.65, -4.2], steel));
  const alarmBeacon = block([0.7, 0.7, 0.7], [-2.8, 2.55, -6.5], alarmMaterial);
  alarmBeacon.name = 'alarm-beacon';
  root.add(alarmBeacon);
  root.add(block([1.4, 1.2, 1.5], [1.6, 2.75, -5.5], darkSteel));
  root.add(block([1.8, 1.4, 1.8], [-1.8, 2.85, -7.5], darkSteel));

  const colliders: CollisionBox[] = [
    { minX: -4, maxX: 4, minY: 1.8, maxY: 2.2, minZ: -10.5, maxZ: 10.5 },
    { minX: -3.9, maxX: -3.5, minY: 2, maxY: 5.4, minZ: 1.2, maxZ: 9.2 },
    { minX: 3.5, maxX: 3.9, minY: 2, maxY: 5.4, minZ: 1.2, maxZ: 9.2 },
    { minX: -3.8, maxX: 3.8, minY: 2, maxY: 5.4, minZ: 8.9, maxZ: 9.3 },
    { minX: -3.8, maxX: -1.05, minY: 2, maxY: 5.4, minZ: 1.05, maxZ: 1.4 },
    { minX: 1.05, maxX: 3.8, minY: 2, maxY: 5.4, minZ: 1.05, maxZ: 1.4 },
    { minX: -1.25, maxX: 1.25, minY: 2, maxY: 4.2, minZ: 6.65, maxZ: 7.55 },
    { minX: 0.9, maxX: 2.3, minY: 2, maxY: 4.2, minZ: -6.25, maxZ: -4.75 },
    { minX: -2.7, maxX: -0.9, minY: 2, maxY: 4.2, minZ: -8.4, maxZ: -6.6 },
    { minX: -3.94, maxX: -3.76, minY: 2, maxY: 4.2, minZ: -10.7, maxZ: 2.3 },
    { minX: 3.76, maxX: 3.94, minY: 2, maxY: 4.2, minZ: -10.7, maxZ: 2.3 },
  ];

  return {
    root,
    colliders,
    itemSpawnPoints: [
      new Vector3(-2.7, 2.35, 7.6), new Vector3(2.6, 2.35, 7.6),
      new Vector3(-2.5, 2.35, 3.4), new Vector3(2.45, 2.35, 2.7),
      new Vector3(-2.4, 2.35, -2.6), new Vector3(2.6, 2.35, -3.6),
      new Vector3(-0.2, 2.35, -6.4), new Vector3(2.4, 2.35, -8.6),
      new Vector3(-2.55, 2.35, 5.55), new Vector3(2.55, 2.35, 5.35),
      new Vector3(-1.45, 2.35, 2.45), new Vector3(1.15, 2.35, -1.6),
      new Vector3(-2.65, 2.35, -4.75), new Vector3(0.35, 2.35, -9.1),
    ],
    playerStart: new Vector3(0, 3.72, 7.8),
    evacuationPoint: new Vector3(3.2, 3.72, -5.8),
  };
}
