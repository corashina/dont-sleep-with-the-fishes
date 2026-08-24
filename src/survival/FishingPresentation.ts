import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { WaveSample } from '../ocean/WaveField';
import {
  projectBoatObjectBoundsInto,
  type ProjectedBoatBounds,
} from './BoatInteraction';
import { FishingBiteParticles } from './FishingBiteParticles';
import { FishingCatchLibrary } from './FishingCatchLibrary';
import type { FishingCatchId } from './fishingCatalog';
import type { FishingCastPoint } from './FishingSession';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../world/SceneResources';

export type { FishingCastPoint } from './FishingSession';

export const FISHING_PLAYER_SEAT = Object.freeze({
  x: 0,
  y: 1.38,
  z: -1.42,
});
export const FISHING_ROD_LEAN = -22 * Math.PI / 180;

const FISHING_CAMERA_ANGLE_ORIGIN = Object.freeze({ x: 0, y: 1.38, z: -1.42 });
const FISHING_CAMERA_LOOK_TARGET = Object.freeze({ x: 0, y: -0.42, z: -7.4 });
const FISHING_CAMERA_DURATION = 1.1;
const FISHING_CAST_DURATION = 0.8;
const FISHING_REEL_DURATION = 1;
const FISHING_MISS_DURATION = 0.8;
const FISHING_SPLASH_HOLD_DURATION = 0.12;
const FISHING_CAST_MIN_X = -2.7;
const FISHING_CAST_MAX_X = 2.7;
const FISHING_CAST_MIN_Z = -10.5;
const FISHING_CAST_MAX_Z = -4.8;
const CENTERED_FISHING_CAST: FishingCastPoint = Object.freeze({ x: 0, z: -6.4 });
const FISHING_TARGET_SIZE = 52;
const FISHING_BITE_PARTICLE_INTERVAL_SECONDS = 0.12;
const FISHING_BITE_PARTICLE_INTENSITY = 0.85;
const FISHING_CATCH_BOW_REST = Object.freeze({ x: 0, y: 0.43, z: -2.52 });

export interface FishingCameraControl {
  restoreBasePose(): void;
  interpolateToBasePose(
    startPosition: Readonly<Vector3>,
    startQuaternion: Readonly<Quaternion>,
    progress: number,
  ): void;
}

export interface FishingCatchPresentationLibrary {
  prepare(catchId: FishingCatchId): Promise<Object3D | null>;
  hide(): void;
  dispose(): void;
}

export interface FishingBiteParticlePresentation {
  readonly points: Object3D;
  emit(origin: Vector3, intensity: number): void;
  update(delta: number): void;
  reset(): void;
  dispose(): void;
}

export interface FishingPresentationDependencies {
  readonly camera: PerspectiveCamera;
  readonly cameraControl: FishingCameraControl;
  readonly resetBasePresentation: () => void;
  readonly sampleWaveInto: (
    output: WaveSample,
    time: number,
    x: number,
    z: number,
    amplitudeScale: number,
  ) => void;
  readonly waveAmplitudeScale: () => number;
  readonly rodPivot: Group;
  readonly rod: Object3D;
  readonly catches: FishingCatchPresentationLibrary;
  readonly biteParticles: FishingBiteParticlePresentation;
  readonly boatRoot: Object3D;
  readonly worldRoot: Object3D;
}

export type FishingPresentationHostDependencies = Omit<
  FishingPresentationDependencies,
  'catches' | 'biteParticles'
>;

export interface FishingPresentationResourceFactories {
  createCatches(): FishingCatchPresentationLibrary;
  createBiteParticles(): FishingBiteParticlePresentation;
}

const DEFAULT_FISHING_RESOURCE_FACTORIES: FishingPresentationResourceFactories = {
  createCatches: () => new FishingCatchLibrary(),
  createBiteParticles: () => new FishingBiteParticles(),
};

type FishingPresentationPhase =
  | 'idle'
  | 'entering'
  | 'ready'
  | 'casting'
  | 'waiting'
  | 'bite'
  | 'reeling'
  | 'landed'
  | 'missing'
  | 'returning';

type FishingAnimationKind = 'enter' | 'cast' | 'reel' | 'miss' | 'return';

