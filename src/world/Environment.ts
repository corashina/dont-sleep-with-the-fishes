import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
} from 'three';
import type { SinkingState } from '../game/sinking';

const RAIN_DROP_COUNT = 900;
const SPRAY_DROP_COUNT = 220;

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
  private readonly clouds = new Group();
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

    for (let index = 0; index < 7; index += 1) {
      const cloud = new Mesh(
        new PlaneGeometry(26 + index * 3, 5 + (index % 3) * 2),
        new MeshBasicMaterial({
          color: 0x4b565a,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
        }),
      );
      cloud.position.set(-60 + index * 20, 22 + (index % 2) * 4, -42 - (index % 3) * 12);
      cloud.rotation.x = -0.22;
      this.clouds.add(cloud);
    }
    this.clouds.name = 'storm-clouds';
    scene.add(this.clouds);
  }

  update(
    delta: number,
    sinking: SinkingState,
    cameraX: number,
    cameraZ: number,
    reducedMotion: boolean,
  ): void {
    if (this.disposed) return;
    const rainSpeed = reducedMotion ? 8 : 15 + sinking.progress * 8;
    for (let index = 0; index < RAIN_DROP_COUNT; index += 1) {
      const offset = index * 3 + 1;
      this.rainPositions[offset] = (this.rainPositions[offset]! - delta * rainSpeed + 30) % 30;
    }
    (this.rain.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.rain.position.set(cameraX, 0, cameraZ);

    const spraySpeed = reducedMotion ? 0.5 : 1.3 + sinking.progress;
    for (let index = 0; index < SPRAY_DROP_COUNT; index += 1) {
      const offset = index * 3 + 1;
      this.sprayPositions[offset] = (this.sprayPositions[offset]! + delta * spraySpeed) % 2.2;
    }
    (this.spray.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.spray.position.set(4.5, 0, -5.8);
    this.clouds.position.x = (
      (this.clouds.position.x + delta * (reducedMotion ? 0.3 : 0.9) + 70) % 140
    ) - 70;

    this.stormFog.density = 0.018 + sinking.progress * 0.009;
    this.keyLight.intensity = 2.1 - sinking.progress * 0.45;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    this.spray.geometry.dispose();
    this.spray.material.dispose();
    this.clouds.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      if (object.material instanceof MeshBasicMaterial) object.material.dispose();
    });
    this.scene.remove(this.rain, this.spray, this.clouds, this.keyLight, this.fillLight);
    if (this.scene.background === this.stormBackground) this.scene.background = this.previousBackground;
    if (this.scene.fog === this.stormFog) this.scene.fog = this.previousFog;
  }
}
