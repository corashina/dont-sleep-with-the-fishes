import {
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';

const AUDIO_START_SECONDS = 0.55;
const AUDIO_PEAK_SECONDS = Object.freeze([
  0.760, 1.048, 1.296, 1.568, 1.856, 2.128,
  2.376, 2.656, 2.912, 3.192, 3.448,
  3.712, 3.960, 4.208, 4.488, 4.736, 5.008,
]);

export const REPAIR_HAMMER_PEAK_SECONDS = Object.freeze(
  AUDIO_PEAK_SECONDS.map((peak) => peak + AUDIO_START_SECONDS),
);
export const REPAIR_HAMMER_DURATION_SECONDS = 6.65;

function hammerOrientation(
  handleToHead: readonly [number, number, number],
  faceDirection: readonly [number, number, number],
): Quaternion {
  const xAxis = new Vector3(...handleToHead).normalize();
  const zAxis = new Vector3(...faceDirection).negate().normalize();
  const yAxis = new Vector3().crossVectors(zAxis, xAxis).normalize();
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(xAxis, yAxis, zAxis),
  );
}

function raisedOrientation(contact: Quaternion, angle: number): Quaternion {
  return new Quaternion()
    .setFromAxisAngle(new Vector3(0, 0, 1), angle)
    .multiply(contact);
}

const PORT_CONTACT = hammerOrientation([0, 1, 0], [-1, 0, 0]);
const CENTER_CONTACT = hammerOrientation([1, 0, 0], [0, -1, 0]);
const STARBOARD_CONTACT = hammerOrientation([0, 1, 0], [1, 0, 0]);

const REPAIR_SITES = Object.freeze([
  Object.freeze({
    position: new Vector3(-1.38, -0.15, 0.08),
    contact: PORT_CONTACT,
    raised: raisedOrientation(PORT_CONTACT, -0.48),
    normal: new Vector3(1, 0, 0),
  }),
  Object.freeze({
    position: new Vector3(0, -0.16, -0.34),
    contact: CENTER_CONTACT,
    raised: raisedOrientation(CENTER_CONTACT, 0.48),
    normal: new Vector3(0, 1, 0),
  }),
  Object.freeze({
    position: new Vector3(1.38, -0.15, 0.08),
    contact: STARBOARD_CONTACT,
    raised: raisedOrientation(STARBOARD_CONTACT, 0.48),
    normal: new Vector3(-1, 0, 0),
  }),
]);

