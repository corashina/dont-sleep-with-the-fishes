import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { disposeResourceSets } from './SceneResources';
import type { FootprintAnchor } from './ShipDangerLayout';

export interface ShipDamageDetailsSnapshot {
  clusters: number;
  colliders: number;
}

export class ShipDamageDetails {
  readonly root = new Group();

  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly clusterCount: number;
  private disposed = false;

  constructor(anchors: readonly FootprintAnchor[]) {
    this.root.name = 'ship-danger-damage';
    this.clusterCount = anchors.length;

    const plankGeometry = this.ownGeometry(new RoundedBoxGeometry(1, 1, 1, 2, 0.06));
    const gapGeometry = this.ownGeometry(new BoxGeometry(1, 1, 1));
    const fastenerGeometry = this.ownGeometry(new CylinderGeometry(0.045, 0.045, 0.02, 8));
    const timberMaterial = this.ownMaterial(new MeshStandardMaterial({ color: 0x4b2b1c, roughness: 0.86 }));
    const gapMaterial = this.ownMaterial(new MeshStandardMaterial({ color: 0x171313, roughness: 1 }));
    const fastenerMaterial = this.ownMaterial(new MeshStandardMaterial({ color: 0x342d29, metalness: 0.66, roughness: 0.44 }));

    anchors.forEach((anchor) => {
      const cluster = new Group();
      cluster.name = `ship-danger-broken-planks:${anchor.id}`;
      cluster.position.set(...anchor.position);
      cluster.rotation.set(...anchor.rotation);

      const gap = new Mesh(gapGeometry, gapMaterial);
      gap.name = `ship-danger-plank-gap:${anchor.id}`;
      gap.scale.set(anchor.size[0] * 0.96, 0.018, anchor.size[1] * 1.08);
      gap.position.y = -0.032;
      cluster.add(gap);

      for (let boardIndex = 0; boardIndex < 3; boardIndex += 1) {
        const board = new Mesh(plankGeometry, timberMaterial);
        const length = anchor.size[0] * (0.28 + boardIndex * 0.025);
        board.name = `ship-danger-split-plank:${anchor.id}:${boardIndex + 1}`;
        board.scale.set(length, 0.035, anchor.size[1]);
        board.position.set((boardIndex - 1) * anchor.size[0] * 0.31, 0.005, 0);
        board.rotation.z = (boardIndex - 1) * 0.018;
        cluster.add(board);

        for (let fastenerIndex = 0; fastenerIndex < 2; fastenerIndex += 1) {
          const fastener = new Mesh(fastenerGeometry, fastenerMaterial);
          fastener.name = `ship-danger-fastener:${anchor.id}:${boardIndex + 1}:${fastenerIndex + 1}`;
          fastener.rotation.x = Math.PI / 2;
          fastener.position.set(
            board.position.x + (fastenerIndex === 0 ? -1 : 1) * length * 0.31,
            0.033,
            anchor.size[1] * 0.3,
          );
          cluster.add(fastener);
        }
      }
      this.root.add(cluster);
    });
  }

  snapshotForTest(): ShipDamageDetailsSnapshot {
    return { clusters: this.clusterCount, colliders: 0 };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeResourceSets(this.geometries, this.materials);
    this.root.clear();
  }

  private ownGeometry(geometry: BufferGeometry): BufferGeometry {
    this.geometries.add(geometry);
    return geometry;
  }

  private ownMaterial<T extends Material>(material: T): T {
    this.materials.add(material);
    return material;
  }
}