interface ActiveFishingAnimation {
  readonly kind: FishingAnimationKind;
  elapsed: number;
  readonly duration: number;
  readonly resolve: () => void;
}

interface FishingVisuals {
  readonly line: Line<BufferGeometry, LineBasicMaterial>;
  readonly linePositions: Float32Array;
  readonly linePositionAttribute: BufferAttribute;
  readonly bobber: Group;
  readonly splash: Group;
  readonly catchDisplay: Group;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const easeOut = (value: number): number => 1 - (1 - value) ** 3;
const easeInOut = (value: number): number => value * value * (3 - 2 * value);
const smootherStep = (value: number): number =>
  value * value * value * (value * (value * 6 - 15) + 10);

function addOwnedFishingMesh(
  root: Group,
  geometry: BufferGeometry,
  material: Material,
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): Mesh {
  geometries.add(geometry);
  materials.add(material);
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function localTipOf(root: Object3D): Vector3 {
  root.updateWorldMatrix(true, true);
  const inverseRoot = new Matrix4().copy(root.matrixWorld).invert();
  const localMatrix = new Matrix4();
  const point = new Vector3();
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    if (positions === undefined) return;
    localMatrix.multiplyMatrices(inverseRoot, object.matrixWorld);
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(localMatrix);
      minimumZ = Math.min(minimumZ, point.z);
      maximumZ = Math.max(maximumZ, point.z);
    }
  });

  if (!Number.isFinite(minimumZ) || !Number.isFinite(maximumZ)) {
    throw new Error('Fishing rod model has no position data.');
  }

  const tipDepth = Math.max((maximumZ - minimumZ) * 0.00001, 1e-7);
  const tip = new Vector3();
  let tipVertexCount = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    if (positions === undefined) return;
    localMatrix.multiplyMatrices(inverseRoot, object.matrixWorld);
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(localMatrix);
      if (point.z < maximumZ - tipDepth) continue;
      tip.x += point.x;
      tip.y += point.y;
      tipVertexCount += 1;
    }
  });

  if (tipVertexCount === 0) throw new Error('Fishing rod model has no tip vertices.');
  tip.x /= tipVertexCount;
  tip.y /= tipVertexCount;
  tip.z = maximumZ;
  return tip;
}

function createFishingVisuals(
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): FishingVisuals {
  const linePositions = new Float32Array(15);
  const lineGeometry = new BufferGeometry();
  const linePositionAttribute = new BufferAttribute(linePositions, 3);
  lineGeometry.setAttribute('position', linePositionAttribute);
  const lineMaterial = new LineBasicMaterial({ color: 0x3d3429 });
  geometries.add(lineGeometry);
  materials.add(lineMaterial);
  const line = new Line(lineGeometry, lineMaterial);
  line.name = 'fishing-line';
  line.frustumCulled = false;
  line.visible = false;
  root.add(line);

  const bobber = new Group();
  bobber.name = 'fishing-bobber';
  const bobberGeometry = new SphereGeometry(0.105, 7, 5);
  const bobberMaterial = new MeshStandardMaterial({
    color: 0xd9573f,
    roughness: 0.76,
    flatShading: true,
  });
  const bobberMesh = addOwnedFishingMesh(
    bobber,
    bobberGeometry,
    bobberMaterial,
    geometries,
    materials,
  );
  bobberMesh.position.y = 0.075;
  bobber.visible = false;
  root.add(bobber);

  const splash = new Group();
  splash.name = 'fishing-splash';
  const splashGeometry = new SphereGeometry(0.035, 5, 3);
  const splashMaterial = new MeshStandardMaterial({
    color: 0xd9e6e1,
    roughness: 0.42,
    transparent: true,
    opacity: 0.72,
    flatShading: true,
  });
  for (let index = 0; index < 6; index += 1) {
    const droplet = addOwnedFishingMesh(
      splash,
      splashGeometry,
      splashMaterial,
      geometries,
      materials,
    );
    const angle = index * Math.PI * 2 / 6;
    droplet.position.set(
      Math.cos(angle) * 0.18,
      0.07 + (index % 2) * 0.08,
      Math.sin(angle) * 0.18,
    );
  }
  splash.visible = false;
  root.add(splash);

  const catchDisplay = new Group();
  catchDisplay.name = 'fishing-catch-display';
  catchDisplay.visible = false;
  root.add(catchDisplay);

  return {
    line,
    linePositions,
    linePositionAttribute,
    bobber,
    splash,
    catchDisplay,
  };
}

