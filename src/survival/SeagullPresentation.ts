import {
  Box3, BufferGeometry, ConeGeometry, CubicBezierCurve3, DoubleSide,
  Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PerspectiveCamera, Quaternion, SphereGeometry, Vector3, type Material,
} from 'three';
import type { BoatSupplyDisplay, BorrowedSupplyActor, MutableSupplyPose } from './BoatSupplyDisplay';
import type { FeaturedEventPresentation } from './FeaturedEventPresentation';
import type { EventPresentationCue } from './eventPresentationCue';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';

export const SEAGULL_WATCH_SECONDS = 3;
export const SEAGULL_DIVE_SECONDS = 0.7;
export const SEAGULL_ESCAPE_SECONDS = 0.8;
const FLIGHT_SECONDS = SEAGULL_DIVE_SECONDS + SEAGULL_ESCAPE_SECONDS;
const FORWARD = new Vector3(0, 0, 1);
const FLOCK_DISTANCE = 80;
const REST_POSE = Object.freeze({
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
});

type FoodDisplay = Pick<BoatSupplyDisplay, 'borrowFoodCan'>;

function wingGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    0, 0, 0, 0.28, 0.025, -0.04, 0.25, 0, -0.23,
    0, 0, 0, 0.25, 0, -0.23, 0, 0, -0.15,
    0.28, 0.025, -0.04, 0.65, 0, -0.25, 0.25, 0, -0.23,
  ], 3));
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(6, 3, 1);
  geometry.computeVertexNormals();
  return geometry;
}

function createGull(): { root: Group; wings: readonly Group[] } {
  const root = new Group();
  root.name = 'seagull-thief';
  const pale = new MeshStandardMaterial({ color: 0xd9d8cd, roughness: 0.92, flatShading: true, side: DoubleSide });
  const dark = new MeshStandardMaterial({ color: 0x303437, roughness: 0.94, side: DoubleSide });
  const bill = new MeshStandardMaterial({ color: 0x9e8551, roughness: 0.85 });
  const bodyGeometry = new SphereGeometry(1, 10, 7);
  const body = new Mesh(bodyGeometry, pale);
  body.scale.set(0.1, 0.115, 0.23);
  body.position.set(0, 0.07, -0.29);
  const head = new Mesh(bodyGeometry, pale);
  head.scale.set(0.075, 0.085, 0.085);
  head.position.set(0, 0.09, -0.095);
  const beak = new Mesh(new ConeGeometry(0.031, 0.13, 5), bill);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0, -0.065);
  const tail = new Mesh(wingGeometry(), pale);
  tail.scale.set(0.3, 1, 0.7);
  tail.rotation.y = Math.PI / 2;
  tail.position.set(-0.05, 0.09, -0.42);
  const geometry = wingGeometry();
  const wings = [-1, 1].map((side) => {
    const pivot = new Group();
    const wing = new Mesh(geometry, [pale, dark]);
    wing.scale.x = side;
    pivot.position.set(side * 0.06, 0.12, -0.21);
    pivot.add(wing);
    root.add(pivot);
    return pivot;
  });
  for (const side of [-1, 1]) {
    const eye = new Mesh(bodyGeometry, dark);
    eye.scale.setScalar(0.009);
    eye.position.set(side * 0.067, 0.115, -0.07);
    root.add(eye);
  }
  root.add(body, head, beak, tail);
  return { root, wings };
}

