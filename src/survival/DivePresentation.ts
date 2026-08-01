import {
  CircleGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import {
  DIVE_ENTRY_DURATION_SECONDS,
  createDivePose,
  sampleDivePose,
  type DivePose,
} from './diveChoreography';

const BUBBLE_COUNT = 56;
const SEAT_CAMERA_X = 0.78;

export interface DivePresentationOptions {
  readonly camera: PerspectiveCamera;
  readonly starboardPosition: Readonly<Vector3>;
  readonly starboardQuaternion: Readonly<Quaternion>;
}

interface ActiveDive {
  readonly onWaterImpact: () => void;
  readonly resolve: () => void;
}

export class DivePresentation {
  readonly root = new Object3D();

  private readonly goggles = new Group();
  private readonly waterVeil: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly bubbleMesh: InstancedMesh<SphereGeometry, MeshBasicMaterial>;
  private readonly savedPosition = new Vector3();
  private readonly savedQuaternion = new Quaternion();
  private readonly scratchObject = new Object3D();
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchPosition = new Vector3();
  private readonly scratchQuaternion = new Quaternion();
  private readonly pose: DivePose = createDivePose();
  private active: ActiveDive | null = null;
  private wasSubmerged = false;
  private impactEmitted = false;
  private cameraCaptured = false;
  private disposed = false;

  constructor(private readonly options: DivePresentationOptions) {
    this.root.name = 'dive-presentation';
    this.root.visible = false;

    this.goggles.name = 'dive-goggles';
    this.buildGoggles();

    const veilGeometry = new PlaneGeometry(2.2, 1.45);
    const veilMaterial = new MeshBasicMaterial({
      color: new Color(0x4aafbd),
      transparent: true,
      opacity: 0.54,
      depthTest: false,
      depthWrite: false,
    });
    this.waterVeil = new Mesh(veilGeometry, veilMaterial);
    this.waterVeil.name = 'dive-water-veil';
    this.waterVeil.position.set(0, 0, -0.92);
    this.waterVeil.renderOrder = 20;

    const bubbleGeometry = new SphereGeometry(0.018, 6, 5);
    const bubbleMaterial = new MeshBasicMaterial({
      color: 0xb7e5e6,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.bubbleMesh = new InstancedMesh(
      bubbleGeometry,
      bubbleMaterial,
      BUBBLE_COUNT,
    );
    this.bubbleMesh.name = 'dive-bubbles';
    this.bubbleMesh.renderOrder = 21;

    this.root.add(this.goggles, this.waterVeil, this.bubbleMesh);
    options.camera.add(this.root);
    this.resetLayers();
  }

  start(onWaterImpact: () => void): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.cameraCaptured) this.clear();
    this.savedPosition.copy(this.options.camera.position);
    this.savedQuaternion.copy(this.options.camera.quaternion);
    this.cameraCaptured = true;
    this.root.visible = true;
    this.goggles.visible = true;
    this.waterVeil.visible = false;
    this.bubbleMesh.visible = false;
    this.wasSubmerged = false;
    this.impactEmitted = false;
    sampleDivePose(0, this.pose);
    this.applyPose(0);
    return new Promise<void>((resolve) => {
      this.active = { onWaterImpact, resolve };
    });
  }

  update(timeSeconds: number, _deltaSeconds: number, waterHeight: number): void {
    const active = this.active;
    if (this.disposed || active === null) return;
    sampleDivePose(timeSeconds, this.pose);
    this.applyPose(waterHeight);

    const enteredWater = this.pose.submerged && !this.wasSubmerged;
    this.wasSubmerged = this.pose.submerged;
    if (enteredWater && !this.impactEmitted) {
      this.impactEmitted = true;
      active.onWaterImpact();
      if (this.disposed || this.active !== active) return;
    }

    if (this.pose.elapsed >= DIVE_ENTRY_DURATION_SECONDS) {
      this.active = null;
      active.resolve();
    }
  }

  clear(): void {
    if (this.disposed) return;
    const active = this.active;
    this.active = null;
    if (this.cameraCaptured) this.restoreCamera();
    this.cameraCaptured = false;
    this.resetLayers();
    this.wasSubmerged = false;
    this.impactEmitted = false;
    active?.resolve();
  }

  settleForVisibilityChange(): void {
    this.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.root.removeFromParent();
    this.goggles.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const material = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const item of material) item.dispose();
    });
    this.waterVeil.geometry.dispose();
    this.waterVeil.material.dispose();
    this.bubbleMesh.geometry.dispose();
    this.bubbleMesh.material.dispose();
    this.root.clear();
  }

  private buildGoggles(): void {
    const rubberMaterial = new MeshStandardMaterial({
      color: 0x263c3d,
      roughness: 0.88,
      metalness: 0.03,
      flatShading: true,
    });
    const glassMaterial = new MeshBasicMaterial({
      color: 0x83bdba,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const bridgeMaterial = new MeshStandardMaterial({
      color: 0x30484a,
      roughness: 0.7,
      metalness: 0.12,
      flatShading: true,
    });
    const leftRing = new Mesh(new TorusGeometry(0.28, 0.054, 5, 9), rubberMaterial);
    leftRing.name = 'dive-goggle-ring-left';
    leftRing.position.set(-0.31, -0.2, -0.92);
    leftRing.rotation.z = -0.07;
    const rightRing = new Mesh(new TorusGeometry(0.245, 0.047, 5, 8), rubberMaterial.clone());
    rightRing.name = 'dive-goggle-ring-right';
    rightRing.position.set(0.3, -0.18, -0.92);
    rightRing.rotation.z = 0.045;
    const leftGlass = new Mesh(new CircleGeometry(0.238, 9), glassMaterial);
    leftGlass.name = 'dive-goggle-glass-left';
    leftGlass.position.set(-0.31, -0.2, -0.918);
    const rightGlass = new Mesh(new CircleGeometry(0.205, 8), glassMaterial.clone());
    rightGlass.name = 'dive-goggle-glass-right';
    rightGlass.position.set(0.3, -0.18, -0.918);
    const bridge = new Mesh(new TorusGeometry(0.13, 0.035, 4, 6, Math.PI), bridgeMaterial);
    bridge.name = 'dive-goggle-bridge';
    bridge.position.set(0, -0.15, -0.924);
    bridge.rotation.z = Math.PI;
    this.goggles.add(leftRing, rightRing, leftGlass, rightGlass, bridge);
  }

  private applyPose(waterHeight: number): void {
    const seatProgress = Math.min(1, Math.max(0, this.pose.cameraX / SEAT_CAMERA_X));
    this.scratchPosition.lerpVectors(
      this.savedPosition,
      this.options.starboardPosition,
      seatProgress,
    );
    this.options.camera.position.copy(this.scratchPosition);
    this.options.camera.position.y += this.pose.cameraY
      + (Number.isFinite(waterHeight) ? waterHeight : 0);
    this.options.camera.position.z += this.pose.cameraZ;

    this.scratchQuaternion.slerpQuaternions(
      this.savedQuaternion,
      this.options.starboardQuaternion,
      seatProgress,
    );
    this.options.camera.quaternion.copy(this.scratchQuaternion);
    this.options.camera.rotateY(this.pose.cameraYaw);
    this.options.camera.rotateX(this.pose.cameraPitch);
    this.options.camera.rotateZ(this.pose.cameraRoll);

    this.goggles.position.y = 0.5 - this.pose.goggleLift * 0.68;
    this.goggles.rotation.z = -0.035 * (1 - this.pose.goggleSettle);
    this.waterVeil.visible = this.pose.waterCoverage > 0.008;
    this.waterVeil.material.opacity = 0.12 + this.pose.waterCoverage * 0.42;
    this.bubbleMesh.visible = this.pose.bubbleStrength > 0.008;
    this.applyBubbles(this.pose.elapsed, this.pose.bubbleStrength);
  }

  private applyBubbles(elapsed: number, strength: number): void {
    for (let index = 0; index < BUBBLE_COUNT; index += 1) {
      const column = index % 8;
      const row = Math.floor(index / 8);
      const rise = (elapsed * (0.26 + (index % 5) * 0.025) + row * 0.13) % 1;
      const drift = Math.sin(elapsed * 1.8 + index * 1.73) * 0.025;
      this.scratchObject.position.set(
        (column - 3.5) * 0.12 + drift,
        -0.6 + rise * 1.2,
        -0.82 - (index % 4) * 0.055,
      );
      const scale = strength * (0.42 + (index % 3) * 0.13);
      this.scratchObject.scale.setScalar(scale);
      this.scratchObject.quaternion.identity();
      this.scratchObject.updateMatrix();
      this.scratchMatrix.copy(this.scratchObject.matrix);
      this.bubbleMesh.setMatrixAt(index, this.scratchMatrix);
    }
    this.bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  private restoreCamera(): void {
    this.options.camera.position.copy(this.savedPosition);
    this.options.camera.quaternion.copy(this.savedQuaternion);
  }

  private resetLayers(): void {
    this.root.visible = false;
    this.goggles.visible = false;
    this.goggles.position.set(0, 0, 0);
    this.goggles.rotation.set(0, 0, 0);
    this.waterVeil.visible = false;
    this.bubbleMesh.visible = false;
  }
}
