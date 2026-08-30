import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  DIVE_ENTRY_DURATION_SECONDS,
  DIVE_IMPACT_SECONDS,
  DIVE_SEAT_CAMERA_X,
  createDivePose,
  sampleDivePose,
  type DivePose,
} from './diveChoreography';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';

const BUBBLE_COLUMNS = 12;
const BUBBLE_ROWS = 7;
const BUBBLE_COUNT = BUBBLE_COLUMNS * BUBBLE_ROWS;
const VEIL_RENDER_ORDER = 20;
const BUBBLE_RENDER_ORDER = 21;
const GOGGLE_RENDER_ORDER = 22;
const GOGGLE_MODEL_NAME = 'glasses25001';
const GOGGLE_PRESENTATION_WIDTH = 3.4;
const GOGGLE_START_Y = 1.25;
const GOGGLE_FACE_Y = 0.48;
const GOGGLE_START_Z = -0.92;
const GOGGLE_FACE_Z = -0.72;

export interface DivePresentationOptions {
  readonly camera: PerspectiveCamera;
  readonly starboardPosition: Readonly<Vector3>;
  readonly starboardQuaternion: Readonly<Quaternion>;
  readonly goggleModel: Group;
}

export interface DivePostEntryHold {
  readonly durationSeconds: number;
  readonly cameraWorldPosition: Readonly<Vector3>;
  readonly cameraWorldTarget: Readonly<Vector3>;
  readonly onStart: () => void;
}

export interface DivePlayOptions {
  readonly onWaterImpact: () => void;
  readonly postEntryHold?: DivePostEntryHold;
}

interface ActiveDive {
  readonly options: DivePlayOptions;
  readonly resolve: () => void;
}

interface GoggleMaterialState {
  readonly material: MeshBasicMaterial | MeshStandardMaterial;
  readonly opacity: number;
}

export class DivePresentation {
  readonly root = new Object3D();

  private readonly goggles = new Group();
  private readonly goggleMaterials: GoggleMaterialState[] = [];
  private readonly goggleGeometries = new Set<BufferGeometry>();
  private readonly goggleOwnedMaterials = new Set<Material>();
  private readonly waterVeil: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly bubbleMesh: InstancedMesh<SphereGeometry, MeshBasicMaterial>;
  private readonly savedPosition = new Vector3();
  private readonly savedQuaternion = new Quaternion();
  private readonly scratchObject = new Object3D();
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchPosition = new Vector3();
  private readonly scratchQuaternion = new Quaternion();
  private readonly pose: DivePose = createDivePose();
  private readonly entryPose: DivePose = createDivePose();
  private readonly waterEntryLocalPosition = new Vector3();
  private readonly waterEntryWorldPosition = new Vector3();
  private readonly waterSurfaceWorldPosition = new Vector3();
  private readonly waterSurfaceLocalPosition = new Vector3();
  private active: ActiveDive | null = null;
  private postEntryHold: DivePostEntryHold | null = null;
  private entryElapsed = 0;
  private holdElapsed = 0;
  private holdStarted = false;
  private wasSubmerged = false;
  private impactEmitted = false;
  private cameraCaptured = false;
  private disposed = false;