/** Owns bird geometry. The food display owns the borrowed can and its materials. */
export class SeagullPresentation implements FeaturedEventPresentation {
  readonly root = new Group();
  private readonly gull = createGull();
  private readonly flock = new Group();
  private readonly stageViewQuaternion = new Quaternion();
  private readonly birds: readonly { root: Group; wings: readonly Group[] }[];
  private readonly dive = new CubicBezierCurve3();
  private readonly escape = new CubicBezierCurve3();
  private readonly target = new Vector3();
  private readonly tangent = new Vector3();
  private readonly scratch = new Vector3();
  private readonly bounds = new Box3();
  private readonly canGripOffset = new Vector3();
  private readonly pose: MutableSupplyPose = {
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
  };
  private actor: BorrowedSupplyActor | null = null;
  private direction = 1;
  private halfWidth = 1;
  private elapsed = 0;
  private flockTime = 0;
  private flockStarted = false;
  private grabbed = false;
  private running = false;
  private disposed = false;
  private done: (() => void) | null = null;
  private pending: Promise<void> | null = null;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly food: FoodDisplay,
    private readonly emitCue: (cue: EventPresentationCue) => void,
  ) {
    this.root.name = 'seagull-theft';
    const geometry = wingGeometry();
    const bodyGeometry = new SphereGeometry(1, 7, 5);
    const material = new MeshBasicMaterial({ color: 0x0e1317, side: DoubleSide, fog: false });
    this.birds = Array.from({ length: 21 }, (_, index) => {
      const bird = new Group();
      bird.name = `distant-seagull-${index}`;
      const wings = [-1, 1].map((side) => {
        const pivot = new Group();
        pivot.name = side < 0 ? 'left-wing' : 'right-wing';
        const wing = new Mesh(geometry, material);
        wing.scale.x = side;
        pivot.position.set(side * 0.045, 0.03, 0);
        pivot.add(wing);
        bird.add(pivot);
        return pivot;
      });
      const body = new Mesh(bodyGeometry, material);
      body.scale.set(0.065, 0.075, 0.3);
      body.position.z = -0.06;
      bird.add(body);
      bird.scale.setScalar(1.8 + (index % 4) * 0.12);
      this.flock.add(bird);
      return { root: bird, wings };
    });
    this.root.add(this.flock, this.gull.root);
    this.clear();
  }

  stage(variantSeed = 0): void {
    this.clear();
    if (this.disposed) return;
    this.direction = (variantSeed & 1) === 0 ? 1 : -1;
    this.root.visible = true;
    this.camera.updateWorldMatrix(true, false);
    this.camera.getWorldPosition(this.flock.position);
    this.camera.getWorldQuaternion(this.stageViewQuaternion);
    // Keep the flight plane level with the sea, independent of the boat's tilt.
    this.camera.getWorldDirection(this.scratch);
    this.flock.rotation.set(0, Math.atan2(-this.scratch.x, -this.scratch.z), 0);
    const halfHeight = Math.tan(this.camera.fov * Math.PI / 360) * FLOCK_DISTANCE;
    this.halfWidth = halfHeight * this.camera.aspect;
    this.birds.forEach(({ root: bird, wings }, index) => {
      const rank = Math.ceil(index / 2);
      const side = index % 2 === 0 ? -1 : 1;
      bird.visible = true;
      // Fly across the view, with a slight turn and bank to expose the wing strokes.
      bird.rotation.set(0, this.direction * 1.3, this.direction * 0.15);
      for (let wing = 0; wing < wings.length; wing += 1) {
        wings[wing]!.rotation.z = (wing === 0 ? -1 : 1) * Math.sin(index * 1.8) * 0.75;
      }
      bird.position.set(
        -this.direction * (1.06 + rank * 0.032) * this.halfWidth,
        (0.42 + side * rank * 0.014 + Math.sin(index * 2.3) * 0.003) * halfHeight,
        -FLOCK_DISTANCE,
      );
    });
    this.actor = this.food.borrowFoodCan();
    if (this.actor === null) throw new Error('Seagull theft requires a visible food can.');
    this.updateFoodTarget();
    // The beak is the path origin, so the can meets it without a position jump.
    this.screenPoint(-this.direction * 0.95, 1.35, 4.5, this.dive.v0);
    this.dive.v1.copy(this.dive.v0).lerp(this.target, 0.5);
    this.dive.v2.copy(this.target).addScaledVector(this.cameraRight(), -this.direction * 0.7);
    this.dive.v2.y += 0.12;
    this.dive.v3.copy(this.target);
    this.escape.v0.copy(this.target);
    this.escape.v1.copy(this.target).addScaledVector(this.cameraRight(), this.direction * 0.8);
    this.escape.v1.y += 0.15;
    this.screenPoint(this.direction * 0.95, 1.4, 5.5, this.escape.v3);
    this.escape.v2.copy(this.escape.v3).lerp(this.target, 0.35);
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.root.visible) return Promise.resolve();
    if (this.pending !== null) return this.pending;
    this.flockStarted = true;
    this.running = true;
    this.pending = new Promise((resolve) => { this.done = resolve; });
    return this.pending;
  }

  react(): Promise<void> { return Promise.resolve(); }
  interactionRoot(): null { return null; }
  itemAimTarget(): null { return null; }
  resultRoot(): null { return null; }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.root.visible) return;
    if (this.flockStarted) this.updateFlock(delta);
    if (!this.running) return;
    this.elapsed += delta;
    const flight = this.elapsed - SEAGULL_WATCH_SECONDS;
    if (flight < 0) return;
    this.updateFlight(flight);
  }

  private updateFlock(delta: number): void {
    this.flockTime += delta;
    for (let index = 0; index < this.birds.length; index += 1) {
      const { root: bird, wings } = this.birds[index]!;
      if (!bird.visible) continue;
      bird.position.x += this.direction * delta * this.halfWidth * 0.18;
      // Keep the formation together and retire each bird after its wings leave the view.
      const edge = this.halfWidth + bird.scale.x * 0.8;
      if (this.direction * bird.position.x > edge) {
        bird.visible = false;
        continue;
      }
      const flap = Math.sin(this.flockTime * 9 + index * 1.8) * 0.75;
      wings[0]!.rotation.z = -flap;
      wings[1]!.rotation.z = flap;
    }
  }

  private updateFlight(flight: number): void {
    this.gull.root.visible = true;
    if (!this.grabbed) {
      this.updateFoodTarget();
      this.dive.v3.copy(this.target);
      this.escape.v0.copy(this.target);
      this.dive.v2.copy(this.target).addScaledVector(this.cameraRight(), -this.direction * 0.7);
      this.dive.v2.y += 0.12;
      this.escape.v1.copy(this.target).addScaledVector(this.cameraRight(), this.direction * 0.8);
      this.escape.v1.y += 0.15;
    }
    if (flight >= SEAGULL_DIVE_SECONDS && !this.grabbed) {
      this.grabbed = true;
      this.emitCue({ eventId: 'seagull-theft', cue: 'grab' });
    }
    const escaping = flight >= SEAGULL_DIVE_SECONDS;
    const curve = escaping ? this.escape : this.dive;
    const progress = Math.min(1, escaping
      ? (flight - SEAGULL_DIVE_SECONDS) / SEAGULL_ESCAPE_SECONDS
      : flight / SEAGULL_DIVE_SECONDS);
    curve.getPoint(progress, this.gull.root.position);
    // Curve.getTangent allocates two vectors even when given an output target.
    curve.getPoint(Math.max(0, progress - 0.0001), this.scratch);
    curve.getPoint(Math.min(1, progress + 0.0001), this.tangent);
    this.tangent.sub(this.scratch).normalize();
    this.gull.root.quaternion.setFromUnitVectors(FORWARD, this.tangent);
    for (let index = 0; index < this.gull.wings.length; index += 1) {
      this.gull.wings[index]!.rotation.z = (index === 0 ? -1 : 1)
        * Math.sin(flight * (escaping ? 21 : 13)) * 0.48;
    }
    if (escaping) this.carryCan();
    if (flight >= FLIGHT_SECONDS) this.finishFlight();
  }

  private updateFoodTarget(): void {
    if (this.actor === null) return;
    this.actor.root.updateWorldMatrix(true, true);
    // Prepared supply actors also contain hidden copies. Only measure the held can.
    this.bounds.setFromObject(this.actor.root.children[0]!).getCenter(this.target);
    this.target.y = this.bounds.max.y;
  }

  private carryCan(): void {
    if (this.actor === null) return;
    this.actor.applyPose(REST_POSE);
    this.updateFoodTarget();
    this.canGripOffset.copy(this.target);
    this.actor.root.parent!.worldToLocal(this.canGripOffset);
    this.scratch.copy(this.gull.root.position);
    this.actor.root.parent!.worldToLocal(this.scratch);
    this.scratch.sub(this.canGripOffset);
    this.pose.x = this.scratch.x;
    this.pose.y = this.scratch.y;
    this.pose.z = this.scratch.z;
    this.actor.applyPose(this.pose);
  }

  // Pause the flight when hidden. Never steal food by settling an unseen animation.
  settleForVisibilityChange(): void {}

  clear(): void {
    this.finishFlight();
    this.root.visible = false;
    this.elapsed = 0;
    this.flockTime = 0;
    this.flockStarted = false;
    this.grabbed = false;
    this.pending = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    collectMeshResources(this.root, geometries, materials);
    disposeResourceSets(geometries, materials);
    this.root.removeFromParent();
  }

  private finishFlight(): void {
    this.running = false;
    this.gull.root.visible = false;
    this.actor?.release();
    this.actor = null;
    this.done?.();
    this.done = null;
  }

  private cameraRight(): Vector3 {
    return this.scratch.set(1, 0, 0).applyQuaternion(this.stageViewQuaternion);
  }

  private screenPoint(x: number, y: number, distance: number, output: Vector3): void {
    const halfHeight = Math.tan(this.camera.fov * Math.PI / 360) * distance;
    output.set(x * halfHeight * this.camera.aspect, y * halfHeight, -distance);
    this.camera.localToWorld(output);
  }
}
