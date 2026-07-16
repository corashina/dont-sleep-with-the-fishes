import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Points,
  PointsMaterial,
  Scene,
  Texture,
  Vector3,
} from 'three';
import type { SinkingState } from '../game/sinking';
import { Skybox } from './Skybox';
import type { SkyPalette } from './skyPalette';

const RAIN_DROP_COUNT = 900;
const SPRAY_DROP_COUNT = 220;

const SCAVENGE_SHADOW_CONFIG = Object.freeze({
  mapSize: 2048,
  left: -24,
  right: 24,
  top: 24,
  bottom: -24,
  near: 0.5,
  far: 80,
  bias: -0.0005,
  normalBias: 0.03,
});

function particleField(
  count: number,
  spread: number,
  height: number,
): { points: Points<BufferGeometry, PointsMaterial>; positions: Float32Array } {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * spread;
    positions[index * 3 + 1] = Math.random() * height;
    positions[index * 3 + 2] = (Math.random() - 0.5) * spread;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return { points: new Points(geometry, new PointsMaterial()), positions };
}

export class Environment {
  private readonly rain: Points<BufferGeometry, PointsMaterial>;
  private readonly rainPositions: Float32Array;
  private readonly spray: Points<BufferGeometry, PointsMaterial>;
  private readonly sprayPositions: Float32Array;
  private readonly sky: Skybox;
  private readonly keyLight: DirectionalLight;
  private readonly fillLight: HemisphereLight;
  private readonly fallbackBackground = new Color(0x27343b);
  private readonly stormFog = new FogExp2(0x27343b, 0.018);
  private readonly previousBackground: Scene['background'];
  private readonly previousFog: Scene['fog'];
  private disposed = false;

  get atmosphere(): Readonly<SkyPalette> { return this.sky.palette; }

  constructor(private readonly scene: Scene, moonTexture: Texture) {
    this.previousBackground = scene.background;
    this.previousFog = scene.fog;
    scene.background = this.fallbackBackground;
    scene.fog = this.stormFog;
    this.sky = new Skybox(
      scene,
      { weather: 'squall', phase: 'day', severity: 0 },
      moonTexture,
    );

    this.fillLight = new HemisphereLight(0x8fa0a1, 0x182226, 1.2);
    this.keyLight = new DirectionalLight(0xc7c0aa, 2.1);
    this.keyLight.position.set(-12, 18, 8);
    this.keyLight.castShadow = true;
    const shadow = this.keyLight.shadow;
    const shadowCamera = shadow.camera;
    shadow.mapSize.set(
      SCAVENGE_SHADOW_CONFIG.mapSize,
      SCAVENGE_SHADOW_CONFIG.mapSize,
    );
    shadowCamera.left = SCAVENGE_SHADOW_CONFIG.left;
    shadowCamera.right = SCAVENGE_SHADOW_CONFIG.right;
    shadowCamera.top = SCAVENGE_SHADOW_CONFIG.top;
    shadowCamera.bottom = SCAVENGE_SHADOW_CONFIG.bottom;
    shadowCamera.near = SCAVENGE_SHADOW_CONFIG.near;
    shadowCamera.far = SCAVENGE_SHADOW_CONFIG.far;
    shadow.bias = SCAVENGE_SHADOW_CONFIG.bias;
    shadow.normalBias = SCAVENGE_SHADOW_CONFIG.normalBias;
    shadowCamera.updateProjectionMatrix();
    scene.add(this.fillLight, this.keyLight);

    const rainField = particleField(RAIN_DROP_COUNT, 60, 30);
    this.rain = rainField.points;
    this.rainPositions = rainField.positions;
    this.rain.material.setValues({
      color: 0xa7b3b2,
      size: 0.045,
      transparent: true,
      opacity: 0.42,
    });
    this.rain.name = 'rain';
    scene.add(this.rain);

    const sprayField = particleField(SPRAY_DROP_COUNT, 18, 2.2);
    this.spray = sprayField.points;
    this.sprayPositions = sprayField.positions;
    this.spray.material.setValues({
      color: 0xc0c5bc,
      size: 0.09,
      transparent: true,
      opacity: 0.28,
    });
    this.spray.name = 'sea-spray';
    scene.add(this.spray);

  }

  update(
    delta: number,
    sinking: SinkingState,
    cameraPosition: Vector3,
    reducedMotion: boolean,
  ): void {
    if (this.disposed) return;
    const rainSpeed = reducedMotion ? 8 : 15 + sinking.progress * 8;
    for (let index = 0; index < RAIN_DROP_COUNT; index += 1) {
      const offset = index * 3 + 1;
      this.rainPositions[offset] = (this.rainPositions[offset]! - delta * rainSpeed + 30) % 30;
    }
    (this.rain.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.rain.position.set(cameraPosition.x, 0, cameraPosition.z);

    const spraySpeed = reducedMotion ? 0.5 : 1.3 + sinking.progress;
    for (let index = 0; index < SPRAY_DROP_COUNT; index += 1) {
      const offset = index * 3 + 1;
      this.sprayPositions[offset] = (this.sprayPositions[offset]! + delta * spraySpeed) % 2.2;
    }
    (this.spray.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.spray.position.set(4.5, 0, -5.8);

    this.sky.resetTransient();
    const atmosphere = this.sky.update(
      delta,
      { weather: 'squall', phase: 'day', severity: sinking.progress },
      cameraPosition,
    );
    this.fallbackBackground.copy(atmosphere.horizonColor);
    this.stormFog.color.copy(atmosphere.fogColor);
    this.stormFog.density = atmosphere.fogDensity;
    this.fillLight.color.copy(atmosphere.ambientLightColor);
    this.fillLight.intensity = atmosphere.ambientLightIntensity;
    this.keyLight.color.copy(atmosphere.keyLightColor);
    this.keyLight.intensity = atmosphere.keyLightIntensity;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    this.spray.geometry.dispose();
    this.spray.material.dispose();
    this.sky.dispose();
    this.scene.remove(this.rain, this.spray, this.keyLight, this.fillLight);
    if (this.scene.background === this.fallbackBackground) this.scene.background = this.previousBackground;
    if (this.scene.fog === this.stormFog) this.scene.fog = this.previousFog;
  }
}
