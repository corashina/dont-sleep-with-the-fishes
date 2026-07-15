import { DEFAULT_WAVES, sampleWaveField } from '../ocean/WaveField';
import type { WeatherId } from './survivalTypes';

const radians = (degrees: number): number => degrees * Math.PI / 180;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export interface BoatWaveHeights {
  readonly bow: number;
  readonly stern: number;
  readonly port: number;
  readonly starboard: number;
}

export interface BoatPose {
  readonly heave: number;
  readonly pitch: number;
  readonly roll: number;
  readonly yaw: number;
}

export interface RiderPose {
  readonly y: number;
  readonly pitch: number;
  readonly roll: number;
  readonly yaw: number;
}

export interface BoatDriftFrame {
  readonly boat: BoatPose;
  readonly rider: RiderPose;
  readonly angularVelocity: { readonly pitch: number; readonly roll: number };
  readonly bowImpact: number;
}

export const BOAT_DRIFT_CONFIG = {
  sample: {
    bow: { x: 0, z: -2.4 },
    stern: { x: 0, z: 2.4 },
    port: { x: -1.25, z: 0 },
    starboard: { x: 1.25, z: 0 },
  },
  heaveScale: 0.58,
  pitchLimit: radians(6.3),
  rollLimit: radians(7.4),
  yawLimit: radians(0.5),
  boatResponse: 3.2,
  riderResponse: 1.8,
  riderCompensation: 0.12,
  riderRotationLimit: radians(1),
  riderHeaveFraction: 0.08,
  riderHeaveLimit: 0.03,
  maxDelta: 0.1,
} as const;

export const NEUTRAL_BOAT_DRIFT_FRAME: BoatDriftFrame = {
  boat: { heave: 0, pitch: 0, roll: 0, yaw: 0 },
  rider: { y: 0, pitch: 0, roll: 0, yaw: 0 },
  angularVelocity: { pitch: 0, roll: 0 },
  bowImpact: 0,
};

export function weatherAmplitudeScale(weather: WeatherId): number {
  if (weather === 'squall') return 1.35;
  if (weather === 'overcast') return 1;
  return 0.78;
}

function waveHeight(time: number, x: number, z: number, scale: number): number {
  return sampleWaveField(DEFAULT_WAVES, time, x, z, scale).height;
}

export function sampleBoatWaveHeights(time: number, amplitudeScale: number): BoatWaveHeights {
  const { sample } = BOAT_DRIFT_CONFIG;
  return {
    bow: waveHeight(time, sample.bow.x, sample.bow.z, amplitudeScale),
    stern: waveHeight(time, sample.stern.x, sample.stern.z, amplitudeScale),
    port: waveHeight(time, sample.port.x, sample.port.z, amplitudeScale),
    starboard: waveHeight(time, sample.starboard.x, sample.starboard.z, amplitudeScale),
  };
}

interface SpringChannel { value: number; velocity: number }

function setChannel(channel: SpringChannel, value: number): void {
  channel.value = value;
  channel.velocity = 0;
}

function stepCritical(
  channel: SpringChannel,
  target: number,
  response: number,
  delta: number,
): void {
  const previous = channel.value;
  const omegaDelta = response * delta;
  const denominator = 1 + 2 * omegaDelta + omegaDelta * omegaDelta;
  const nextVelocity = (
    channel.velocity + response * response * delta * (target - previous)
  ) / denominator;
  channel.value = previous + delta * nextVelocity;
  channel.velocity = nextVelocity;
}

export class BoatDriftMotion {
  private readonly boat = {
    heave: { value: 0, velocity: 0 },
    pitch: { value: 0, velocity: 0 },
    roll: { value: 0, velocity: 0 },
    yaw: { value: 0, velocity: 0 },
  };
  private readonly rider = {
    y: { value: 0, velocity: 0 },
    pitch: { value: 0, velocity: 0 },
    roll: { value: 0, velocity: 0 },
    yaw: { value: 0, velocity: 0 },
  };
  private initialized = false;
  private lastBowHeight = 0;

