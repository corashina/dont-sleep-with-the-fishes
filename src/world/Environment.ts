import * as THREE from 'three';

interface Palette {
  fog: number;
  sky: number;
  light: number;
  lightInt: number;
  ambient: number;
  density: number;
  lanternInt: number;
}

const DAY: Palette = { fog: 0x9fd6e6, sky: 0x8fc7d8, light: 0xfff2d0, lightInt: 1.1, ambient: 0x5577aa, density: 0.012, lanternInt: 0 };
const NIGHT: Palette = { fog: 0x05070d, sky: 0x0a1326, light: 0x9fb4d8, lightInt: 0.35, ambient: 0x223355, density: 0.06, lanternInt: 1.6 };
const BLEND_SECONDS = 2;

export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly ambient: THREE.HemisphereLight;
  readonly lantern: THREE.PointLight;
  private sky: THREE.Mesh;
  private from: Palette = DAY;
  private to: Palette = DAY;
  private blend = 1;

  constructor(private scene: THREE.Scene) {
    this.scene.fog = new THREE.FogExp2(DAY.fog, DAY.density);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(100, 24, 16),
      new THREE.MeshBasicMaterial({ color: DAY.sky, side: THREE.BackSide, fog: false }),
    );
    this.scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(DAY.light, DAY.lightInt);
    this.sun.position.set(5, 10, 4);
    this.scene.add(this.sun);

    this.ambient = new THREE.HemisphereLight(DAY.ambient, 0x202030, 0.6);
    this.scene.add(this.ambient);

    this.lantern = new THREE.PointLight(0xffb066, 0, 8, 2);
    this.lantern.position.set(0, 1.2, 0);
    this.scene.add(this.lantern);
  }

  setTimeOfDay(t: 'day' | 'night'): void {
    const target = t === 'day' ? DAY : NIGHT;
    if (target === this.to) return;
    this.from = this.current();
    this.to = target;
    this.blend = 0;
  }

  private current(): Palette {
    if (this.blend >= 1) return this.to;
    return this.lerpPalette(this.from, this.to, this.blend);
  }

  private lerpColor(a: number, b: number, k: number): number {
    return new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
  }

  private mix(a: number, b: number, k: number): number {
    return a + (b - a) * k;
  }

  private lerpPalette(a: Palette, b: Palette, k: number): Palette {
    return {
      fog: this.lerpColor(a.fog, b.fog, k),
      sky: this.lerpColor(a.sky, b.sky, k),
      light: this.lerpColor(a.light, b.light, k),
      ambient: this.lerpColor(a.ambient, b.ambient, k),
      lightInt: this.mix(a.lightInt, b.lightInt, k),
      density: this.mix(a.density, b.density, k),
      lanternInt: this.mix(a.lanternInt, b.lanternInt, k),
    };
  }

  update(dt: number): void {
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / BLEND_SECONDS);
    const p = this.current();
    (this.scene.fog as THREE.FogExp2).color.setHex(p.fog);
    (this.scene.fog as THREE.FogExp2).density = p.density;
    (this.sky.material as THREE.MeshBasicMaterial).color.setHex(p.sky);
    this.sun.color.setHex(p.light);
    this.sun.intensity = p.lightInt;
    this.ambient.color.setHex(p.ambient);
    this.lantern.intensity = p.lanternInt;
  }
}
