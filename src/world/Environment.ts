import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Scene,
  Texture,
  Vector3,
} from 'three';
import { alignDirectionalLightWithSun } from './celestialLight';
import { Skybox } from './Skybox';
import type { SkyPalette, SkyState } from './skyPalette';

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

export class Environment {
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
    alignDirectionalLightWithSun(this.keyLight, 24);
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
  }

  update(
    delta: number,
    cameraPosition: Vector3,
  ): void {
    if (this.disposed) return;
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
    this.sky.dispose();
    this.scene.remove(this.keyLight, this.fillLight);
    if (this.scene.background === this.fallbackBackground) {
      this.scene.background = this.previousBackground;
    }
    if (this.scene.fog === this.atmosphereFog) {
      this.scene.fog = this.previousFog;
    }
  }
}
