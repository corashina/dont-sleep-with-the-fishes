import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Scene,
} from 'three';
import {
  SCAVENGE_BARREL_HALF_HEIGHT,
  SCAVENGE_BARREL_RADIUS,
  type PhysicsCuboid,
  type PhysicsPose,
} from './ScavengePhysics';

const DEBUG_RENDER_ORDER = 10_000;

function debugMaterial(color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity: 0.72,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

export class ScavengePhysicsDebugView {
  readonly staticRoot = new Group();
  readonly dynamicRoot = new Group();

  private readonly boxGeometry = new BoxGeometry(1, 1, 1);
  private readonly barrelGeometry = new CylinderGeometry(1, 1, 2, 12, 1, true);
  private readonly staticMaterial = debugMaterial(0x5dd6c2);
  private readonly dynamicMaterial = debugMaterial(0xd98236);
  private readonly barrelMeshes: readonly Mesh[];
  private disposed = false;

  constructor(
    scene: Scene,
    ship: Group,
    staticCuboids: readonly PhysicsCuboid[],
    barrelCount: number,
  ) {
    this.staticRoot.name = 'physics-debug-static';
    this.dynamicRoot.name = 'physics-debug-dynamic';
    staticCuboids.forEach(({ center, halfExtents, rotation }, index) => {
      const mesh = new Mesh(this.boxGeometry, this.staticMaterial);
      mesh.name = `physics-debug-cuboid:${index}`;
      mesh.position.set(center.x, center.y, center.z);
      mesh.scale.set(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2);
      if (rotation) mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      mesh.renderOrder = DEBUG_RENDER_ORDER;
      this.staticRoot.add(mesh);
    });
    this.barrelMeshes = Array.from({ length: barrelCount }, (_, index) => {
      const mesh = new Mesh(this.barrelGeometry, this.dynamicMaterial);
      mesh.name = `physics-debug-barrel:${index + 1}`;
      mesh.scale.set(
        SCAVENGE_BARREL_RADIUS,
        SCAVENGE_BARREL_HALF_HEIGHT,
        SCAVENGE_BARREL_RADIUS,
      );
      mesh.renderOrder = DEBUG_RENDER_ORDER;
      this.dynamicRoot.add(mesh);
      return mesh;
    });
    ship.add(this.staticRoot);
    scene.add(this.dynamicRoot);
  }

  sync(barrelPoses: readonly PhysicsPose[]): void {
    this.barrelMeshes.forEach((mesh, index) => {
      const pose = barrelPoses[index];
      if (!pose) return;
      mesh.position.set(pose.translation.x, pose.translation.y, pose.translation.z);
      mesh.quaternion.set(
        pose.rotation.x,
        pose.rotation.y,
        pose.rotation.z,
        pose.rotation.w,
      );
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.staticRoot.removeFromParent();
    this.dynamicRoot.removeFromParent();
    this.boxGeometry.dispose();
    this.barrelGeometry.dispose();
    this.staticMaterial.dispose();
    this.dynamicMaterial.dispose();
  }
}
