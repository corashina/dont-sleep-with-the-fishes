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

export const MENU_SURFACE_HEIGHT = 32;

const SURFACE_VERTEX_SHADER = `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

// One backdrop draws the water column and the underside of the sea surface.
// Rays refract through moving waves. Flat rays reflect the dark water below.
const SURFACE_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uSurfaceHeight;
  uniform float uFogDensity;
  uniform vec3 uFogColor;
  uniform vec3 uDeepColor;
  uniform vec3 uMirrorColor;
  uniform vec3 uWindowColor;
  uniform vec3 uSkyColor;
  uniform vec3 uSunDirection;
  uniform float uWindowIndex;
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

  // Slope of one travelling wave. Waves finer than a pixel fade out.
  vec2 waveSlope(vec2 point, vec2 direction, float frequency, float amplitude,
    float speed, float footprint) {
    float phase = dot(point, direction) * frequency + uTime * speed;
    float fade = 1.0 - smoothstep(0.25, 0.9, frequency * footprint);
    return direction * cos(phase) * frequency * amplitude * fade;
  }

  // A soft net of bright crests where each wave focuses the light.
  float crestNet(vec2 point) {
    vec2 warped = point;
    float net = 0.0;
    for (int index = 0; index < 2; index += 1) {
      float layer = float(index);
      warped += vec2(
        sin(warped.y * 0.9 + uTime * 0.5 + layer * 1.7),
        cos(warped.x * 0.8 - uTime * 0.43 + layer * 2.3)
      ) * 0.5;
      float ridge = abs(sin(warped.x * 1.1 + layer) + sin(warped.y * 1.25 - layer));
      net += 0.1 / (0.1 + ridge * ridge);
    }
    return net * 0.5;
  }

  void main() {
    vec3 direction = normalize(vWorldPosition - cameraPosition);
    float upward = direction.y;
    float below = smoothstep(0.0, -0.45, upward);
    vec3 color = mix(uFogColor, uDeepColor, below);
    if (upward > 0.0) {
      float distance = (uSurfaceHeight - cameraPosition.y) / max(upward, 0.001);
      vec2 surfacePoint = cameraPosition.xz + direction.xz * distance;
      float footprint = length(fwidth(surfacePoint));
      vec2 swellPoint = surfacePoint + vec2(
        valueNoise(surfacePoint * 0.05 + uTime * 0.02),
        valueNoise(surfacePoint * 0.05 - uTime * 0.017 + 9.0)
      ) * 6.0;
      vec2 slope = waveSlope(swellPoint, vec2(0.8, 0.6), 0.21, 0.55, 0.62, footprint);
      slope += waveSlope(swellPoint, vec2(-0.45, 0.89), 0.37, 0.28, 0.81, footprint);
      slope += waveSlope(swellPoint, vec2(0.97, -0.24), 0.66, 0.13, 1.07, footprint);
      slope += waveSlope(swellPoint, vec2(-0.71, -0.7), 1.13, 0.065, 1.42, footprint);
      slope += waveSlope(swellPoint, vec2(0.2, 0.98), 1.9, 0.034, 1.9, footprint);
      slope += waveSlope(swellPoint, vec2(-0.93, 0.36), 3.3, 0.016, 2.6, footprint);
      vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

      // Water to air. Snell's window shows the sky. Outside it, the water reflects.
      vec3 refracted = refract(direction, -normal, uWindowIndex);
      float cosine = dot(direction, normal);
      float escape = 1.0 - uWindowIndex * uWindowIndex * (1.0 - cosine * cosine);
      // Fresnel loss grows near the window rim, so the sky fades into the reflection.
      float transmit = smoothstep(0.0, 0.16, escape);
      float net = crestNet(swellPoint * 0.3) * (1.0 - smoothstep(0.2, 1.0, footprint));
      float depthShade = valueNoise(swellPoint * 0.08) * 0.35;
      vec3 reflection = uMirrorColor * (0.7 + depthShade + net * 0.55);
      float skyHeight = clamp(refracted.y, 0.0, 1.0);
      vec3 sky = mix(uWindowColor, uSkyColor, smoothstep(0.1, 0.9, skyHeight));
      float sun = max(dot(refracted, uSunDirection), 0.0);
      sky += uSkyColor * (pow(sun, 18.0) * 1.1 + pow(sun, 260.0) * 2.5);
      vec3 surface = mix(reflection, sky * (0.8 + net * 0.45), transmit);
      float sunGlow = pow(max(dot(direction, uSunDirection), 0.0), 6.0);
      surface += uWindowColor * sunGlow * (0.45 + net * 0.6);
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
    const geometry = new SphereGeometry(400, 64, 32);
    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSurfaceHeight: { value: MENU_SURFACE_HEIGHT },
        uFogDensity: { value: fogDensity },
        uFogColor: { value: fogColor },
        uDeepColor: { value: new Color(0x03141b) },
        uMirrorColor: { value: new Color(0x0d3c47) },
        uWindowColor: { value: new Color(0x5fb0b4) },
        uSkyColor: { value: new Color(0xbfe8e2) },
        uSunDirection: { value: new Vector3(0.24, 0.5, -0.83).normalize() },
        // A low index widens Snell's window so its rim shows in the menu frame.
        uWindowIndex: { value: 1.12 },
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