  update(
    samples: BoatWaveHeights,
    time: number,
    delta: number,
    reducedMotion: boolean,
  ): BoatDriftFrame {
    const dt = clamp(delta, 0, BOAT_DRIFT_CONFIG.maxDelta);
    if (reducedMotion) {
      this.setNeutral(samples.bow);
      return NEUTRAL_BOAT_DRIFT_FRAME;
    }

    const targetBoat = this.targetBoat(samples, time);
    const targetRider = this.targetRider(targetBoat);
    if (!this.initialized) {
      this.assignTargets(targetBoat, targetRider);
      this.initialized = true;
      this.lastBowHeight = samples.bow;
      return this.frame(0);
    }

    if (dt > 0) {
      stepCritical(this.boat.heave, targetBoat.heave, BOAT_DRIFT_CONFIG.boatResponse, dt);
      stepCritical(this.boat.pitch, targetBoat.pitch, BOAT_DRIFT_CONFIG.boatResponse, dt);
      stepCritical(this.boat.roll, targetBoat.roll, BOAT_DRIFT_CONFIG.boatResponse, dt);
      stepCritical(this.boat.yaw, targetBoat.yaw, BOAT_DRIFT_CONFIG.boatResponse, dt);
      stepCritical(this.rider.y, targetRider.y, BOAT_DRIFT_CONFIG.riderResponse, dt);
      stepCritical(this.rider.pitch, targetRider.pitch, BOAT_DRIFT_CONFIG.riderResponse, dt);
      stepCritical(this.rider.roll, targetRider.roll, BOAT_DRIFT_CONFIG.riderResponse, dt);
      stepCritical(this.rider.yaw, targetRider.yaw, BOAT_DRIFT_CONFIG.riderResponse, dt);
    }

    const bowSpeed = dt > 0 ? (samples.bow - this.lastBowHeight) / dt : 0;
    this.lastBowHeight = samples.bow;
    const bowImpact = clamp((bowSpeed - this.boat.heave.velocity - 0.2) / 0.8, 0, 1);
    return this.frame(bowImpact);
  }

  private targetBoat(samples: BoatWaveHeights, time: number): BoatPose {
    const meanHeight = (samples.bow + samples.stern + samples.port + samples.starboard) / 4;
    return {
      heave: meanHeight * BOAT_DRIFT_CONFIG.heaveScale,
      pitch: clamp(
        Math.atan2(samples.bow - samples.stern, 4.8),
        -BOAT_DRIFT_CONFIG.pitchLimit,
        BOAT_DRIFT_CONFIG.pitchLimit,
      ),
      roll: clamp(
        Math.atan2(samples.starboard - samples.port, 2.5),
        -BOAT_DRIFT_CONFIG.rollLimit,
        BOAT_DRIFT_CONFIG.rollLimit,
      ),
      yaw: clamp(
        Math.sin(time * 0.17) * radians(0.32) + Math.sin(time * 0.071 + 1.4) * radians(0.18),
        -BOAT_DRIFT_CONFIG.yawLimit,
        BOAT_DRIFT_CONFIG.yawLimit,
      ),
    };
  }

  private targetRider(boat: BoatPose): RiderPose {
    const rotationLimit = BOAT_DRIFT_CONFIG.riderRotationLimit;
    return {
      y: clamp(
        -boat.heave * BOAT_DRIFT_CONFIG.riderHeaveFraction,
        -BOAT_DRIFT_CONFIG.riderHeaveLimit,
        BOAT_DRIFT_CONFIG.riderHeaveLimit,
      ),
      pitch: clamp(-boat.pitch * BOAT_DRIFT_CONFIG.riderCompensation, -rotationLimit, rotationLimit),
      roll: clamp(-boat.roll * BOAT_DRIFT_CONFIG.riderCompensation, -rotationLimit, rotationLimit),
      yaw: clamp(-boat.yaw * BOAT_DRIFT_CONFIG.riderCompensation, -rotationLimit, rotationLimit),
    };
  }

  private assignTargets(boat: BoatPose, rider: RiderPose): void {
    setChannel(this.boat.heave, boat.heave);
    setChannel(this.boat.pitch, boat.pitch);
    setChannel(this.boat.roll, boat.roll);
    setChannel(this.boat.yaw, boat.yaw);
    setChannel(this.rider.y, rider.y);
    setChannel(this.rider.pitch, rider.pitch);
    setChannel(this.rider.roll, rider.roll);
    setChannel(this.rider.yaw, rider.yaw);
  }

  private setNeutral(bowHeight: number): void {
    this.assignTargets(NEUTRAL_BOAT_DRIFT_FRAME.boat, NEUTRAL_BOAT_DRIFT_FRAME.rider);
    this.initialized = true;
    this.lastBowHeight = bowHeight;
  }

  private frame(bowImpact: number): BoatDriftFrame {
    return {
      boat: {
        heave: this.boat.heave.value,
        pitch: this.boat.pitch.value,
        roll: this.boat.roll.value,
        yaw: this.boat.yaw.value,
      },
      rider: {
        y: this.rider.y.value,
        pitch: this.rider.pitch.value,
        roll: this.rider.roll.value,
        yaw: this.rider.yaw.value,
      },
      angularVelocity: {
        pitch: this.boat.pitch.velocity,
        roll: this.boat.roll.velocity,
      },
      bowImpact,
    };
  }
}
