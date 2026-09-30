import {
  AdditiveBlending,
  type BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { createLifeboat } from '../world/Lifeboat';
import type { LifeboatAssets } from '../world/LifeboatAssets';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import type { MenuSceneComponent } from './MenuSceneComponent';
import { MENU_SURFACE_HEIGHT } from './UnderwaterSurface';

export const MENU_LIFEBOAT_POSITION = [5.4, MENU_SURFACE_HEIGHT - 0.12, -12.5] as const;
const MENU_LIFEBOAT_YAW = 1.32;
const LINE_ANCHOR = [4.6, MENU_SURFACE_HEIGHT - 0.04, -10.7] as const;
const LINE_LENGTH = 6.4;

const WATERLINE_VERTEX_SHADER = `
  varying vec2 vLocal;

  void main() {
    vLocal = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Light gathers where the hull breaks the surface, then spreads in slow rings.
const WATERLINE_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vLocal;

  void main() {
    vec2 hull = (vLocal - vec2(0.0, -0.3)) / vec2(1.72, 2.82);
    float distance = length(hull) - 1.0;
    float contact = exp(-abs(distance) * 16.0);
    float outside = max(distance, 0.0);
    float rings = pow(0.5 + 0.5 * sin(outside * 26.0 - uTime * 1.6), 6.0) * exp(-outside * 3.2);
    float alpha = (contact * 0.85 + rings * 0.4) * step(-0.08, distance);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// The player's lifeboat drifts overhead. A baited line hangs into the menu.
export class MenuSurfaceLifeboat implements MenuSceneComponent {
  readonly root = new Group();
  private readonly boat: Group;
  private readonly line = new Group();
  private readonly bait = new Group();
  private readonly waterline: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private disposed = false;

  constructor(assets: LifeboatAssets) {
    this.root.name = 'menu:surface-lifeboat';
    this.boat = createLifeboat(assets).root;
    this.boat.name = 'menu:surface-lifeboat-hull';
    this.boat.position.set(...MENU_LIFEBOAT_POSITION);
    this.boat.rotation.y = MENU_LIFEBOAT_YAW;
    // Let one oar trail in the water, as a tired rower would.
    const oar = this.boat.getObjectByName('paddle-starboard');
    if (!oar) throw new Error('Menu lifeboat requires the starboard paddle');
    oar.position.y -= 0.12;
    oar.rotateY(-0.42);

    this.waterline = new Mesh(
      new PlaneGeometry(7.5, 9.5).rotateX(-Math.PI / 2),
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new Color(0xbfeeea) } },
        vertexShader: WATERLINE_VERTEX_SHADER,
        fragmentShader: WATERLINE_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        fog: false,
      }),
    );
    this.waterline.name = 'menu:surface-lifeboat-waterline';
    this.waterline.position.y = MENU_SURFACE_HEIGHT - MENU_LIFEBOAT_POSITION[1];
    this.boat.add(this.waterline);
    this.boat.traverse((object) => {
      object.castShadow = false;
      object.receiveShadow = false;
    });

    this.line.name = 'menu:fishing-line';
    this.line.position.set(...LINE_ANCHOR);
    this.buildLine();

    this.root.add(this.boat, this.line);
    collectMeshResources(this.root, this.geometries, this.materials);
  }

  setTime(time: number): void {
    const boat = this.boat;
    boat.position.y = MENU_LIFEBOAT_POSITION[1] + Math.sin(time * 0.62) * 0.07;
    boat.rotation.x = Math.sin(time * 0.51 + 0.8) * 0.035;
    boat.rotation.z = Math.sin(time * 0.43) * 0.05;
    boat.rotation.y = MENU_LIFEBOAT_YAW + Math.sin(time * 0.07) * 0.06;
    this.line.position.y = LINE_ANCHOR[1] + Math.sin(time * 0.62 - 0.4) * 0.06;
    this.line.rotation.z = Math.sin(time * 0.38) * 0.035;
    this.line.rotation.x = Math.sin(time * 0.29 + 1.3) * 0.028;
    this.bait.rotation.y = time * 0.35;
    this.bait.rotation.z = Math.sin(time * 1.7) * 0.18;
    this.waterline.material.uniforms.uTime!.value = time;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    // The lifeboat textures belong to the shared lifeboat assets.
    disposeResourceSets(this.geometries, this.materials);
  }

  private buildLine(): void {
    const lineMaterial = new MeshBasicMaterial({
      color: 0xd8e6e0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const line = new Mesh(new CylinderGeometry(0.009, 0.009, LINE_LENGTH, 4, 1, true), lineMaterial);
    line.name = 'menu:fishing-line-thread';
    line.position.y = -LINE_LENGTH / 2;

    const floatRed = new MeshStandardMaterial({ color: 0xb8432f, roughness: 0.55 });
    const floatWhite = new MeshStandardMaterial({ color: 0xe6ddc8, roughness: 0.6 });
    const floatLower = new Mesh(new SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), floatRed);
    floatLower.name = 'menu:fishing-float-lower';
    const floatUpper = new Mesh(new SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), floatWhite);
    floatUpper.name = 'menu:fishing-float-upper';

    const iron = new MeshStandardMaterial({ color: 0x55544e, roughness: 0.5, metalness: 0.7 });
    const sinker = new Mesh(new SphereGeometry(0.07, 10, 6), iron);
    sinker.name = 'menu:fishing-sinker';
    sinker.scale.set(1, 1.35, 1);
    sinker.position.y = -LINE_LENGTH + 0.55;

    this.bait.name = 'menu:fishing-bait';
    this.bait.position.y = -LINE_LENGTH;
    const hook = new Mesh(new TorusGeometry(0.1, 0.013, 5, 14, Math.PI * 1.35), iron);
    hook.name = 'menu:fishing-hook';
    hook.rotation.z = Math.PI * 0.82;
    const shank = new Mesh(new CylinderGeometry(0.013, 0.013, 0.22, 5), iron);
    shank.name = 'menu:fishing-hook-shank';
    shank.position.set(0.1, 0.1, 0);
    const worm = new Mesh(
      new TubeGeometry(new CatmullRomCurve3([
        new Vector3(0.11, 0.17, 0.02),
        new Vector3(0.02, 0.1, 0.07),
        new Vector3(-0.1, 0.02, 0.02),
        new Vector3(-0.06, -0.1, -0.05),
        new Vector3(0.06, -0.12, 0.0),
        new Vector3(0.1, -0.24, 0.06),
        new Vector3(0.02, -0.34, 0.1),
      ]), 28, 0.028, 6, false),
      new MeshStandardMaterial({ color: 0xc27468, roughness: 0.48 }),
    );
    worm.name = 'menu:fishing-worm';
    this.bait.add(hook, shank, worm);

    this.line.add(line, floatLower, floatUpper, sinker, this.bait);
  }
}