  constructor(private readonly options: DivePresentationOptions) {
    this.root.name = 'dive-presentation';
    this.root.visible = false;

    this.goggles.name = 'dive-goggles';
    this.attachGoggleModel(options.goggleModel);

    const veilGeometry = new PlaneGeometry(5, 3);
    const veilMaterial = new MeshBasicMaterial({
      color: new Color(0x4aafbd),
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    this.waterVeil = new Mesh(veilGeometry, veilMaterial);
    this.waterVeil.name = 'dive-water-veil';
    this.waterVeil.position.set(0, 0, -0.92);
    this.waterVeil.renderOrder = VEIL_RENDER_ORDER;

    const bubbleGeometry = new SphereGeometry(0.018, 6, 5);
    const bubbleMaterial = new MeshBasicMaterial({
      color: 0xb7e5e6,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
    });
    this.bubbleMesh = new InstancedMesh(
      bubbleGeometry,
      bubbleMaterial,
      BUBBLE_COUNT,
    );
    this.bubbleMesh.name = 'dive-bubbles';
    this.bubbleMesh.renderOrder = BUBBLE_RENDER_ORDER;

    this.root.add(this.goggles, this.waterVeil, this.bubbleMesh);
    options.camera.add(this.root);
    sampleDivePose(DIVE_IMPACT_SECONDS, this.entryPose);
    this.waterEntryLocalPosition.set(
      options.starboardPosition.x + this.entryPose.cameraOutward,
      options.starboardPosition.y + this.entryPose.cameraY,
      options.starboardPosition.z + this.entryPose.cameraZ,
    );
    this.resetLayers();
  }

  copyWaterEntryWorldPosition(output: Vector3): Vector3 {
    output.copy(this.waterEntryLocalPosition);
    const parent = this.options.camera.parent;
    if (parent === null) return output;
    parent.updateWorldMatrix(true, false);
    return parent.localToWorld(output);
  }

  copyWorldWaterSurfaceToLocal(worldHeight: number, output: Vector3): Vector3 {
    if (!Number.isFinite(worldHeight)) {
      return output.copy(this.waterEntryLocalPosition);
    }
    const parent = this.options.camera.parent;
    if (parent === null) {
      return output.set(
        this.waterEntryLocalPosition.x,
        worldHeight,
        this.waterEntryLocalPosition.z,
      );
    }
    this.copyWaterEntryWorldPosition(this.waterEntryWorldPosition);
    this.waterSurfaceWorldPosition.set(
      this.waterEntryWorldPosition.x,
      worldHeight,
      this.waterEntryWorldPosition.z,
    );
    output.copy(this.waterSurfaceWorldPosition);
    return parent.worldToLocal(output);
  }

  start(options: DivePlayOptions): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.cameraCaptured) this.clear();
    this.savedPosition.copy(this.options.camera.position);
    this.savedQuaternion.copy(this.options.camera.quaternion);
    this.cameraCaptured = true;
    this.root.visible = true;
    this.goggles.visible = false;
    this.waterVeil.visible = false;
    this.bubbleMesh.visible = false;
    this.wasSubmerged = false;
    this.impactEmitted = false;
    this.entryElapsed = 0;
    this.holdElapsed = 0;
    this.holdStarted = false;
    this.postEntryHold = options.postEntryHold ?? null;
    sampleDivePose(0, this.pose);
    this.applyPose(0);
    return new Promise<void>((resolve) => {
      this.active = { options, resolve };
    });
  }

  update(deltaSeconds: number, waterHeight: number): void {
    const active = this.active;
    if (this.disposed || active === null) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    let remainingDelta = deltaSeconds;
    if (!this.holdStarted) {
      const entryRemainder = this.updateEntry(active, remainingDelta, waterHeight);
      if (entryRemainder === null) return;
      remainingDelta = entryRemainder;
    }

    this.updateHold(active, remainingDelta);
  }

  private updateEntry(
    active: ActiveDive,
    deltaSeconds: number,
    waterHeight: number,
  ): number | null {
    const nextEntryElapsed = this.entryElapsed + deltaSeconds;
    this.entryElapsed = Math.min(nextEntryElapsed, DIVE_ENTRY_DURATION_SECONDS);
    const remainingDelta = Math.max(0, nextEntryElapsed - DIVE_ENTRY_DURATION_SECONDS);
    sampleDivePose(Math.min(this.entryElapsed, DIVE_ENTRY_DURATION_SECONDS), this.pose);
    this.applyPose(waterHeight);

    const enteredWater = this.pose.submerged && !this.wasSubmerged;
    this.wasSubmerged = this.pose.submerged;
    if (enteredWater && !this.impactEmitted) {
      this.impactEmitted = true;
      active.options.onWaterImpact();
      if (this.disposed || this.active !== active) return null;
    }

    if (this.entryElapsed < DIVE_ENTRY_DURATION_SECONDS) return null;
    const hold = active.options.postEntryHold;
    if (hold === undefined) {
      this.finish(active);
      return null;
    }
    this.startHold(hold);
    return this.disposed || this.active !== active ? null : remainingDelta;
  }