const SITE_BY_PEAK = Object.freeze([
  0, 0, 0, 0, 0, 0,
  1, 1, 1, 1, 1,
  2, 2, 2, 2, 2, 2,
]);

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export class RepairToolboxAnimation {
  private readonly restPosition = new Vector3();
  private readonly restQuaternion = new Quaternion();
  private readonly boatRestPosition = new Vector3();
  private readonly boatRestQuaternion = new Quaternion();
  private readonly positionScratch = new Vector3();
  private audioStarted = false;
  private onAudioStart: () => void = () => undefined;
  private readonly animation = new TimedPresentationAnimation<'repair'>(
    (_kind, _time, progress) => this.sample(progress * REPAIR_HAMMER_DURATION_SECONDS),
    () => this.reset(),
    1e-9,
  );

  constructor(
    private readonly boat: Object3D,
    private readonly toolbox: Object3D,
    private readonly hammer: Object3D,
  ) {
    this.restPosition.copy(hammer.position);
    this.restQuaternion.copy(hammer.quaternion);
    this.hammer.visible = false;
  }

  get active(): boolean {
    return this.animation.active;
  }

  play(onAudioStart: () => void = () => undefined): Promise<void> {
    this.cancel();
    this.onAudioStart = onAudioStart;
    this.audioStarted = false;
    this.boat.updateWorldMatrix(true, false);
    this.toolbox.updateWorldMatrix(true, false);
    this.boat.attach(this.hammer);
    this.boatRestPosition.copy(this.hammer.position);
    this.boatRestQuaternion.copy(this.hammer.quaternion);
    this.hammer.visible = true;
    return this.animation.start('repair', REPAIR_HAMMER_DURATION_SECONDS);
  }

  update(deltaSeconds: number): void {
    this.animation.update(0, deltaSeconds);
  }

  cancel(): void {
    if (!this.animation.active) return;
    this.animation.cancel();
    this.reset();
  }

  private sample(elapsed: number): void {
    if (!this.audioStarted && elapsed >= AUDIO_START_SECONDS) {
      this.audioStarted = true;
      this.onAudioStart();
    }

    const firstPeak = REPAIR_HAMMER_PEAK_SECONDS[0]!;
    if (elapsed <= firstPeak) {
      const progress = smoothstep(elapsed / firstPeak);
      const site = REPAIR_SITES[0]!;
      this.hammer.position.lerpVectors(this.boatRestPosition, site.position, progress);
      this.hammer.position.y += Math.sin(Math.PI * progress) * 0.62;
      this.hammer.quaternion.slerpQuaternions(
        this.boatRestQuaternion,
        site.contact,
        progress,
      );
      return;
    }

    const lastPeakIndex = REPAIR_HAMMER_PEAK_SECONDS.length - 1;
    const lastPeak = REPAIR_HAMMER_PEAK_SECONDS[lastPeakIndex]!;
    if (elapsed >= lastPeak) {
      const progress = smoothstep(
        (elapsed - lastPeak) / (REPAIR_HAMMER_DURATION_SECONDS - lastPeak),
      );
      const site = REPAIR_SITES[2]!;
      this.hammer.position.lerpVectors(site.position, this.boatRestPosition, progress);
      this.hammer.position.y += Math.sin(Math.PI * progress) * 0.72;
      this.hammer.quaternion.slerpQuaternions(
        site.contact,
        this.boatRestQuaternion,
        progress,
      );
      return;
    }

    let nextPeakIndex = 1;
    while (REPAIR_HAMMER_PEAK_SECONDS[nextPeakIndex]! < elapsed) nextPeakIndex += 1;
    const previousPeakIndex = nextPeakIndex - 1;
    const previousPeak = REPAIR_HAMMER_PEAK_SECONDS[previousPeakIndex]!;
    const nextPeak = REPAIR_HAMMER_PEAK_SECONDS[nextPeakIndex]!;
    const progress = smoothstep((elapsed - previousPeak) / (nextPeak - previousPeak));
    const previousSiteIndex = SITE_BY_PEAK[previousPeakIndex]!;
    const nextSiteIndex = SITE_BY_PEAK[nextPeakIndex]!;
    const previousSite = REPAIR_SITES[previousSiteIndex]!;
    const nextSite = REPAIR_SITES[nextSiteIndex]!;

    if (previousSiteIndex !== nextSiteIndex) {
      this.hammer.position.lerpVectors(
        previousSite.position,
        nextSite.position,
        progress,
      );
      this.hammer.position.y += Math.sin(Math.PI * progress) * 0.76;
      this.hammer.quaternion.slerpQuaternions(
        previousSite.contact,
        nextSite.contact,
        progress,
      );
      return;
    }

    const lift = Math.sin(Math.PI * progress);
    this.positionScratch.copy(previousSite.normal).multiplyScalar(lift * 0.24);
    this.hammer.position.copy(previousSite.position).add(this.positionScratch);
    this.hammer.quaternion.slerpQuaternions(
      previousSite.contact,
      previousSite.raised,
      lift,
    );
  }

  private reset(): void {
    this.toolbox.updateWorldMatrix(true, false);
    this.toolbox.attach(this.hammer);
    this.hammer.position.copy(this.restPosition);
    this.hammer.quaternion.copy(this.restQuaternion);
    this.hammer.visible = false;
    this.onAudioStart = () => undefined;
    this.audioStarted = false;
  }
}
