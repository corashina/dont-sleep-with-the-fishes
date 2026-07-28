import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Group,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from 'three';
import {
  presentationWeatherProfile,
  type PresentationWeatherId,
  type PresentationWeatherProfile,
} from '../weather/presentationWeather';

export interface WeatherEffectsState {
  readonly profile: PresentationWeatherProfile;
  readonly reducedMotion: boolean;
}

interface ParticlePool {
  readonly points: Points<BufferGeometry, PointsMaterial>;
  readonly positions: Float32Array;
  readonly opacities: Float32Array;
  readonly origins: Float32Array;
  readonly phases: Float32Array;
  readonly speeds: Float32Array;
  readonly positionAttribute: BufferAttribute;
  readonly opacityAttribute: BufferAttribute;
  readonly capacity: number;
}

const RAIN_COUNT = 240;
const MIST_COUNT = 72;
const IMPACT_COUNT = 96;
const SPRAY_COUNT = 120;
const REDUCED_PARTICLE_SCALE = 0.32;
const LIGHTNING_INTERVALS = Object.freeze([4.1, 6.7, 3.4, 8.2, 5.3]);
const LIGHTNING_FLASH_DURATION = 0.18;

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function createPool(
  name: string,
  capacity: number,
  color: number,
  size: number,
  random: () => number,
): ParticlePool {
  const positions = new Float32Array(capacity * 3);
  const opacities = new Float32Array(capacity);
  const origins = new Float32Array(capacity * 3);
  const phases = new Float32Array(capacity);
  const speeds = new Float32Array(capacity);

  for (let index = 0; index < capacity; index += 1) {
    const offset = index * 3;
    origins[offset] = (random() - 0.5) * 44;
    origins[offset + 1] = random() * 15;
    origins[offset + 2] = (random() - 0.5) * 38;
    positions[offset] = origins[offset]!;
    positions[offset + 1] = origins[offset + 1]!;
    positions[offset + 2] = origins[offset + 2]!;
    phases[index] = random();
    speeds[index] = 0.72 + random() * 0.58;
    opacities[index] = 0;
  }

  const geometry = new BufferGeometry();
  const positionAttribute = new BufferAttribute(positions, 3);
  const opacityAttribute = new BufferAttribute(opacities, 1);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('opacity', opacityAttribute);
  geometry.setDrawRange(0, 0);

  const material = new PointsMaterial({
    color,
    depthWrite: false,
    opacity: 0,
    size,
    sizeAttenuation: true,
    transparent: true,
  });
  const points = new Points(geometry, material);
  points.name = name;
  points.frustumCulled = false;
  points.visible = false;

  return {
    points,
    positions,
    opacities,
    origins,
    phases,
    speeds,
    positionAttribute,
    opacityAttribute,
    capacity,
  };
}

function activeCount(pool: ParticlePool, intensity: number, reducedMotion: boolean): number {
  if (intensity <= 0) return 0;
  const motionScale = reducedMotion ? REDUCED_PARTICLE_SCALE : 1;
  return Math.max(1, Math.floor(pool.capacity * intensity * motionScale));
}

function cycle(value: number): number {
  return value - Math.floor(value);
}

export class WeatherEffects {
  private readonly root = new Group();
  private readonly rain: ParticlePool;
  private readonly mist: ParticlePool;
  private readonly impacts: ParticlePool;
  private readonly spray: ParticlePool;
  private readonly lightningLayer = new Group();
  private readonly lightningLight = new AmbientLight(0xd9edff, 0);
  private readonly reducedMotionQuery?: MediaQueryList;
  private profile = presentationWeatherProfile('calm');
  private reducedMotion = false;
  private stateValue: Readonly<WeatherEffectsState>;
  private lightningClock = 0;
  private lightningIntervalIndex = 0;
  private lightningFlashRemaining = 0;
  private disposed = false;

  private readonly handleReducedMotionChange = (event: MediaQueryListEvent): void => {
    if (this.disposed) return;
    this.reducedMotion = event.matches;
    this.stateValue = Object.freeze({
      profile: this.profile,
      reducedMotion: this.reducedMotion,
    });
    this.applyProfile();
  };