  private updateHold(active: ActiveDive, remainingDelta: number): void {
    const hold = active.options.postEntryHold!;
    this.applyHoldCamera(hold);
    this.holdElapsed = Math.min(
      hold.durationSeconds,
      this.holdElapsed + remainingDelta,
    );
    if (this.holdElapsed >= hold.durationSeconds) this.finish(active);
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
    this.entryElapsed = 0;
    this.holdElapsed = 0;
    this.holdStarted = false;
    this.postEntryHold = null;
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
    disposeResourceSets(this.goggleGeometries, this.goggleOwnedMaterials);
    this.waterVeil.geometry.dispose();
    this.waterVeil.material.dispose();
    this.bubbleMesh.dispose();
    this.bubbleMesh.geometry.dispose();
    this.bubbleMesh.material.dispose();
    this.root.clear();
  }

  private attachGoggleModel(model: Group): void {
    collectMeshResources(model, this.goggleGeometries, this.goggleOwnedMaterials);
    this.goggles.add(model);
    let modelGoggles: Object3D | undefined;
    model.traverse((object) => {
      const normalizedName = object.name.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (modelGoggles === undefined && normalizedName === GOGGLE_MODEL_NAME) {
        modelGoggles = object;
      }
    });
    if (modelGoggles === undefined) {
      disposeResourceSets(this.goggleGeometries, this.goggleOwnedMaterials);
      this.goggles.clear();
      throw new Error(`Scuba model is missing ${GOGGLE_MODEL_NAME}.`);
    }
    model.traverse((object) => {
      if (object instanceof Mesh) object.visible = false;
    });
    modelGoggles.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.visible = true;
      object.renderOrder = GOGGLE_RENDER_ORDER;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshBasicMaterial)
          && !(material instanceof MeshStandardMaterial)) continue;
        material.transparent = true;
        material.depthTest = false;
        material.depthWrite = false;
        material.side = DoubleSide;
        this.goggleMaterials.push({ material, opacity: material.opacity });
      }
    });
    model.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(modelGoggles);
    const size = bounds.getSize(new Vector3());
    if (bounds.isEmpty() || !Number.isFinite(size.x) || size.x <= 0) {
      disposeResourceSets(this.goggleGeometries, this.goggleOwnedMaterials);
      this.goggles.clear();
      throw new Error('Scuba goggles model has invalid bounds.');
    }
    const center = bounds.getCenter(new Vector3());
    const scale = GOGGLE_PRESENTATION_WIDTH / size.x;
    model.scale.multiplyScalar(scale);
    model.position.addScaledVector(center, -scale);
  }

  private applyPose(worldWaterHeight: number): void {
    const seatProgress = Math.min(
      1,
      Math.max(0, this.pose.cameraX / DIVE_SEAT_CAMERA_X),
    );
    this.copyWorldWaterSurfaceToLocal(
      worldWaterHeight,
      this.waterSurfaceLocalPosition,
    );
    this.scratchPosition.lerpVectors(
      this.savedPosition,
      this.options.starboardPosition,
      seatProgress,
    );
    this.options.camera.position.copy(this.scratchPosition);
    this.options.camera.position.x += this.pose.cameraOutward;
    this.options.camera.position.y += this.pose.cameraY;
    this.options.camera.position.z += this.pose.cameraZ;
    this.options.camera.position.x += (
      this.waterSurfaceLocalPosition.x - this.waterEntryLocalPosition.x
    ) * this.pose.entryProgress;
    this.options.camera.position.y += (
      this.waterSurfaceLocalPosition.y - this.waterEntryLocalPosition.y
    ) * this.pose.entryProgress;
    this.options.camera.position.z += (
      this.waterSurfaceLocalPosition.z - this.waterEntryLocalPosition.z
    ) * this.pose.entryProgress;

    this.scratchQuaternion.slerpQuaternions(
      this.savedQuaternion,
      this.options.starboardQuaternion,
      seatProgress,
    );
    this.options.camera.quaternion.copy(this.scratchQuaternion);
    this.options.camera.rotateY(this.pose.cameraYaw);
    this.options.camera.rotateX(this.pose.cameraPitch);
    this.options.camera.rotateZ(this.pose.cameraRoll);

    this.goggles.visible = this.pose.goggleLift > 0.001;
    this.goggles.position.set(
      0,
      GOGGLE_START_Y
        + (GOGGLE_FACE_Y - GOGGLE_START_Y) * this.pose.goggleSettle,
      GOGGLE_START_Z
        + (GOGGLE_FACE_Z - GOGGLE_START_Z) * this.pose.goggleSettle,
    );
    this.goggles.rotation.z = Math.PI - 0.035 * (1 - this.pose.goggleSettle);
    for (const state of this.goggleMaterials) {
      state.material.opacity = state.opacity * this.pose.goggleLift;
    }
    this.waterVeil.visible = this.pose.waterCoverage > 0.008;
    this.waterVeil.material.opacity = this.pose.waterCoverage;
    this.bubbleMesh.visible = this.pose.bubbleStrength > 0.008;
    this.applyBubbles(this.pose.elapsed, this.pose.bubbleStrength);
  }

  private applyBubbles(elapsed: number, strength: number): void {
    const visibleHalfWidth = Math.tan(this.options.camera.fov * Math.PI / 360)
      * this.options.camera.aspect
      * 0.9;
    for (let index = 0; index < BUBBLE_COUNT; index += 1) {
      const column = index % BUBBLE_COLUMNS;
      const row = Math.floor(index / BUBBLE_COLUMNS);
      const rise = (elapsed * (0.26 + (index % 5) * 0.025) + row * 0.13) % 1;
      const drift = Math.sin(elapsed * 1.8 + index * 1.73) * 0.025;
      this.scratchObject.position.set(
        ((column / (BUBBLE_COLUMNS - 1)) * 2 - 1) * visibleHalfWidth * 1.14 + drift,
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

  private startHold(hold: DivePostEntryHold): void {
    this.holdStarted = true;
    hold.onStart();
    this.goggles.visible = false;
    this.waterVeil.visible = false;
    this.bubbleMesh.visible = false;
  }

  applyPostEntryHoldCamera(): void {
    const hold = this.postEntryHold;
    if (!this.cameraCaptured || !this.holdStarted || hold === null) return;
    this.applyHoldCamera(hold);
  }

  private applyHoldCamera(hold: DivePostEntryHold): void {
    this.scratchPosition.set(
      hold.cameraWorldPosition.x,
      hold.cameraWorldPosition.y,
      hold.cameraWorldPosition.z,
    );
    const parent = this.options.camera.parent;
    if (parent !== null) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(this.scratchPosition);
    }
    this.options.camera.position.copy(this.scratchPosition);
    this.options.camera.lookAt(
      hold.cameraWorldTarget.x,
      hold.cameraWorldTarget.y,
      hold.cameraWorldTarget.z,
    );
  }

  private finish(active: ActiveDive): void {
    if (this.active !== active) return;
    this.active = null;
    active.resolve();
  }

  private resetLayers(): void {
    this.root.visible = false;
    this.goggles.visible = false;
    this.goggles.position.set(0, 0, 0);
    this.goggles.rotation.set(0, 0, 0);
    for (const state of this.goggleMaterials) state.material.opacity = 0;
    this.waterVeil.visible = false;
    this.bubbleMesh.visible = false;
  }
}
