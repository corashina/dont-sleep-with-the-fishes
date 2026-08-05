import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type Scene,
} from 'three';
import {
  type PhysicsCuboid,
  type PhysicsPose,
} from './ScavengePhysics';
import type { PhysicsObjectCollider } from './ScavengePhysicsObjectTypes';

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
  private readonly cylinderGeometry = new CylinderGeometry(1, 1, 2, 12, 1, true);
  private readonly sphereGeometry = new SphereGeometry(1, 12, 8);
  private readonly staticMaterial = debugMaterial(0x5dd6c2);
  private readonly dynamicMaterial = debugMaterial(0xd98236);
  private readonly objectMeshes: readonly Mesh[];
  private disposed = false;

  constructor(
    scene: Scene,
    ship: Group,
    staticCuboids: readonly PhysicsCuboid[],
    objects: readonly { readonly id: string; readonly collider: PhysicsObjectCollider }[],
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
    this.objectMeshes = objects.map(({ id, collider }) => {
      const geometry = collider.kind === 'sphere'
        ? this.sphereGeometry
        : collider.kind === 'cylinder'
          ? this.cylinderGeometry
          : this.boxGeometry;
      const mesh = new Mesh(geometry, this.dynamicMaterial);
      mesh.name = `physics-debug-object:${id}`;
      if (collider.kind === 'sphere') {
        mesh.scale.setScalar(collider.radius);
      } else if (collider.kind === 'cylinder') {
        mesh.scale.set(collider.radius, collider.halfHeight, collider.radius);
      } else {
        mesh.scale.set(
          collider.halfExtents.x * 2,
          collider.halfExtents.y * 2,
          collider.halfExtents.z * 2,
        );
      }
      mesh.renderOrder = DEBUG_RENDER_ORDER;
      this.dynamicRoot.add(mesh);
      return mesh;
    });
    ship.add(this.staticRoot);
    scene.add(this.dynamicRoot);
  }

  sync(objectPoses: readonly PhysicsPose[]): void {
    for (let index = 0; index < this.objectMeshes.length; index += 1) {
      const mesh = this.objectMeshes[index]!;
      const pose = objectPoses[index];
      if (!pose) continue;
      mesh.position.set(pose.translation.x, pose.translation.y, pose.translation.z);
      mesh.quaternion.set(
        pose.rotation.x,
        pose.rotation.y,
        pose.rotation.z,
        pose.rotation.w,
      );
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.staticRoot.removeFromParent();
    this.dynamicRoot.removeFromParent();
    this.boxGeometry.dispose();
    this.cylinderGeometry.dispose();
    this.sphereGeometry.dispose();
    this.staticMaterial.dispose();
    this.dynamicMaterial.dispose();
  }
}