  constructor(scene: Scene, reducedMotionQuery?: MediaQueryList) {
    const random = createSeededRandom(0x57ea_7e12);
    this.rain = createPool('weather-rain', RAIN_COUNT, 0x9db7bc, 0.105, random);
    this.mist = createPool('weather-mist', MIST_COUNT, 0x9eb2b3, 0.52, random);
    this.impacts = createPool('weather-impacts', IMPACT_COUNT, 0xaac4c7, 0.16, random);
    this.spray = createPool('weather-spray', SPRAY_COUNT, 0xc2d6d4, 0.19, random);

    this.root.name = 'weather-effects-root';
    this.root.add(
      this.rain.points,
      this.mist.points,
      this.impacts.points,
      this.spray.points,
      this.lightningLayer,
    );
    this.lightningLayer.name = 'weather-lightning';
    this.lightningLight.name = 'weather-lightning-light';
    this.lightningLight.visible = false;
    this.lightningLayer.add(this.lightningLight);
    scene.add(this.root);

    this.reducedMotionQuery = reducedMotionQuery ?? (
      typeof window === 'undefined'
        ? undefined
        : window.matchMedia('(prefers-reduced-motion: reduce)')
    );
    this.reducedMotion = this.reducedMotionQuery?.matches ?? false;
    this.stateValue = Object.freeze({
      profile: this.profile,
      reducedMotion: this.reducedMotion,
    });
    this.reducedMotionQuery?.addEventListener('change', this.handleReducedMotionChange);
    this.applyProfile();
  }

  setWeather(id: PresentationWeatherId): void {
    if (this.disposed) return;
    const changed = this.profile.id !== id;
    this.profile = presentationWeatherProfile(id);
    this.stateValue = Object.freeze({
      profile: this.profile,
      reducedMotion: this.reducedMotion,
    });
    if (changed) this.resetLightning();
    this.applyProfile();
  }

  update(time: number, delta: number, cameraPosition: Readonly<Vector3>): void {
    if (this.disposed) return;
    const animationTime = Number.isFinite(time) ? time : 0;
    const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.root.position.set(cameraPosition.x, 0, cameraPosition.z);

    if (this.rain.points.visible) this.updateRain(animationTime);
    if (this.mist.points.visible) this.updateMist(animationTime);
    if (this.impacts.points.visible) this.updateImpacts(animationTime);
    if (this.spray.points.visible) this.updateSpray(animationTime);
    this.updateLightning(step);
  }

  get state(): Readonly<WeatherEffectsState> {
    return this.stateValue;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reducedMotionQuery?.removeEventListener('change', this.handleReducedMotionChange);
    this.root.removeFromParent();
    this.rain.points.geometry.dispose();
    this.rain.points.material.dispose();
    this.mist.points.geometry.dispose();
    this.mist.points.material.dispose();
    this.impacts.points.geometry.dispose();
    this.impacts.points.material.dispose();
    this.spray.points.geometry.dispose();
    this.spray.points.material.dispose();
    this.lightningLight.intensity = 0;
    this.lightningLight.visible = false;
  }

  private applyProfile(): void {
    const calmOrFog = this.profile.id === 'calm' || this.profile.id === 'fog';
    this.configurePool(this.rain, this.profile.rainIntensity, this.profile.rainIntensity > 0);
    this.configurePool(this.impacts, this.profile.rainIntensity, this.profile.rainIntensity > 0);
    this.configurePool(this.mist, this.profile.mistIntensity, !calmOrFog && this.profile.mistIntensity > 0);
    this.configurePool(this.spray, this.profile.sprayIntensity, !calmOrFog && this.profile.sprayIntensity > 0);
    this.lightningLayer.visible = this.profile.lightning;
    if (!this.profile.lightning || this.reducedMotion) {
      this.lightningFlashRemaining = 0;
      this.lightningLight.intensity = 0;
      this.lightningLight.visible = false;
    }
  }

