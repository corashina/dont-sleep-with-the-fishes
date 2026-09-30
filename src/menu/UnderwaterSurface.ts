import {
  BackSide,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { MenuSceneComponent } from './MenuSceneComponent';

export const MENU_SURFACE_HEIGHT = 22;

const SURFACE_VERTEX_SHADER = `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

// One backdrop draws the water column and the underside of the sea surface.
const SURFACE_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uSurfaceHeight;
  uniform float uFogDensity;
  uniform vec3 uFogColor;
  uniform vec3 uDeepColor;
  uniform vec3 uMirrorColor;
  uniform vec3 uWindowColor;
  uniform vec3 uSunDirection;
  varying vec3 vWorldPosition;

  float hash21(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), local.x),
      local.y
    );
  }

  float waveNet(vec2 point, float time) {
    vec2 warped = point;
    float net = 0.0;
    for (int index = 0; index < 3; index += 1) {
      float layer = float(index);
      warped += vec2(
        sin(warped.y * 0.9 + time * 0.55 + layer * 1.7),
        cos(warped.x * 0.8 - time * 0.47 + layer * 2.3)
      ) * 0.55;
      float ridge = abs(sin(warped.x * 1.1 + layer) + sin(warped.y * 1.25 - layer));
      net += 0.08 / (0.08 + ridge * ridge);
    }
    return net / 3.0;
  }

  void main() {
    vec3 direction = normalize(vWorldPosition - cameraPosition);
    float upward = direction.y;
    float below = smoothstep(0.0, -0.45, upward);
    vec3 color = mix(uFogColor, uDeepColor, below);
    if (upward > 0.0) {
      float distance = (uSurfaceHeight - cameraPosition.y) / max(upward, 0.001);
      vec2 surfacePoint = cameraPosition.xz + direction.xz * distance;
      float swell = valueNoise(surfacePoint * 0.06 + vec2(uTime * 0.03, -uTime * 0.02));
      float net = waveNet(surfacePoint * 0.32 + swell * 1.6, uTime);
      float window = smoothstep(0.26, 0.72, upward);
      float sun = pow(max(dot(direction, uSunDirection), 0.0), 7.0);
      vec3 mirror = uMirrorColor * (0.72 + swell * 0.5) + uWindowColor * net * 0.12;
      vec3 sky = uWindowColor * (0.62 + net * 0.62 + swell * 0.18);
      vec3 surface = mix(mirror, sky, window);
      surface += uWindowColor * sun * (0.55 + net * 0.9);
      float fogAmount = 1.0 - exp(-pow(uFogDensity * distance, 2.0));
      color = mix(surface, uFogColor, fogAmount);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class UnderwaterSurface implements MenuSceneComponent {
  readonly root = new Group();
  private readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  private disposed = false;

  constructor(fogColor: Color, fogDensity: number) {
    const geometry = new SphereGeometry(400, 48, 24);
    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSurfaceHeight: { value: MENU_SURFACE_HEIGHT },
        uFogDensity: { value: fogDensity },
        uFogColor: { value: fogColor },
        uDeepColor: { value: new Color(0x03141b) },
        uMirrorColor: { value: new Color(0x0d3c47) },
        uWindowColor: { value: new Color(0x6fbcc0) },
        uSunDirection: { value: new Vector3(0.24, 0.5, -0.83).normalize() },
      },
      vertexShader: SURFACE_VERTEX_SHADER,
      fragmentShader: SURFACE_FRAGMENT_SHADER,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'menu:water-surface-backdrop';
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.root.name = 'menu:water-surface';
    this.root.add(this.mesh);
  }

  setTime(time: number): void {
    this.mesh.material.uniforms.uTime!.value = time;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
