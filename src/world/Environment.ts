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
import type { SkyPalette, SkyState } from './skyPalette';

const SPRAY_DROP_COUNT = 220;
const SPRAY_FIELD_WIDTH = 4;
const SPRAY_FIELD_LENGTH = 7;
const SPRAY_FIELD_HEIGHT = 2.2;
const SCAVENGE_SKY_STATE: Readonly<SkyState> = Object.freeze({
  weather: 'calm',
  phase: 'day',
  severity: 0,
});

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
  width: number,
  length: number,
  height: number,
  random: () => number,
): { points: Points<BufferGeometry, PointsMaterial>; positions: Float32Array } {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * width;
    positions[index * 3 + 1] = random() * height;
    positions[index * 3 + 2] = (random() - 0.5) * length;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return { points: new Points(geometry, new PointsMaterial()), positions };
}

export class Environment {
  private readonly spray: Points<BufferGeometry, PointsMaterial>;
  private readonly sprayPositions: Float32Array;
  private readonly sky: Skybox;
  private readonly keyLight: DirectionalLight;
  private readonly fillLight: HemisphereLight;
  private readonly fallbackBackground = new Color();
  private readonly atmosphereFog: FogExp2;
  private readonly previousBackground: Scene['background'];
  private readonly previousFog: Scene['fog'];
  private disposed = false;

  get atmosphere(): Readonly<SkyPalette> { return this.sky.palette; }

  constructor(
    private readonly scene: Scene,
    moonTexture: Texture,
    random: () => number = Math.random,
  ) {
    this.previousBackground = scene.background;
    this.previousFog = scene.fog;
    this.sky = new Skybox(scene, SCAVENGE_SKY_STATE, moonTexture);
    const atmosphere = this.sky.palette;
    this.fallbackBackground.copy(atmosphere.horizonColor);
    this.atmosphereFog = new FogExp2(atmosphere.fogColor, atmosphere.fogDensity);
    scene.background = this.fallbackBackground;
    scene.fog = this.atmosphereFog;

    this.fillLight = new HemisphereLight(
      atmosphere.ambientLightColor,
      0x182226,
      atmosphere.ambientLightIntensity,
    );
    this.keyLight = new DirectionalLight(
      atmosphere.keyLightColor,
      atmosphere.keyLightIntensity,
    );
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

    const sprayField = particleField(
      SPRAY_DROP_COUNT,
      SPRAY_FIELD_WIDTH,
      SPRAY_FIELD_LENGTH,
      SPRAY_FIELD_HEIGHT,
      random,
    );
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
    sprayCenter: Vector3,
    reducedMotion: boolean,
  ): void {
    if (this.disposed) return;
    const spraySpeed = reducedMotion ? 0.5 : 1.3 + sinking.progress;
    for (let index = 0; index < SPRAY_DROP_COUNT; index += 1) {
      const offset = index * 3 + 1;
      this.sprayPositions[offset] = (
        this.sprayPositions[offset]! + delta * spraySpeed
      ) % SPRAY_FIELD_HEIGHT;
    }
    (this.spray.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.spray.position.set(sprayCenter.x, 0, sprayCenter.z);

    this.sky.resetTransient();
    const atmosphere = this.sky.update(
      delta,
      SCAVENGE_SKY_STATE,
      cameraPosition,
    );
    this.fallbackBackground.copy(atmosphere.horizonColor);
    this.atmosphereFog.color.copy(atmosphere.fogColor);
    this.atmosphereFog.density = atmosphere.fogDensity;
    this.fillLight.color.copy(atmosphere.ambientLightColor);
    this.fillLight.intensity = atmosphere.ambientLightIntensity;
    this.keyLight.color.copy(atmosphere.keyLightColor);
    this.keyLight.intensity = atmosphere.keyLightIntensity;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.spray.geometry.dispose();
    this.spray.material.dispose();
    this.sky.dispose();
    this.scene.remove(this.spray, this.keyLight, this.fillLight);
    if (this.scene.background === this.fallbackBackground) {
      this.scene.background = this.previousBackground;
    }
    if (this.scene.fog === this.atmosphereFog) {
      this.scene.fog = this.previousFog;
    }
  }
}
