import { Group, Quaternion, Vector3 } from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import type { WaveSample } from '../../ocean/WaveField';
import type { EventNetCatch } from '../EventItemUseController';
import type {
  DedicatedEventEnvironment, DedicatedEventPresentation, EventOutcomePresentation, EventSceneContext,
} from '../eventPresentationTypes';
import { eventItemUseDurationForItem } from '../eventItemUseChoreography';
import { eventItemMotionProfile } from '../eventItemMotionProfile';
import { smoothstepRange } from '../animationMath';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import { StationaryEventCamera } from '../StationaryEventCamera';
import { BloodOceanBodies } from './bloodOceanBodies';

export const BLOOD_OCEAN_REVEAL_SECONDS = 9;
const PLACEMENTS = [
  [3.1, -3.2, 0.55],
  [-5.5, -8, -0.9], [-8, -14, 0.35], [-13, -19, 1.1],
  [-10, -26, -0.4], [-19, -32, 0.7],
  [7, -10, -0.5], [11, -16, 1.25], [9, -23, -0.75],
  [18, -28, 0.2], [16, -37, -1.1], [-1, -31, 0.3],
] as const;
const FACE_FORWARD = new Vector3(0, 0, 1);

export class OceanOfBloodPresentation implements DedicatedEventPresentation {
  readonly eventId = 'ocean-of-blood' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();
  private readonly models = new BloodOceanBodies();
  private readonly cameraLook: StationaryEventCamera | null;
  private readonly bodies = PLACEMENTS.map(([x, z, yaw], index) => ({
    ...this.models.create(index), x, z, yaw,
    restHead: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), index % 2 ? -1.15 : 1.05),
  }));
  private readonly tin = this.models.createTin();
  private readonly wave: WaveSample = {
    height: 0, displacementX: 0, displacementZ: 0, normal: { x: 0, y: 1, z: 0 },
  };
  private readonly cameraPosition = new Vector3();
  private readonly headPosition = new Vector3();
  private readonly direction = new Vector3();
  private readonly inverseFigure = new Quaternion();
  private readonly headTarget = new Quaternion();
  private readonly catch: EventNetCatch = {
    capture: (net) => {
      if (!this.staged || this.caught) return;
      this.caught = true;
      net.attach(this.tin);
      this.tin.position.set(...eventItemMotionProfile('fishingNet').actionOrigin);
      this.tin.rotation.set(0.2, 0, 0.3);
    },
    release: () => {
      if (!this.caught) return;
      this.worldRoot.add(this.tin);
      this.tin.visible = false;
    },
  };
  private readonly animation = new TimedPresentationAnimation<'reveal' | 'search' | 'reaction'>(
    (kind, _time, progress) => {
      if (kind === 'reveal') this.revealProgress = progress;
      if (kind === 'search') this.searchProgress = smoothstepRange(0.58, 1, progress);
      if (kind === 'reaction') this.reactionProgress = progress;
      this.applyAtmosphere();
    },
    (kind) => {
      if (kind === 'reveal') {
        this.revealing = false;
        this.cameraLook?.restore();
      }
    },
  );
  private revealProgress = 0;
  private searchProgress = 0;
  private reactionProgress = 0;
  private waited = false;
  private revealing = false;
  private caught = false;
  private staged = false;
  private disposed = false;
  private time = 0;
  private driftPhase = 0;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.cameraLook = environment.camera ? new StationaryEventCamera(environment.camera) : null;
    this.worldRoot.name = 'ocean-of-blood-world';
    this.boatRoot.name = 'ocean-of-blood-boat';
    for (const body of this.bodies) this.worldRoot.add(body.root);
    this.worldRoot.add(this.itemAimTarget);
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    this.clear();
    this.staged = true;
    this.driftPhase = (context.variantSeed % 1024) / 1024 * Math.PI * 2;
    this.bodies[0]!.figure.add(this.tin);
    this.tin.position.set(-0.15, -0.2, 0.23);
    this.tin.rotation.set(0.4, 0, 0.2);
    this.tin.visible = true;
    this.update(this.time, 0);
  }

  reveal(): Promise<void> {
    if (!this.staged || this.disposed) return Promise.resolve();
    this.cameraLook?.capture();
    this.revealing = true;
    return this.animation.start('reveal', BLOOD_OCEAN_REVEAL_SECONDS);
  }

  netCatch(): EventNetCatch | null {
    return this.staged ? this.catch : null;
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (!this.staged || this.disposed || choiceId !== 'fishingNet') return Promise.resolve(false);
    return this.animation.start('search', eventItemUseDurationForItem('net-scoop', 'fishingNet'), {
      complete: true, cancel: false,
    });
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (!this.staged || this.disposed) return Promise.resolve();
    this.waited = result.outcome.eventResult?.choiceId === 'sleep';
    return this.animation.start('reaction', 4.5);
  }

  update(time: number, delta: number): void {
    if (!this.staged || this.disposed) return;
    this.time = time;
    this.animation.update(time, delta);
    const arrival = smoothstepRange(0.22, 0.68, this.revealProgress);
    const turn = smoothstepRange(0.66, 1, this.revealProgress);
    const sinking = smoothstepRange(0.5, 1, this.reactionProgress);
    const gather = this.waited ? smoothstepRange(0, 0.55, this.reactionProgress) : 0;
    this.worldRoot.visible = this.revealProgress > 0.2 && this.reactionProgress < 1;
    if (this.environment.camera) this.environment.camera.getWorldPosition(this.cameraPosition);
    else this.cameraPosition.set(0, 1.8, 0);
    const amplitude = this.environment.readWorldWaveAmplitudeScale();
    for (let index = 0; index < this.bodies.length; index += 1) {
      const body = this.bodies[index]!;
      const drift = Math.sin(time * 0.13 + this.driftPhase + index * 1.9) * 0.13;
      const x = body.x * (1 + (1 - arrival) * 0.55) * (1 - gather * 0.15) + drift;
      const z = body.z - (1 - arrival) * (index === 0 ? 2.5 : 5) + gather * Math.min(2, Math.abs(body.z) * 0.1);
      this.environment.sampleWorldWaveInto(this.wave, time, x, z, amplitude);
      body.root.position.set(x, this.wave.height - 0.055 - (1 - arrival) * 0.65 - sinking * 2.3, z);
      body.root.rotation.set(
        Math.atan2(this.wave.normal.z, this.wave.normal.y) * 0.7,
        body.yaw + drift * 0.2,
        -Math.atan2(this.wave.normal.x, this.wave.normal.y) * 0.7,
      );
      body.figure.rotation.z = (index % 2 ? -0.12 : 0.1)
        + (index === 0 ? this.searchProgress * 0.48 : 0);
      body.head.getWorldPosition(this.headPosition);
      body.figure.getWorldQuaternion(this.inverseFigure).invert();
      this.direction.copy(this.cameraPosition).sub(this.headPosition).normalize().applyQuaternion(this.inverseFigure);
      this.headTarget.setFromUnitVectors(FACE_FORWARD, this.direction);
      body.head.quaternion.copy(body.restHead).slerp(this.headTarget, turn);
    }
    if (!this.caught) {
      this.tin.getWorldPosition(this.itemAimTarget.position);
      this.worldRoot.worldToLocal(this.itemAimTarget.position);
    }
    this.frameReveal();
  }

  private frameReveal(): void {
    if (this.revealing) {
      const focus = smoothstepRange(0.18, 0.42, this.revealProgress)
        * (1 - smoothstepRange(0.86, 1, this.revealProgress));
      this.cameraLook?.applyLookAt(this.itemAimTarget, focus * 0.9, 0.55);
    }
  }

  private applyAtmosphere(): void {
    this.environment.setBloodOceanIntensity(
      smoothstepRange(0, 0.5, this.revealProgress) * (1 - smoothstepRange(0.75, 1, this.reactionProgress)),
    );
  }

  skip(): void { this.settleForVisibilityChange(); }

  settleForVisibilityChange(): void {
    if (!this.staged || this.disposed) return;
    this.animation.settle(this.time);
    this.update(this.time, 0);
  }

  clear(): void {
    this.animation.cancel();
    this.cameraLook?.restore();
    this.revealing = false;
    this.environment.setBloodOceanIntensity(0);
    this.staged = false;
    this.caught = false;
    this.waited = false;
    this.revealProgress = 0;
    this.searchProgress = 0;
    this.reactionProgress = 0;
    this.worldRoot.add(this.tin);
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.worldRoot.removeFromParent();
    this.boatRoot.removeFromParent();
    this.worldRoot.clear();
    this.models.dispose();
  }
}