  private configurePool(pool: ParticlePool, intensity: number, visible: boolean): void {
    pool.points.visible = visible;
    pool.points.geometry.setDrawRange(
      0,
      visible ? activeCount(pool, intensity, this.reducedMotion) : 0,
    );
    pool.points.material.opacity = visible ? Math.min(0.88, 0.22 + intensity * 0.66) : 0;
  }

  private updateRain(time: number): void {
    const count = this.rain.points.geometry.drawRange.count;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const fall = cycle(this.rain.phases[index]! + time * this.rain.speeds[index]! * 0.82);
      this.rain.positions[offset] = this.rain.origins[offset]! + fall * 4.8;
      this.rain.positions[offset + 1] = 15.5 - fall * 17;
      this.rain.positions[offset + 2] = this.rain.origins[offset + 2]! - fall * 2.1;
      this.rain.opacities[index] = Math.min(1, (1 - fall) * 1.35);
    }
    this.markUpdated(this.rain);
  }

  private updateMist(time: number): void {
    const count = this.mist.points.geometry.drawRange.count;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const drift = cycle(this.mist.phases[index]! + time * this.mist.speeds[index]! * 0.13);
      this.mist.positions[offset] = -24 + drift * 48;
      this.mist.positions[offset + 1] = 1.2 + this.mist.origins[offset + 1]! * 0.52;
      this.mist.positions[offset + 2] = this.mist.origins[offset + 2]!;
      this.mist.opacities[index] = Math.sin(Math.PI * drift) * 0.7;
    }
    this.markUpdated(this.mist);
  }

  private updateImpacts(time: number): void {
    const count = this.impacts.points.geometry.drawRange.count;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const pulse = cycle(this.impacts.phases[index]! + time * this.impacts.speeds[index]! * 1.35);
      const angle = this.impacts.origins[offset]!;
      const radius = pulse * 0.72;
      this.impacts.positions[offset] = this.impacts.origins[offset]! + Math.cos(angle) * radius;
      this.impacts.positions[offset + 1] = 0.12 + pulse * 0.08;
      this.impacts.positions[offset + 2] = this.impacts.origins[offset + 2]! + Math.sin(angle) * radius;
      this.impacts.opacities[index] = 1 - pulse;
    }
    this.markUpdated(this.impacts);
  }

  private updateSpray(time: number): void {
    const count = this.spray.points.geometry.drawRange.count;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const flight = cycle(this.spray.phases[index]! + time * this.spray.speeds[index]! * 0.68);
      this.spray.positions[offset] = this.spray.origins[offset]! + flight * 3.4;
      this.spray.positions[offset + 1] = 0.18 + Math.sin(Math.PI * flight) * 2.8;
      this.spray.positions[offset + 2] = this.spray.origins[offset + 2]! - flight * 1.6;
      this.spray.opacities[index] = Math.sin(Math.PI * flight);
    }
    this.markUpdated(this.spray);
  }

  private markUpdated(pool: ParticlePool): void {
    pool.positionAttribute.needsUpdate = true;
    pool.opacityAttribute.needsUpdate = true;
  }

  private updateLightning(delta: number): void {
    if (!this.profile.lightning || this.reducedMotion) return;
    this.lightningClock += delta;
    const interval = LIGHTNING_INTERVALS[this.lightningIntervalIndex]!;
    if (this.lightningClock >= interval) {
      this.lightningClock -= interval;
      this.lightningIntervalIndex = (this.lightningIntervalIndex + 1) % LIGHTNING_INTERVALS.length;
      this.lightningFlashRemaining = LIGHTNING_FLASH_DURATION;
    }

    if (this.lightningFlashRemaining <= 0) {
      this.lightningLight.intensity = 0;
      this.lightningLight.visible = false;
      return;
    }
    this.lightningLight.visible = true;
    this.lightningLight.intensity = 1.75 * (
      this.lightningFlashRemaining / LIGHTNING_FLASH_DURATION
    );
    this.lightningFlashRemaining = Math.max(0, this.lightningFlashRemaining - delta);
  }

  private resetLightning(): void {
    this.lightningClock = 0;
    this.lightningIntervalIndex = 0;
    this.lightningFlashRemaining = 0;
    this.lightningLight.intensity = 0;
    this.lightningLight.visible = false;
  }
}
