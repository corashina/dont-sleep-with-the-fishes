import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';

const OPACITY_WEIGHTS = [0.72, 0.9, 0.64, 0.78, 0.58] as const;

const LAYERS = Object.freeze([
  Object.freeze({ x: -4.4, y: 0.38, z: -7.5, width: 8.6, height: 0.9, rotation: -0.08 }),
  Object.freeze({ x: -0.8, y: 0.46, z: -9.9, width: 11.4, height: 1.1, rotation: 0.12 }),
  Object.freeze({ x: -8.1, y: 0.5, z: -12.2, width: 12.8, height: 1.2, rotation: -0.16 }),
  Object.freeze({ x: 2.2, y: 0.42, z: -14.4, width: 10.8, height: 1, rotation: 0.07 }),
  Object.freeze({ x: -9.4, y: 0.55, z: -17, width: 14.6, height: 1.3, rotation: 0.18 }),
] as const);

const COLORS = [0x789298, 0x68868d, 0x56777f, 0x6f8b91, 0x496b73] as const;
const SEEDS = [0.17, 0.39, 0.61, 0.83, 1.07] as const;

function createMaterial(color: number, seed: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: 0 },
      uSeed: { value: seed },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSeed;
      varying vec2 vUv;
      void main() {
        float sideFade = smoothstep(0.0, 0.18, vUv.x)
          * (1.0 - smoothstep(0.82, 1.0, vUv.x));
        float broadNoise = sin((vUv.x + uSeed) * 13.0)
          * sin((vUv.y - uSeed) * 9.0);
        float fineNoise = sin((vUv.x * 31.0 + vUv.y * 23.0) + uSeed * 17.0);
        float upperEdge = 0.58 + broadNoise * 0.12 + fineNoise * 0.04;
        float lowerFade = smoothstep(0.0, 0.16, vUv.y);
        float upperFade = 1.0 - smoothstep(upperEdge - 0.12, upperEdge + 0.2, vUv.y);
        float density = clamp(
          sideFade * lowerFade * upperFade * (0.82 + broadNoise * 0.1),
          0.0,
          1.0
        );
        gl_FragColor = vec4(uColor, density * uOpacity);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

export class SeaMistCurtain {
  readonly root = new Group();
  readonly layerCount = LAYERS.length;

  private readonly materials = COLORS.map((color, index) => (
    createMaterial(color, SEEDS[index]!)
  ));

  constructor(name: string) {
    this.root.name = name;
    for (let index = 0; index < LAYERS.length; index += 1) {
      const layer = LAYERS[index]!;
      const strip = new Mesh(
        new PlaneGeometry(layer.width, layer.height),
        this.materials[index]!,
      );
      strip.name = `${name}-layer-${index + 1}`;
      strip.position.set(layer.x, layer.y, layer.z);
      strip.rotation.set(0, layer.rotation, 0);
      strip.renderOrder = 2 + index;
      this.root.add(strip);
    }
    this.root.visible = false;
  }

  setOpacity(amount: number): void {
    for (let index = 0; index < this.materials.length; index += 1) {
      const opacity = amount * OPACITY_WEIGHTS[index]!;
      this.materials[index]!.uniforms.uOpacity!.value = opacity;
      this.materials[index]!.opacity = opacity;
    }
  }
}
