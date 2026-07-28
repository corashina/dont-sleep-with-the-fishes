import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Scene,
  Texture,
  Vector3,
} from 'three';
import {
  presentationWeatherProfile,
  type PresentationWeatherId,
  type PresentationWeatherProfile,
} from '../weather/presentationWeather';
import { alignDirectionalLightWithSun } from './celestialLight';
import { Skybox } from './Skybox';
import { WeatherEffects } from './WeatherEffects';
import type { SkyPalette, SkyState } from './skyPalette';

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
  private readonly weatherEffects: WeatherEffects;
  private readonly previousBackground: Scene['background'];
  private readonly previousFog: Scene['fog'];
  private readonly skyState: SkyState = {
    weather: 'calm',
    phase: 'day',
    severity: 0,
  };
  private weatherProfileValue = presentationWeatherProfile('calm');
  private disposed = false;

  get atmosphere(): Readonly<SkyPalette> { return this.sky.palette; }
  get weatherProfile(): Readonly<PresentationWeatherProfile> {
    return this.weatherProfileValue;
  }

  constructor(
    private readonly scene: Scene,
    moonTexture: Texture,
  ) {
    this.previousBackground = scene.background;
    this.previousFog = scene.fog;
    this.sky = new Skybox(scene, this.skyState, moonTexture);
    this.weatherEffects = new WeatherEffects(scene);
    const atmosphere = this.sky.palette;
    this.fallbackBackground.copy(atmosphere.horizonColor);
    this.atmosphereFog = new FogExp2(
      atmosphere.fogColor,
      atmosphere.fogDensity * this.weatherProfileValue.fogDensityScale,
    );
    scene.background = this.fallbackBackground;
    scene.fog = this.atmosphereFog;

    this.fillLight = new HemisphereLight(
      atmosphere.ambientLightColor,
      0x182226,
      atmosphere.ambientLightIntensity * this.weatherProfileValue.lightIntensityScale,
    );
    this.keyLight = new DirectionalLight(
      atmosphere.keyLightColor,
      atmosphere.keyLightIntensity * this.weatherProfileValue.lightIntensityScale,
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

  setWeather(id: PresentationWeatherId): void {
    if (this.disposed) return;
    this.weatherProfileValue = presentationWeatherProfile(id);
    this.skyState.weather = this.weatherProfileValue.skyWeather;
    this.weatherEffects.setWeather(id);
  }

  update(
    time: number,
    delta: number,
    cameraPosition: Vector3,
  ): void {
    if (this.disposed) return;
    this.sky.resetTransient();
    const atmosphere = this.sky.update(
      delta,
      this.skyState,
      cameraPosition,
    );
    const profile = this.weatherProfileValue;
    this.fallbackBackground.copy(atmosphere.horizonColor);
    this.atmosphereFog.color.copy(atmosphere.fogColor);
    this.atmosphereFog.density = atmosphere.fogDensity * profile.fogDensityScale;
    this.fillLight.color.copy(atmosphere.ambientLightColor);
    this.fillLight.intensity = atmosphere.ambientLightIntensity * profile.lightIntensityScale;
    this.keyLight.color.copy(atmosphere.keyLightColor);
    this.keyLight.intensity = atmosphere.keyLightIntensity * profile.lightIntensityScale;
    this.weatherEffects.update(time, delta, cameraPosition);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.weatherEffects.dispose();
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
