import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
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

interface LightningBolt {
  readonly line: LineSegments<BufferGeometry, LineBasicMaterial>;
}

const RAIN_COUNT = 320;
const FAR_RAIN_COUNT = 900;
const MIST_COUNT = 120;
const IMPACT_COUNT = 128;
const SPRAY_COUNT = 160;
const LIGHTNING_BOLT_COUNT = 8;
const LIGHTNING_PAIR_CHANCE = 0.16;
const LIGHTNING_INTERVALS = Object.freeze([1.35, 4.8, 2.9, 6.2, 3.6]);
const LIGHTNING_FLASH_DURATION = 0.42;
const LIGHTNING_STROKE_OFFSETS = Object.freeze([-0.28, -0.14, 0, 0.14, 0.28]);
const PARTICLE_VERTEX_SHADER = `
  attribute float opacity;
  varying float vParticleOpacity;
  uniform float pointSize;

  void main() {
    vParticleOpacity = opacity;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = pointSize * (300.0 / max(1.0, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;
const PARTICLE_FRAGMENT_SHADER = `
  uniform vec3 particleColor;
  uniform float materialOpacity;
  uniform vec2 particleShape;
  uniform float edgeStart;
  varying float vParticleOpacity;

  void main() {
    vec2 shapedOffset = (gl_PointCoord - vec2(0.5)) * particleShape;
    float radius = length(shapedOffset);
    float edgeAlpha = 1.0 - smoothstep(edgeStart, 0.5, radius);
    vec4 diffuseColor = vec4(particleColor, materialOpacity * edgeAlpha);
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
      edgeStart: { value: edgeStart },
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

function createLightningBolt(
  index: number,
  random: () => number,
): LightningBolt {
  const vertices: number[] = [];
  const appendSegment = (
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number,
    widthScale: number,
  ): void => {
    for (const offset of LIGHTNING_STROKE_OFFSETS) {
      const strokeOffset = offset * widthScale;
      vertices.push(
        startX + strokeOffset, startY, startZ,
        endX + strokeOffset, endY, endZ,
      );
    }
  };
  let x = 0;
  let y = 22 + random() * 4;
  let z = 0;
  let lateralDirection = random() < 0.5 ? -1 : 1;

  for (let segment = 0; segment < 11; segment += 1) {
    const nextX = x + lateralDirection * (1.3 + random() * 2.2);
    const nextY = y - (1.2 + random() * 0.82);
    const nextZ = z + (random() - 0.5) * 1.5;
    appendSegment(x, y, z, nextX, nextY, nextZ, 1);

    if (segment === 2 || segment === 5 || segment === 8) {
      const direction = random() < 0.5 ? -1 : 1;
      const branchX = nextX + direction * (1.8 + random() * 2.6);
      const branchY = nextY - (1.4 + random() * 2.4);
      const branchZ = nextZ + (random() - 0.5) * 1.8;
      appendSegment(nextX, nextY, nextZ, branchX, branchY, branchZ, 0.62);
    }

    x = nextX;
    y = nextY;
    z = nextZ;
    lateralDirection *= -1;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  const material = new LineBasicMaterial({
    blending: AdditiveBlending,
    color: 0xe5f5ff,
    depthTest: false,
    depthWrite: false,
    fog: false,
    opacity: 0,
    toneMapped: false,
    transparent: false,
  });
  const line = new LineSegments(geometry, material);
  const angle = (index / LIGHTNING_BOLT_COUNT) * Math.PI * 2;
  const radius = 26 + (index % 2) * 5;
  line.name = `weather-lightning-bolt-${index + 1}`;
  line.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
  line.rotation.y = angle + Math.PI / 2;
  line.frustumCulled = false;
  line.renderOrder = -500;
  line.visible = false;
  return { line };
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
  private readonly rain: ParticlePool;
  private readonly farRain: ParticlePool;
  private readonly mist: ParticlePool;
  private readonly impacts: ParticlePool;
  private readonly spray: ParticlePool;
  private readonly lightningLayer = new Group();
  private readonly lightningLight = new AmbientLight(0xd9edff, 0);
  private readonly lightningBolts: readonly LightningBolt[];
  private readonly activeLightningBoltIndices = new Int8Array(2);
  private profile = presentationWeatherProfile('calm');
  private stateValue: Readonly<WeatherEffectsState>;
  private lightningClock = 0;
  private lightningIntervalIndex = 0;
  private lightningFlashRemaining = 0;
  private activeLightningBoltCount = 0;
  private disposed = false;

  constructor(
    scene: Scene,
    private readonly lightningRandom: () => number = createSeededRandom(0x1eaf_71a9),
  ) {
    const random = createSeededRandom(0x57ea_7e12);
    this.rain = createPool('weather-rain', RAIN_COUNT, 0xb8d5dc, 0.28, [5.2, 1], 0.22, random);
    this.farRain = createPool(
      'weather-rain-far',
      FAR_RAIN_COUNT,
      0x8facb3,
      0.15,
      [7.4, 1],
      0.18,
      random,
      [92, 24, 82],
    );
    this.mist = createPool('weather-mist', MIST_COUNT, 0xa8bec0, 0.62, [0.85, 1.2], 0.28, random);
    this.impacts = createPool('weather-impacts', IMPACT_COUNT, 0xc6e0e3, 0.22, [1, 1], 0.26, random);
    this.spray = createPool('weather-spray', SPRAY_COUNT, 0xd0e5e3, 0.24, [1, 1], 0.24, random);
    this.lightningBolts = Object.freeze(
      Array.from({ length: LIGHTNING_BOLT_COUNT }, (_, index) => (
        createLightningBolt(index, random)
      )),
    );

    this.root.name = 'weather-effects-root';
    this.root.add(
      this.farRain.points,
      this.rain.points,
      this.mist.points,
      this.impacts.points,
      this.spray.points,
      this.lightningLayer,
    );
    this.lightningLayer.name = 'weather-lightning';
    this.lightningLight.name = 'weather-lightning-light';
    this.lightningLight.visible = false;
    this.lightningLayer.add(
      this.lightningLight,
      ...this.lightningBolts.map((bolt) => bolt.line),
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
    this.root.removeFromParent();
    this.rain.points.geometry.dispose();
    this.rain.points.material.dispose();
    this.farRain.points.geometry.dispose();
    this.farRain.points.material.dispose();
    this.mist.points.geometry.dispose();
    this.mist.points.material.dispose();
    this.impacts.points.geometry.dispose();
    this.impacts.points.material.dispose();
    this.spray.points.geometry.dispose();
    this.spray.points.material.dispose();
    for (const bolt of this.lightningBolts) {
      bolt.line.geometry.dispose();
      bolt.line.material.dispose();
    }
    this.lightningLight.intensity = 0;
    this.lightningLight.visible = false;
  }

  private applyProfile(): void {
    const isCalm = this.profile.id === 'calm';
    const isFog = this.profile.id === 'fog';
    const isWind = this.profile.id === 'wind';
    this.configurePool(this.rain, this.profile.rainIntensity, this.profile.rainIntensity > 0);
    this.configurePool(this.farRain, this.profile.rainIntensity, this.profile.rainIntensity > 0);
    this.configurePool(this.impacts, this.profile.rainIntensity, this.profile.rainIntensity > 0);
    this.configurePool(this.mist, this.profile.mistIntensity, !isCalm && this.profile.mistIntensity > 0);
    this.configurePool(this.spray, this.profile.sprayIntensity, !isCalm && this.profile.sprayIntensity > 0);
    this.setPoolStyle(
      this.mist,
      isFog ? 1.08 : isWind ? 0.48 : 0.62,
      isFog ? 0.55 : isWind ? 0.62 : 0.85,
      isFog ? 0.9 : isWind ? 3.4 : 1.2,
    );
    this.setPoolStyle(
      this.spray,
      isWind ? 0.5 : 0.24,
      isWind ? 0.68 : 1,
      isWind ? 3.1 : 1,
    );
    this.lightningLayer.visible = this.profile.lightning;
    if (!this.profile.lightning) {
      this.lightningFlashRemaining = 0;
      this.lightningLight.intensity = 0;
      this.lightningLight.visible = false;
      this.setLightningBolts(0);
    } else {
      this.setLightningBolts(0);
    }
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
    this.updateRainPool(this.farRain, time, 0.94, 11.5, 23.5, 27, 5.2, 1.08);
    this.updateRainPool(this.rain, time, 1.18, 8.2, 16.5, 19, 3.6, 1.35);
  }

  private updateRainPool(
    pool: ParticlePool,
    time: number,
    fallRate: number,
    driftX: number,
    startY: number,
    fallDistance: number,
    driftZ: number,
    opacityScale: number,
  ): void {
    const count = pool.points.geometry.drawRange.count;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const fall = cycle(pool.phases[index]! + time * pool.speeds[index]! * fallRate);
      pool.positions[offset] = pool.origins[offset]! + fall * driftX;
      pool.positions[offset + 1] = startY - fall * fallDistance;
      pool.positions[offset + 2] = pool.origins[offset + 2]! - fall * driftZ;
      pool.opacities[index] = Math.min(1, (1 - fall) * opacityScale);
    }
    this.markUpdated(pool);
  }

  private updateMist(time: number): void {
    const count = this.mist.points.geometry.drawRange.count;
    const wind = this.profile.id === 'wind';
    const fog = this.profile.id === 'fog';
    const driftRate = wind ? 0.46 : fog ? 0.045 : 0.13;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const drift = cycle(this.mist.phases[index]! + time * this.mist.speeds[index]! * driftRate);
      this.mist.positions[offset] = (wind ? -34 : -24) + drift * (wind ? 68 : 48);
      this.mist.positions[offset + 1] = (fog ? 0.45 : 1.2)
        + this.mist.origins[offset + 1]! * (fog ? 0.34 : 0.52);
      this.mist.positions[offset + 2] = this.mist.origins[offset + 2]!
        - (wind ? drift * 7.5 : 0);
      this.mist.opacities[index] = Math.sin(Math.PI * drift) * (fog ? 0.95 : 0.82);
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
    this.lightningClock += delta;
    let crossedInterval = false;
    let interval = LIGHTNING_INTERVALS[this.lightningIntervalIndex]!;
    while (this.lightningClock >= interval) {
      this.lightningClock -= interval;
      this.lightningIntervalIndex = (this.lightningIntervalIndex + 1) % LIGHTNING_INTERVALS.length;
      crossedInterval = true;
      interval = LIGHTNING_INTERVALS[this.lightningIntervalIndex]!;
    }
    if (crossedInterval) {
      this.prepareLightningStrike();
      this.lightningFlashRemaining = LIGHTNING_FLASH_DURATION;
    }

    if (this.lightningFlashRemaining <= 0) {
      this.lightningLight.intensity = 0;
      this.lightningLight.visible = false;
      this.setLightningBolts(0);
      return;
    }
    const flashRatio = this.lightningFlashRemaining / LIGHTNING_FLASH_DURATION;
    const keyedFlash = flashRatio > 0.72
      ? 1
      : flashRatio > 0.52
        ? 0.18
        : flashRatio > 0.2
          ? 0.78
          : 0.24;
    this.lightningLight.visible = true;
    this.lightningLight.intensity = 1.9 * keyedFlash;
    this.setLightningBolts(keyedFlash);
    this.lightningFlashRemaining = Math.max(0, this.lightningFlashRemaining - delta);
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
      bolt.line.visible = opacity > 0 && activeSlot >= 0;
      bolt.line.material.opacity = activeSlot >= 0
        ? opacity * (activeSlot === 0 ? 1 : 0.68)
        : 0;
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
    const line = this.lightningBolts[index]!.line;
    const angle = this.lightningRandom() * Math.PI * 2;
    const radius = 22 + this.lightningRandom() * 18;
    const heightOffset = -1 + this.lightningRandom() * 3;
    const scale = 0.82 + this.lightningRandom() * 0.38;
    line.position.set(Math.sin(angle) * radius, heightOffset, Math.cos(angle) * radius);
    line.rotation.y = this.lightningRandom() * Math.PI * 2;
    line.scale.setScalar(scale);
  }

  private resetLightning(): void {
    this.lightningClock = 0;
    this.lightningIntervalIndex = 0;
    this.lightningFlashRemaining = 0;
    this.activeLightningBoltCount = 0;
    this.lightningLight.intensity = 0;
    this.lightningLight.visible = false;
    this.setLightningBolts(0);
  }
}
