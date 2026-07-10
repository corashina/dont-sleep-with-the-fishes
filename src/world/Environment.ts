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
} from 'three';
import type { SinkingState } from '../game/sinking';

const RAIN_DROP_COUNT = 900;

export class Environment {
  private readonly rain: Points<BufferGeometry, PointsMaterial>;
  private readonly positions: Float32Array;
  private readonly keyLight: DirectionalLight;
  private readonly fillLight: HemisphereLight;
  private readonly stormBackground = new Color(0x27343b);
  private readonly stormFog = new FogExp2(0x27343b, 0.018);
  private readonly previousBackground: Scene['background'];
  private readonly previousFog: Scene['fog'];
  private disposed = false;

  constructor(private readonly scene: Scene) {
    this.previousBackground = scene.background;
    this.previousFog = scene.fog;
    scene.background = this.stormBackground;
    scene.fog = this.stormFog;

    this.fillLight = new HemisphereLight(0x8fa0a1, 0x182226, 1.2);
    this.keyLight = new DirectionalLight(0xc7c0aa, 2.1);
    this.keyLight.position.set(-12, 18, 8);
    this.keyLight.castShadow = true;
    scene.add(this.fillLight, this.keyLight);

    this.positions = new Float32Array(RAIN_DROP_COUNT * 3);
    for (let index = 0; index < RAIN_DROP_COUNT; index += 1) {
      this.positions[index * 3] = (Math.random() - 0.5) * 60;
      this.positions[index * 3 + 1] = Math.random() * 30;
      this.positions[index * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    const material = new PointsMaterial({
      color: 0xa7b3b2,
      size: 0.045,
      transparent: true,
      opacity: 0.42,
    });
    this.rain = new Points(geometry, material);
    this.rain.name = 'rain';
    scene.add(this.rain);
  }

  update(
    delta: number,
    sinking: SinkingState,
    cameraX: number,
    cameraZ: number,
    reducedMotion: boolean,
  ): void {
    if (this.disposed) return;
    const speed = reducedMotion ? 8 : 15 + sinking.progress * 8;
    for (let index = 0; index < RAIN_DROP_COUNT; index += 1) {
      const offset = index * 3 + 1;
      this.positions[offset] = (this.positions[offset]! - delta * speed + 30) % 30;
    }
    (this.rain.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.rain.position.set(cameraX, 0, cameraZ);
    this.stormFog.density = 0.018 + sinking.progress * 0.009;
    this.keyLight.intensity = 2.1 - sinking.progress * 0.45;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    this.scene.remove(this.rain, this.keyLight, this.fillLight);
    if (this.scene.background === this.stormBackground) this.scene.background = this.previousBackground;
    if (this.scene.fog === this.stormFog) this.scene.fog = this.previousFog;
  }
}