export class FishingPresentation {
  readonly root = new Group();
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly lineOrigin = new Object3D();
  private readonly catchRest = new Group();
  private readonly fishing: FishingVisuals;
  private readonly baseRodPivotRotationX: number;
  private readonly cameraPosition = new Vector3(
    FISHING_PLAYER_SEAT.x,
    FISHING_PLAYER_SEAT.y,
    FISHING_PLAYER_SEAT.z,
  );
  private readonly cameraAngleOrigin = new Vector3(
    FISHING_CAMERA_ANGLE_ORIGIN.x,
    FISHING_CAMERA_ANGLE_ORIGIN.y,
    FISHING_CAMERA_ANGLE_ORIGIN.z,
  );
  private readonly cameraLookTarget = new Vector3(
    FISHING_CAMERA_LOOK_TARGET.x,
    FISHING_CAMERA_LOOK_TARGET.y,
    FISHING_CAMERA_LOOK_TARGET.z,
  );
  private readonly cameraQuaternion = new Quaternion();
  private readonly cameraStartPosition = new Vector3();
  private readonly cameraStartQuaternion = new Quaternion();
  private readonly matrixScratch = new Matrix4();
  private readonly raycaster = new Raycaster();
  private readonly interactionPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly ndc = new Vector2();
  private readonly rayHit = new Vector3();
  private readonly lineOriginWorld = new Vector3();
  private readonly lineEndWorld = new Vector3();
  private readonly reelStartWorld = new Vector3();
  private readonly catchTargetWorld = new Vector3();
  private readonly catchApproachWorld = new Vector3();
  private readonly projectionWorld = new Vector3();
  private readonly projectionCamera = new Vector3();
  private readonly catchBounds = new Box3();
  private readonly waveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private readonly castPosition = new Vector3();
  private readonly projection: ProjectedBoatBounds = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    depth: 0,
    visible: false,
  };
  private readonly catchProjection: ProjectedBoatBounds = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    depth: 0,
    visible: false,
  };
  private activeAnimation: ActiveFishingAnimation | null = null;
  private phase: FishingPresentationPhase = 'idle';
  private activeCatch: Object3D | null = null;
  private hasCast = false;
  private castOriginY = 0;
  private waveHeight = 0;
  private splashHoldRemaining = 0;
  private biteParticleCooldown = 0;
  private biteParticlesActive = false;
  private currentTime = 0;
  private disposed = false;
  private animationDisposed = false;
  private catchesDisposed = false;
  private particlesDisposed = false;
  private detached = false;
  private visualResourcesDisposed = false;
  private cleanupComplete = false;

  static create(
    dependencies: FishingPresentationHostDependencies,
    factories: FishingPresentationResourceFactories = DEFAULT_FISHING_RESOURCE_FACTORIES,
  ): FishingPresentation {
    let catches: FishingCatchPresentationLibrary | null = null;
    let biteParticles: FishingBiteParticlePresentation | null = null;
    let ownershipTransferred = false;
    try {
      catches = factories.createCatches();
      biteParticles = factories.createBiteParticles();
      const completeDependencies: FishingPresentationDependencies = {
        ...dependencies,
        catches,
        biteParticles,
      };
      ownershipTransferred = true;
      return new FishingPresentation(completeDependencies);
    } catch (error) {
      if (!ownershipTransferred) {
        try {
          runCleanupSteps([
            () => catches?.dispose(),
            () => biteParticles?.dispose(),
          ]);
        } catch {
          // Preserve the construction error after every completed owner runs.
        }
      }
      throw error;
    }
  }

  constructor(private readonly dependencies: FishingPresentationDependencies) {
    this.root.name = 'fishing-presentation';
    this.lineOrigin.name = 'fishing-line-origin';
    this.catchRest.name = 'fishing-catch-bow-rest';
    this.catchRest.position.set(
      FISHING_CATCH_BOW_REST.x,
      FISHING_CATCH_BOW_REST.y,
      FISHING_CATCH_BOW_REST.z,
    );
    this.baseRodPivotRotationX = dependencies.rodPivot.rotation.x;
    try {
      this.fishing = createFishingVisuals(
        this.root,
        this.ownedGeometries,
        this.ownedMaterials,
      );
      this.lineOrigin.position.copy(localTipOf(dependencies.rod));
      dependencies.rod.add(this.lineOrigin);
      dependencies.boatRoot.add(this.catchRest);
      dependencies.worldRoot.add(this.root, dependencies.biteParticles.points);
      this.matrixScratch.lookAt(
        this.cameraAngleOrigin,
        this.cameraLookTarget,
        dependencies.camera.up,
      );
      this.cameraQuaternion.setFromRotationMatrix(this.matrixScratch);
    } catch (error) {
      try {
        runCleanupSteps([
          () => dependencies.catches.dispose(),
          () => dependencies.biteParticles.dispose(),
          () => this.lineOrigin.removeFromParent(),
          () => this.catchRest.removeFromParent(),
          () => this.root.removeFromParent(),
          () => dependencies.biteParticles.points.removeFromParent(),
          () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
        ]);
      } catch {
        // Preserve the construction error after every owned resource runs.
      }
      throw error;
    }
  }

  enterView(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.phase === 'ready') {
      this.dependencies.resetBasePresentation();
      this.applyPhasePresentation();
      return Promise.resolve();
    }
    this.cameraStartPosition.copy(this.dependencies.camera.position);
    this.cameraStartQuaternion.copy(this.dependencies.camera.quaternion);
    this.phase = 'entering';
    return this.startAnimation('enter', FISHING_CAMERA_DURATION);
  }

  castPointFromScreen(
    clientX: number,
    clientY: number,
    viewportWidth: number,
    viewportHeight: number,
  ): FishingCastPoint | null {
    if (
      this.disposed
      || !Number.isFinite(clientX)
      || !Number.isFinite(clientY)
      || !Number.isFinite(viewportWidth)
      || !Number.isFinite(viewportHeight)
      || viewportWidth <= 0
      || viewportHeight <= 0
      || clientX < 0
      || clientX > viewportWidth
      || clientY < 0
      || clientY > viewportHeight
    ) return null;

    this.dependencies.worldRoot.updateMatrixWorld(true);
    this.ndc.set(
      clientX / viewportWidth * 2 - 1,
      -(clientY / viewportHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.dependencies.camera);
    if (!this.raycaster.ray.intersectPlane(this.interactionPlane, this.rayHit)) return null;
    if (!this.isPointInBounds(this.rayHit.x, this.rayHit.z)) return null;
    return Object.freeze({ x: this.rayHit.x, z: this.rayHit.z });
  }

  centeredCast(): FishingCastPoint {
    return CENTERED_FISHING_CAST;
  }

  playCast(point: FishingCastPoint): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.setCastPoint(point);
    this.splashHoldRemaining = 0;
    this.lineOrigin.getWorldPosition(this.lineOriginWorld);
    this.castOriginY = this.lineOriginWorld.y;
    this.phase = 'casting';
    return this.startAnimation('cast', FISHING_CAST_DURATION);
  }

  showWaiting(point: FishingCastPoint): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.setCastPoint(point);
    this.phase = 'waiting';
    this.updateWave(this.currentTime);
    this.applyPhasePresentation();
  }

  showBite(point: FishingCastPoint): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.setCastPoint(point);
    this.phase = 'bite';
    this.updateWave(this.currentTime);
    this.applyPhasePresentation();
    this.updateBiteParticles(0);
  }

  projectBite(width: number, height: number): ProjectedBoatBounds {
    const result = this.projection;
    if (
      this.disposed
      || this.phase !== 'bite'
      || !this.hasCast
      || width <= 0
      || height <= 0
    ) {
      result.x = 0;
      result.y = 0;
      result.width = 0;
      result.height = 0;
      result.depth = 0;
      result.visible = false;
      return result;
    }

    const camera = this.dependencies.camera;
    camera.updateWorldMatrix(true, false);
    this.projectionWorld.set(
      this.castPosition.x,
      this.waveHeight,
      this.castPosition.z,
    );
    this.projectionCamera.copy(this.projectionWorld).applyMatrix4(camera.matrixWorldInverse);
    this.projectionWorld.project(camera);
    result.x = (this.projectionWorld.x * 0.5 + 0.5) * width;
    result.y = (-this.projectionWorld.y * 0.5 + 0.5) * height;
    result.width = Math.min(FISHING_TARGET_SIZE, width);
    result.height = Math.min(FISHING_TARGET_SIZE, height);
    result.depth = -this.projectionCamera.z;
    result.visible = this.projectionCamera.z < 0
      && Math.abs(this.projectionWorld.x) <= 1
      && Math.abs(this.projectionWorld.y) <= 1;
    return result;
  }

  async playReel(catchId: FishingCatchId): Promise<void> {
    if (this.disposed) return;
    if (!this.hasCast) this.setCastPoint(CENTERED_FISHING_CAST);
    const fishingCatch = await this.dependencies.catches.prepare(catchId);
    if (!fishingCatch || this.disposed) return;
    this.activeCatch = fishingCatch;
    this.activeCatch.position.set(0, 0, 0);
    this.activeCatch.rotation.set(0, 0.08, -0.04);
    this.activeCatch.updateMatrixWorld(true);
    this.catchBounds.setFromObject(this.activeCatch, true);
    this.activeCatch.position.y = -this.catchBounds.min.y;
    this.fishing.catchDisplay.add(this.activeCatch);
    this.reelStartWorld.set(
      this.castPosition.x,
      this.waveHeight,
      this.castPosition.z,
    );
    this.fishing.catchDisplay.position.copy(this.reelStartWorld);
    this.phase = 'reeling';
    await this.startAnimation('reel', FISHING_REEL_DURATION);
  }

  projectCatch(width: number, height: number): ProjectedBoatBounds | null {
    if (
      this.disposed
      || this.phase !== 'landed'
      || this.activeCatch === null
      || width <= 0
      || height <= 0
    ) return null;
    this.dependencies.worldRoot.updateMatrixWorld(true);
    return projectBoatObjectBoundsInto(
      this.catchProjection,
      this.fishing.catchDisplay,
      this.dependencies.camera,
      width,
      height,
    );
  }

  playMiss(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.hasCast) this.setCastPoint(CENTERED_FISHING_CAST);
    this.phase = 'missing';
    return this.startAnimation('miss', FISHING_MISS_DURATION);
  }

  exitView(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.cameraStartPosition.copy(this.dependencies.camera.position);
    this.cameraStartQuaternion.copy(this.dependencies.camera.quaternion);
    this.resetVisuals();
    this.phase = 'returning';
    return this.startAnimation('return', FISHING_CAMERA_DURATION);
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    const keepBowView = this.phase !== 'idle' && this.phase !== 'returning';
    this.resetVisuals();
    this.phase = keepBowView ? 'ready' : 'idle';
    this.dependencies.resetBasePresentation();
    this.applyPhasePresentation();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    const animation = this.activeAnimation;
    if (animation === null) return;
    this.activeAnimation = null;
    this.applyAnimation(animation.kind, 1);
    this.finishAnimation(animation.kind);
    this.applyPhasePresentation();
    animation.resolve();
  }

  advance(time: number, delta: number): void {
    if (this.disposed) return;
    this.currentTime = time;
    if (delta > 0) this.advanceAnimation(delta);
  }

  updateParticles(delta: number): void {
    if (this.disposed || delta <= 0) return;
    this.updateBiteParticles(delta);
  }

  updateSurface(time: number, amplitudeScale = this.dependencies.waveAmplitudeScale()): void {
    if (this.disposed) return;
    this.currentTime = time;
    this.updateWave(time, amplitudeScale);
    this.updateEffects();
  }

  updateLineGeometry(): void {
    if (this.disposed) return;
    this.updateLine();
  }

  update(
    time: number,
    delta: number,
    amplitudeScale = this.dependencies.waveAmplitudeScale(),
  ): void {
    this.advance(time, delta);
    if (delta > 0) {
      this.updateParticles(delta);
    }
    this.updateSurface(time, amplitudeScale);
    this.updateLineGeometry();
  }

  phaseForTest(): FishingPresentationPhase {
    return this.phase;
  }

  disposeAnimation(): void {
    if (this.animationDisposed) return;
    this.animationDisposed = true;
    this.disposed = true;
    this.cancelActiveAnimation();
  }

  disposeCatches(): void {
    if (this.catchesDisposed) return;
    this.catchesDisposed = true;
    this.disposed = true;
    this.dependencies.catches.dispose();
  }

  disposeParticles(): void {
    if (this.particlesDisposed) return;
    this.particlesDisposed = true;
    this.disposed = true;
    this.dependencies.biteParticles.dispose();
  }

  detach(): void {
    if (this.detached) return;
    this.detached = true;
    this.disposed = true;
    runCleanupSteps([
      () => this.lineOrigin.removeFromParent(),
      () => this.catchRest.removeFromParent(),
      () => this.root.removeFromParent(),
      () => this.dependencies.biteParticles.points.removeFromParent(),
    ]);
  }

  disposeVisualResources(): void {
    if (this.visualResourcesDisposed) return;
    this.visualResourcesDisposed = true;
    this.disposed = true;
    disposeResourceSets(this.ownedGeometries, this.ownedMaterials);
  }

  dispose(): void {
    if (this.cleanupComplete) return;
    try {
      runCleanupSteps([
        () => this.disposeAnimation(),
        () => this.disposeCatches(),
        () => this.disposeParticles(),
        () => this.detach(),
        () => this.disposeVisualResources(),
      ]);
    } finally {
      this.cleanupComplete = true;
    }
  }

  private startAnimation(
    kind: FishingAnimationKind,
    duration: number,
  ): Promise<void> {
    this.cancelActiveAnimation();
    return new Promise<void>((resolve) => {
      this.activeAnimation = { kind, duration, elapsed: 0, resolve };
      this.applyPhasePresentation();
      this.applyAnimation(kind, 0);
    });
  }

  private advanceAnimation(delta: number): void {
    this.splashHoldRemaining = Math.max(0, this.splashHoldRemaining - delta);
    this.applyPhasePresentation();
    const animation = this.activeAnimation;
    if (!animation) return;
    animation.elapsed = Math.min(animation.duration, animation.elapsed + delta);
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    this.applyAnimation(animation.kind, progress);
    if (progress < 1) return;
    this.activeAnimation = null;
    this.finishAnimation(animation.kind);
    this.applyPhasePresentation();
    animation.resolve();
  }

  private applyPhasePresentation(): void {
    this.fishing.line.visible = false;
    this.fishing.bobber.visible = false;
    this.fishing.splash.visible = false;
    this.fishing.catchDisplay.visible = false;
    if (this.phase !== 'bite') this.clearBiteParticles();
    if (this.phase === 'idle') return;

    this.dependencies.rodPivot.rotation.x = this.baseRodPivotRotationX;
    if (this.phase === 'entering' || this.phase === 'returning') return;
    this.dependencies.camera.position.copy(this.cameraPosition);
    this.dependencies.camera.quaternion.copy(this.cameraQuaternion);
    if (this.phase === 'ready') return;

    if (this.phase === 'landed') {
      this.fishing.catchDisplay.visible = this.activeCatch !== null;
      return;
    }
    this.fishing.line.visible = true;
    this.fishing.bobber.visible = this.phase !== 'reeling';
    if (this.phase === 'waiting' && this.splashHoldRemaining > 0) {
      this.fishing.splash.visible = true;
    }
    if (this.phase === 'reeling') {
      this.fishing.catchDisplay.visible = this.activeCatch !== null;
    }
  }

  private applyAnimation(kind: FishingAnimationKind, progress: number): void {
    const normalized = clamp(progress, 0, 1);
    switch (kind) {
      case 'enter':
        if (normalized === 1) {
          this.dependencies.camera.position.copy(this.cameraPosition);
          this.dependencies.camera.quaternion.copy(this.cameraQuaternion);
        } else {
          this.dependencies.camera.position.lerpVectors(
            this.cameraStartPosition,
            this.cameraPosition,
            smootherStep(normalized),
          );
          this.dependencies.camera.quaternion.copy(this.cameraStartQuaternion)
            .slerp(this.cameraQuaternion, smootherStep(normalized));
        }
        break;
      case 'return':
        if (normalized === 1) {
          this.dependencies.cameraControl.restoreBasePose();
        } else {
          this.dependencies.cameraControl.interpolateToBasePose(
            this.cameraStartPosition,
            this.cameraStartQuaternion,
            smootherStep(normalized),
          );
        }
        break;
      case 'cast': {
        const drawBack = normalized < 0.28
          ? easeInOut(normalized / 0.28) * 0.42
          : (1 - easeOut((normalized - 0.28) / 0.72)) * 0.42
            - Math.sin(Math.PI * (normalized - 0.28) / 0.72) * 0.5;
        this.dependencies.rodPivot.rotation.x = this.baseRodPivotRotationX + drawBack;
        this.fishing.splash.visible = normalized >= 0.9 && normalized < 1;
        break;
      }
      case 'reel': {
        const swing = 0.34;
        this.dependencies.rodPivot.rotation.x = this.baseRodPivotRotationX
          - Math.sin(Math.PI * normalized) * swing;
        if (this.activeCatch) {
          this.catchRest.getWorldPosition(this.catchTargetWorld);
          this.catchApproachWorld.copy(this.catchTargetWorld);
          this.catchApproachWorld.y += 0.72;
          if (normalized < 0.72) {
            const haul = easeOut(normalized / 0.72);
            this.fishing.catchDisplay.position.lerpVectors(
              this.reelStartWorld,
              this.catchApproachWorld,
              haul,
            );
            this.fishing.catchDisplay.position.y += Math.sin(Math.PI * haul) * 0.58;
          } else {
            const drop = easeInOut((normalized - 0.72) / 0.28);
            this.fishing.catchDisplay.position.lerpVectors(
              this.catchApproachWorld,
              this.catchTargetWorld,
              drop,
            );
            this.fishing.catchDisplay.position.y -= Math.sin(Math.PI * drop) * 0.045;
          }
          this.fishing.catchDisplay.rotation.z =
            Math.sin(normalized * Math.PI * 2) * 0.16 * (1 - normalized);
        }
        break;
      }
      case 'miss':
        this.dependencies.rodPivot.rotation.x = this.baseRodPivotRotationX
          + Math.sin(Math.PI * normalized) * 0.18;
        break;
    }
  }

  private finishAnimation(kind: FishingAnimationKind): void {
    switch (kind) {
      case 'enter':
        this.phase = 'ready';
        break;
      case 'cast':
        this.phase = 'waiting';
        this.splashHoldRemaining = FISHING_SPLASH_HOLD_DURATION;
        break;
      case 'reel':
        this.catchRest.add(this.fishing.catchDisplay);
        this.fishing.catchDisplay.position.set(0, 0, 0);
        this.fishing.catchDisplay.rotation.set(0, 0, 0);
        this.phase = 'landed';
        break;
      case 'miss':
        break;
      case 'return':
        this.resetVisuals();
        this.phase = 'idle';
        break;
    }
  }

  private resetVisuals(): void {
    this.fishing.line.visible = false;
    this.fishing.bobber.visible = false;
    this.fishing.splash.visible = false;
    this.fishing.catchDisplay.visible = false;
    this.root.add(this.fishing.catchDisplay);
    this.fishing.catchDisplay.position.set(0, 0, 0);
    this.fishing.catchDisplay.rotation.set(0, 0, 0);
    this.clearBiteParticles();
    this.dependencies.catches.hide();
    this.activeCatch = null;
    this.hasCast = false;
    this.splashHoldRemaining = 0;
    this.dependencies.rodPivot.rotation.x = this.baseRodPivotRotationX;
  }

  private setCastPoint(point: FishingCastPoint): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      throw new RangeError('Fishing cast point must be finite.');
    }
    if (!this.isPointInBounds(point.x, point.z)) {
      throw new RangeError('Fishing cast point is outside the authored water region.');
    }
    this.castPosition.set(point.x, 0, point.z);
    this.hasCast = true;
    this.updateWave(this.currentTime);
  }

  private isPointInBounds(x: number, z: number): boolean {
    return x >= FISHING_CAST_MIN_X
      && x <= FISHING_CAST_MAX_X
      && z >= FISHING_CAST_MIN_Z
      && z <= FISHING_CAST_MAX_Z;
  }

  private updateWave(
    time: number,
    amplitudeScale = this.dependencies.waveAmplitudeScale(),
  ): void {
    if (!this.hasCast) return;
    this.dependencies.sampleWaveInto(
      this.waveSample,
      time,
      this.castPosition.x,
      this.castPosition.z,
      amplitudeScale,
    );
    this.waveHeight = this.waveSample.height;
    if (this.phase === 'casting') {
      this.fishing.splash.position.set(
        this.castPosition.x,
        this.waveHeight,
        this.castPosition.z,
      );
    } else {
      this.fishing.bobber.position.set(
        this.castPosition.x,
        this.waveHeight,
        this.castPosition.z,
      );
      this.fishing.splash.position.copy(this.fishing.bobber.position);
    }
    if (this.phase !== 'reeling' && this.phase !== 'landed') {
      this.fishing.catchDisplay.position.copy(this.fishing.bobber.position);
    }
  }

  private updateEffects(): void {
    if (this.fishing.splash.visible && this.activeAnimation?.kind === 'cast') {
      const progress = this.activeAnimation.elapsed / this.activeAnimation.duration;
      for (let index = 0; index < this.fishing.splash.children.length; index += 1) {
        this.fishing.splash.children[index]!.position.y = 0.05
          + Math.sin(Math.PI * progress) * (0.14 + (index % 2) * 0.1);
      }
    }
  }

  private updateBiteParticles(delta: number): void {
    if (this.phase !== 'bite') {
      this.clearBiteParticles();
      return;
    }
    this.biteParticlesActive = true;
    this.dependencies.biteParticles.update(delta);
    const dt = Math.min(0.1, Math.max(0, delta));
    this.biteParticleCooldown = Math.max(0, this.biteParticleCooldown - dt);
    if (this.biteParticleCooldown > 0) return;
    this.dependencies.biteParticles.emit(
      this.fishing.bobber.position,
      FISHING_BITE_PARTICLE_INTENSITY,
    );
    this.biteParticleCooldown = FISHING_BITE_PARTICLE_INTERVAL_SECONDS;
  }

  private clearBiteParticles(): void {
    if (!this.biteParticlesActive) return;
    this.dependencies.biteParticles.reset();
    this.biteParticlesActive = false;
    this.biteParticleCooldown = 0;
  }

  private updateLine(): void {
    if (!this.hasCast || !this.fishing.line.visible) return;
    this.lineOrigin.getWorldPosition(this.lineOriginWorld);
    this.lineEndWorld.set(
      this.castPosition.x,
      this.waveHeight + 0.075,
      this.castPosition.z,
    );

    const animation = this.activeAnimation;
    if (animation?.kind === 'cast') {
      const progress = easeInOut(animation.elapsed / animation.duration);
      this.lineEndWorld.x = this.lineOriginWorld.x
        + (this.castPosition.x - this.lineOriginWorld.x) * progress;
      this.lineEndWorld.z = this.lineOriginWorld.z
        + (this.castPosition.z - this.lineOriginWorld.z) * progress;
      this.lineEndWorld.y = this.castOriginY
        + (this.waveHeight + 0.075 - this.castOriginY) * progress
        + Math.sin(Math.PI * progress) * 1.35;
      this.fishing.bobber.position.copy(this.lineEndWorld);
    } else if (this.phase === 'reeling' && this.activeCatch) {
      this.lineEndWorld.copy(this.fishing.catchDisplay.position);
    }

    const slack = this.phase === 'missing'
      ? 0.42
      : this.phase === 'waiting' || this.phase === 'bite'
        ? 0.1
        : 0.025;
    const positions = this.fishing.linePositions;
    for (let index = 0; index < 5; index += 1) {
      const progress = index / 4;
      const offset = index * 3;
      positions[offset] = this.lineOriginWorld.x
        + (this.lineEndWorld.x - this.lineOriginWorld.x) * progress;
      positions[offset + 1] = this.lineOriginWorld.y
        + (this.lineEndWorld.y - this.lineOriginWorld.y) * progress
        - Math.sin(Math.PI * progress) * slack;
      positions[offset + 2] = this.lineOriginWorld.z
        + (this.lineEndWorld.z - this.lineOriginWorld.z) * progress;
    }
    this.fishing.linePositionAttribute.needsUpdate = true;
  }

  private cancelActiveAnimation(): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    animation?.resolve();
  }
}
