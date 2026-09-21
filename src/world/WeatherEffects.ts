import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  Points,
  type PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { LightningBolt } from './LightningBolt';
import { RainField } from './RainField';
import { LIGHTNING_FLASH_DURATION, lightningFlashIntensity } from './lightningFlash';
import {
  presentationWeatherProfile,
  type PresentationWeatherId,
  type PresentationWeatherProfile,
} from '../weather/presentationWeather';

export interface WeatherEffectsState {
  readonly profile: PresentationWeatherProfile;
}

interface ParticlePool {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  readonly positions: Float32Array;
  readonly opacities: Float32Array;
  readonly origins: Float32Array;
  readonly phases: Float32Array;
  readonly speeds: Float32Array;
  readonly positionAttribute: BufferAttribute;
  readonly opacityAttribute: BufferAttribute;
  readonly capacity: number;
}

const MIST_COUNT = 120;
const IMPACT_COUNT = 192;
const SPRAY_COUNT = 160;
const LIGHTNING_BOLT_COUNT = 8;
const LIGHTNING_PAIR_CHANCE = 0.16;
const PARTICLE_VERTEX_SHADER = `
  attribute float opacity;
  varying float vParticleOpacity;
  uniform float pointSize;
  uniform vec2 pointSizeLimits;
  uniform float ripple;

  void main() {
    vParticleOpacity = opacity;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float growth = mix(1.0, 0.25 + (1.0 - opacity) * 0.75, ripple);
    gl_PointSize = clamp(pointSize * growth * (300.0 / max(1.0, -viewPosition.z)), pointSizeLimits.x, pointSizeLimits.y);
    gl_Position = projectionMatrix * viewPosition;
  }
`;
const PARTICLE_FRAGMENT_SHADER = `
  uniform vec3 particleColor;
  uniform float materialOpacity;
  uniform vec2 particleShape;
  uniform float edgeStart;
  uniform float lightningGlow;
  varying float vParticleOpacity;
  uniform float ripple;

  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    vec2 shapedOffset = offset * particleShape;
    float radius = length(shapedOffset);
    float edgeAlpha = 1.0 - smoothstep(edgeStart, 0.5, radius);
    edgeAlpha *= mix(1.0, smoothstep(0.23, 0.34, radius), ripple);
    vec4 diffuseColor = vec4(particleColor + vec3(0.52, 0.6, 0.7) * lightningGlow, materialOpacity * edgeAlpha);
    diffuseColor.a *= vParticleOpacity;
    if (diffuseColor.a <= 0.001) discard;
    gl_FragColor = diffuseColor;
  }
`;

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
  shape: readonly [number, number],
  edgeStart: number,
  random: () => number,
  volume: readonly [number, number, number] = [44, 15, 38],
): ParticlePool {
  const positions = new Float32Array(capacity * 3);
  const opacities = new Float32Array(capacity);
  const origins = new Float32Array(capacity * 3);
  const phases = new Float32Array(capacity);
  const speeds = new Float32Array(capacity);

  for (let index = 0; index < capacity; index += 1) {
    const offset = index * 3;
    origins[offset] = (random() - 0.5) * volume[0];
    origins[offset + 1] = random() * volume[1];
    origins[offset + 2] = (random() - 0.5) * volume[2];
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

  const material = new ShaderMaterial({
    depthWrite: false,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    uniforms: {
      materialOpacity: { value: 0 },
      particleColor: { value: new Color(color) },
      particleShape: { value: new Vector2(shape[0], shape[1]) },
      pointSize: { value: size },
      pointSizeLimits: { value: new Vector2(0, 1024) },
      ripple: { value: 0 },
      edgeStart: { value: edgeStart },
      lightningGlow: { value: 0 },
    },
    vertexShader: PARTICLE_VERTEX_SHADER,
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

function activeCount(pool: ParticlePool, intensity: number): number {
  if (intensity <= 0) return 0;
  return Math.max(1, Math.floor(pool.capacity * intensity));
}

function cycle(value: number): number {
  return value - Math.floor(value);
}

export class WeatherEffects {
  private readonly root = new Group();
  private readonly rain: RainField;
  private readonly farRain: RainField;
  private readonly mist: ParticlePool;
  private readonly impacts: ParticlePool;
  private readonly spray: ParticlePool;
  private readonly lightningLayer = new Group();
  private readonly lightningLight = new DirectionalLight(0xe3eaff, 0);
  private readonly lightningFill = new AmbientLight(0xb8c9e8, 0);
  private readonly lightningBolts: readonly LightningBolt[];
  private readonly activeLightningBoltIndices = new Int8Array(2);
  private readonly lightningViewDirection = new Vector3(0, 0, -1);
  private lightningViewHeading = Math.PI;
  private lightningViewSpread = Math.PI / 12;
  private profile = presentationWeatherProfile('calm');
  private stateValue: Readonly<WeatherEffectsState>;
  private lightningClock = 0;
  private lightningInterval = 0.65;
  private lightningFlashAge = LIGHTNING_FLASH_DURATION;
  private lightningRepeatDelay = 0.14;
  private lightningStrength = 1;
  private thunderRemaining = 0;
  private activeLightningBoltCount = 0;
  private thunderListener: () => void = () => undefined;
  private disposed = false;

  constructor(
    scene: Scene,
    private readonly lightningRandom: () => number = createSeededRandom(0x1eaf_71a9),
  ) {
    const random = createSeededRandom(0x57ea_7e12);
    this.rain = new RainField('weather-rain', 2200, new Vector3(18, 14, 18), random);
    this.farRain = new RainField('weather-rain-far', 1800, new Vector3(70, 24, 70), random);
    this.mist = createPool('weather-mist', MIST_COUNT, 0xa8bec0, 0.62, [0.85, 1.2], 0.28, random);
    this.impacts = createPool('weather-impacts', IMPACT_COUNT, 0xc6e0e3, 0.24, [1, 2.4], 0.38, random,
      [32, 15, 30]);
    this.impacts.points.material.uniforms.ripple!.value = 1;
    (this.impacts.points.material.uniforms.pointSizeLimits!.value as Vector2).set(0, 12);
    this.spray = createPool('weather-spray', SPRAY_COUNT, 0xd0e5e3, 0.24, [1, 1], 0.24, random);
    this.lightningBolts = Object.freeze(
      Array.from({ length: LIGHTNING_BOLT_COUNT }, (_, index) => (
        new LightningBolt(24, 0x71a9 + index * 7919)
      )),
    );

    this.root.name = 'weather-effects-root';
    this.root.add(
      this.farRain,
      this.rain,
      this.mist.points,
      this.impacts.points,
      this.spray.points,
      this.lightningLayer,
    );
    this.lightningBolts.forEach((bolt, index) => {
      bolt.name = `weather-lightning-bolt-${index + 1}`;
    });
    this.lightningLayer.name = 'weather-lightning';
    this.lightningLight.name = 'weather-lightning-light';
    this.lightningFill.name = 'weather-lightning-fill';
    this.lightningLayer.add(
      this.lightningLight,
      this.lightningLight.target,
      this.lightningFill,
      ...this.lightningBolts,
    );
    scene.add(this.root);

    this.stateValue = Object.freeze({
      profile: this.profile,
    });
    this.applyProfile();
  }

  setWeather(id: PresentationWeatherId): void {
    if (this.disposed) return;
    const changed = this.profile.id !== id;
    this.profile = presentationWeatherProfile(id);
    this.stateValue = Object.freeze({
      profile: this.profile,
    });
    if (changed) this.resetLightning();
    this.applyProfile();
  }

  setMistOffsetZ(offset: number): void {
    this.mist.points.position.z = offset;
  }

  setLightningView(camera: PerspectiveCamera): void {
    camera.getWorldDirection(this.lightningViewDirection);
    this.lightningViewHeading = Math.atan2(this.lightningViewDirection.x, this.lightningViewDirection.z);
    const verticalHalfFov = camera.getEffectiveFOV() * Math.PI / 360;
    // Leave space for branches at both edges, including narrow portrait views.
    this.lightningViewSpread = Math.atan(Math.tan(verticalHalfFov) * camera.aspect) * 0.45;
  }

  update(time: number, delta: number, cameraPosition: Readonly<Vector3>): void {
    if (this.disposed) return;
    const animationTime = Number.isFinite(time) ? time : 0;
    const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.root.position.set(cameraPosition.x, 0, cameraPosition.z);

    if (this.rain.visible) this.updateRain(animationTime);
    if (this.mist.points.visible) this.updateMist(animationTime);
    if (this.impacts.points.visible) this.updateImpacts(animationTime);
    if (this.spray.points.visible) this.updateSpray(animationTime);
    this.updateLightning(step);
  }

  get state(): Readonly<WeatherEffectsState> {
    return this.stateValue;
  }

  setThunderListener(listener: () => void): void {
    this.thunderListener = listener;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.thunderListener = () => undefined;
    this.thunderRemaining = 0;
    this.root.removeFromParent();
    this.rain.dispose();
    this.farRain.dispose();
    this.mist.points.geometry.dispose();
    this.mist.points.material.dispose();
    this.impacts.points.geometry.dispose();
    this.impacts.points.material.dispose();
    this.spray.points.geometry.dispose();
    this.spray.points.material.dispose();
    for (const bolt of this.lightningBolts) {
      bolt.geometry.dispose();
      bolt.material.dispose();
    }
    this.lightningLight.intensity = 0;
    this.lightningFill.intensity = 0;
  }

  private applyProfile(): void {
    const isCalm = this.profile.id === 'calm';
    const isWind = this.profile.id === 'wind';
    this.applyRainProfile();
    this.applyMistProfile(isCalm, isWind);
    this.applySprayProfile(isCalm, isWind);
    this.lightningLayer.visible = this.profile.lightning;
    this.resetProfileLightning();
  }

  private applyRainProfile(): void {
    const visible = this.profile.rainIntensity > 0;
    this.rain.setIntensity(this.profile.rainIntensity);
    this.farRain.setIntensity(this.profile.rainIntensity * 0.55);
    this.configurePool(this.impacts, this.profile.rainIntensity, visible);
  }

  private applyMistProfile(isCalm: boolean, isWind: boolean): void {
    this.configurePool(this.mist, this.profile.mistIntensity, !isCalm && this.profile.mistIntensity > 0);
    this.setPoolStyle(this.mist, isWind ? 0.48 : 0.62,
      isWind ? 0.62 : 0.85, isWind ? 3.4 : 1.2);
    this.mist.points.material.uniforms.edgeStart!.value = this.profile.lightning ? 0.02 : 0.28;
    if (this.profile.lightning) this.setPoolStyle(this.mist, 1.8, 1, 2.2);
  }

  private applySprayProfile(isCalm: boolean, isWind: boolean): void {
    this.configurePool(this.spray, this.profile.sprayIntensity, !isCalm && this.profile.sprayIntensity > 0);
    this.setPoolStyle(this.spray, isWind ? 0.5 : 0.24, isWind ? 0.68 : 1, isWind ? 3.1 : 1);
  }

  private resetProfileLightning(): void {
    if (!this.profile.lightning) {
      this.lightningFlashAge = LIGHTNING_FLASH_DURATION;
      this.lightningLight.intensity = 0;
      this.lightningFill.intensity = 0;
    }
    this.setLightningBolts(0);
  }

  private configurePool(pool: ParticlePool, intensity: number, visible: boolean): void {
    pool.points.visible = visible;
    pool.points.geometry.setDrawRange(
      0,
      visible ? activeCount(pool, intensity) : 0,
    );
    const opacity = visible ? Math.min(0.88, 0.22 + intensity * 0.66) : 0;
    pool.points.material.opacity = opacity;
    pool.points.material.uniforms.materialOpacity!.value = opacity;
  }

  private setPoolStyle(
    pool: ParticlePool,
    pointSize: number,
    shapeX: number,
    shapeY: number,
  ): void {
    pool.points.material.uniforms.pointSize!.value = pointSize;
    const shape = pool.points.material.uniforms.particleShape!.value as Vector2;
    shape.set(shapeX, shapeY);
  }

  private updateRain(time: number): void {
    const gust = this.profile.lightning ? 1.3 + Math.sin(time * 0.73) * 0.18 + Math.sin(time * 1.61) * 0.08 : 1;
    this.rain.update(time, gust);
    this.farRain.update(time, gust);
  }

  private updateMist(time: number): void {
    const count = this.mist.points.geometry.drawRange.count;
    const wind = this.profile.id === 'wind';
    const storm = this.profile.lightning;
    let driftRate = wind ? 0.46 : 0.13;
    let baseHeight = 1.2;
    let heightScale = 0.52;
    let opacity = 0.82;
    if (storm) {
      driftRate = 0.24;
      baseHeight = 0.45;
      heightScale = 0.12;
      opacity = 0.25;
    }
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const drift = cycle(this.mist.phases[index]! + time * this.mist.speeds[index]! * driftRate);
      this.mist.positions[offset] = (wind ? -34 : -24) + drift * (wind ? 68 : 48);
      this.mist.positions[offset + 1] = baseHeight + this.mist.origins[offset + 1]! * heightScale;
      this.mist.positions[offset + 2] = this.mist.origins[offset + 2]!
        - (wind || storm ? drift * 7.5 : 0);
      this.mist.opacities[index] = Math.sin(Math.PI * drift) * opacity;
    }
    this.markUpdated(this.mist);
  }

  private updateImpacts(time: number): void {
    const count = this.impacts.points.geometry.drawRange.count;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const pulse = cycle(this.impacts.phases[index]! + time * this.impacts.speeds[index]! * 1.35);
      this.impacts.positions[offset] = this.impacts.origins[offset]!;
      this.impacts.positions[offset + 1] = 0.12;
      this.impacts.positions[offset + 2] = this.impacts.origins[offset + 2]!;
      this.impacts.opacities[index] = 1 - pulse;
    }
    this.markUpdated(this.impacts);
  }

  private updateSpray(time: number): void {
    const count = this.spray.points.geometry.drawRange.count;
    const wind = this.profile.id === 'wind';
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const flight = cycle(
        this.spray.phases[index]! + time * this.spray.speeds[index]! * (wind ? 1.28 : 0.68),
      );
      this.spray.positions[offset] = this.spray.origins[offset]! + flight * (wind ? 13 : 3.4);
      this.spray.positions[offset + 1] = 0.18
        + Math.sin(Math.PI * flight) * (wind ? 5.8 : 2.8);
      this.spray.positions[offset + 2] = this.spray.origins[offset + 2]!
        - flight * (wind ? 5.4 : 1.6);
      this.spray.opacities[index] = Math.sin(Math.PI * flight);
    }
    this.markUpdated(this.spray);
  }

  private markUpdated(pool: ParticlePool): void {
    pool.positionAttribute.needsUpdate = true;
    pool.opacityAttribute.needsUpdate = true;
  }

  private updateLightning(delta: number): void {
    if (!this.profile.lightning) return;
    this.lightningFlashAge += delta;
    if (this.thunderRemaining > 0) {
      this.thunderRemaining = Math.max(0, this.thunderRemaining - delta);
      if (this.thunderRemaining === 0) this.thunderListener();
    }
    this.lightningClock += delta;
    if (this.lightningClock >= this.lightningInterval) {
      // Do not replay missed strikes after a suspended frame.
      this.lightningClock = 0;
      this.prepareLightningStrike();
      this.lightningFlashAge = 0;
      this.lightningRepeatDelay = 0.09 + this.lightningRandom() * 0.14;
      this.lightningStrength = 0.7 + this.lightningRandom() * 0.6;
      this.lightningInterval = 1.4 + this.lightningRandom() * 1.6;
      const primary = this.lightningBolts[this.activeLightningBoltIndices[0]!]!;
      this.lightningLight.position.copy(primary.position);
      this.lightningLight.position.y += 24 * primary.scale.y;
      this.thunderRemaining = primary.position.length() / 343;
    }
    const flash = lightningFlashIntensity(this.lightningFlashAge, this.lightningRepeatDelay) * this.lightningStrength;
    this.lightningLight.intensity = 3.2 * flash;
    this.lightningFill.intensity = 0.32 * flash;
    this.setLightningBolts(flash);
    this.setParticleLightning(flash);
  }

  private setParticleLightning(flash: number): void {
    this.rain.material.uniforms.lightningGlow!.value = flash;
    this.farRain.material.uniforms.lightningGlow!.value = flash;
    this.mist.points.material.uniforms.lightningGlow!.value = flash * 0.4;
    this.spray.points.material.uniforms.lightningGlow!.value = flash;
    this.impacts.points.material.uniforms.lightningGlow!.value = flash;
  }

  private setLightningBolts(opacity: number): void {
    for (let index = 0; index < this.lightningBolts.length; index += 1) {
      const bolt = this.lightningBolts[index]!;
      const activeSlot = this.activeLightningBoltIndices[0] === index
        ? 0
        : this.activeLightningBoltCount > 1
          && this.activeLightningBoltIndices[1] === index
          ? 1
          : -1;
      bolt.setIntensity(activeSlot >= 0
        ? opacity * (activeSlot === 0 ? 1 : 0.68)
        : 0);
    }
  }

  private prepareLightningStrike(): void {
    const paired = this.lightningRandom() < LIGHTNING_PAIR_CHANCE;
    const primaryIndex = Math.min(
      LIGHTNING_BOLT_COUNT - 1,
      Math.floor(this.lightningRandom() * LIGHTNING_BOLT_COUNT),
    );
    this.activeLightningBoltCount = paired ? 2 : 1;
    this.activeLightningBoltIndices[0] = primaryIndex;
    this.randomizeLightningBolt(primaryIndex);

    if (!paired) return;
    const secondaryOffset = 1 + Math.min(
      LIGHTNING_BOLT_COUNT - 2,
      Math.floor(this.lightningRandom() * (LIGHTNING_BOLT_COUNT - 1)),
    );
    const secondaryIndex = (primaryIndex + secondaryOffset) % LIGHTNING_BOLT_COUNT;
    this.activeLightningBoltIndices[1] = secondaryIndex;
    this.randomizeLightningBolt(secondaryIndex);
  }

  private randomizeLightningBolt(index: number): void {
    const bolt = this.lightningBolts[index]!;
    const angle = this.lightningViewHeading + (this.lightningRandom() * 2 - 1) * this.lightningViewSpread;
    const radius = 140 + this.lightningRandom() * 190;
    const heightOffset = -0.5;
    const scale = 1 + this.lightningRandom() * 0.7;
    bolt.position.set(Math.sin(angle) * radius, heightOffset, Math.cos(angle) * radius);
    bolt.rotation.y = this.lightningRandom() * Math.PI * 2;
    bolt.scale.set(1, scale, 1);
  }

  private resetLightning(): void {
    this.lightningClock = 0;
    this.lightningInterval = 0.65;
    this.lightningFlashAge = LIGHTNING_FLASH_DURATION;
    this.thunderRemaining = 0;
    this.activeLightningBoltCount = 0;
    this.lightningLight.intensity = 0;
    this.lightningFill.intensity = 0;
    this.setParticleLightning(0);
    this.setLightningBolts(0);
  }
}
