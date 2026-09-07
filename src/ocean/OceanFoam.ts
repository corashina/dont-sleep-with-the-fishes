import {
  Color,
  LinearFilter,
  Matrix4,
  NoBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { MAX_OCEAN_EXCLUSIONS, type OceanShaderUniforms } from './oceanShader';

const SIZE = 512;
const MAX_STEP = 0.1;

const FRAGMENT_SHADER = `
  uniform sampler2D uPreviousFoam;
  uniform vec2 uFoamOrigin;
  uniform vec2 uPreviousOrigin;
  uniform float uFoamExtent;
  uniform float uStep;
  uniform float uFoamTime;
  uniform float uAmplitudeScale;
  uniform vec2 uDirections[4];
  uniform vec4 uParameters[4];
  uniform float uPhases[4];
  uniform vec2 uVortexCenter;
  uniform float uVortexRadius;
  uniform float uVortexDepression;
  uniform float uVortexTangentStrength;
  uniform float uVortexStrength;
  uniform int uExclusionCount;
  uniform mat4 uExclusionWorldToLocal[2];
  uniform vec4 uExclusionBounds[2];
  uniform vec4 uExclusionLowerBounds[2];
  uniform vec2 uExclusionTaperStarts[2];
  uniform vec2 uExclusionLowerTaperStarts[2];
  uniform float uExclusionMinimumLocalYs[2];
  uniform float uExclusionUpperLocalYs[2];
  uniform vec4 uHullMotion[2];
  varying vec2 vUv;

  float foamSourceHash(vec2 cell) {
    vec3 p = fract(vec3(cell.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float foamSourceNoise(vec2 world) {
    vec2 cell = floor(world);
    vec2 f = fract(world);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(foamSourceHash(cell), foamSourceHash(cell + vec2(1.0, 0.0)), f.x),
      mix(foamSourceHash(cell + vec2(0.0, 1.0)), foamSourceHash(cell + vec2(1.0)), f.x), f.y);
  }

  void main() {
    vec2 world = uFoamOrigin + (vUv - 0.5) * uFoamExtent;
    vec2 flow = vec2(0.0);
    float height = 0.0;
    // Horizontal Gerstner Jacobian: compression occurs when its determinant falls.
    vec3 jacobian = vec3(1.0, 1.0, 0.0);
    for (int i = 0; i < 4; i++) {
      vec2 direction = normalize(uDirections[i]);
      float amplitude = uParameters[i].x * uAmplitudeScale;
      float k = 6.28318530718 / uParameters[i].y;
      float phase = k * dot(direction, world) + uParameters[i].z * uFoamTime + uPhases[i];
      float horizontal = uParameters[i].w * amplitude * sin(phase);
      height += amplitude * sin(phase);
      jacobian -= horizontal * k * vec3(direction.x * direction.x,
        direction.y * direction.y, direction.x * direction.y);
      flow -= direction * horizontal * uParameters[i].z;
    }
    vec2 vortexDelta = world - uVortexCenter;
    float radius = length(vortexDelta);
    vec2 radial = vortexDelta / max(radius, 0.001);
    float envelope = 1.0 - smoothstep(0.0, max(uVortexRadius, 0.001), radius);
    envelope *= uVortexStrength;
    flow += (vec2(-radial.y, radial.x) * uVortexTangentStrength - radial * 0.35) * envelope;
    height -= uVortexDepression * envelope;

    vec2 previousUv = (world - flow * uStep - uPreviousOrigin) / uFoamExtent + 0.5;
    float previous = 0.0;
    if (all(greaterThanEqual(previousUv, vec2(0.0))) && all(lessThanEqual(previousUv, vec2(1.0)))) {
      previous = texture2D(uPreviousFoam, previousUv).r;
    }
    float compression = 1.0 - (jacobian.x * jacobian.y - jacobian.z * jacobian.z);
    float weather = smoothstep(0.7, 1.7, uAmplitudeScale);
    // Artistic breaking threshold: only the strongest converging crests leave patches.
    float patchMask = smoothstep(0.20, 0.72, foamSourceNoise(world * 0.42));
    float source = smoothstep(0.18, 0.34, compression) * weather
      * mix(0.35, 1.0, patchMask) * 1.35;

    for (int i = 0; i < 2; i++) {
      if (i >= uExclusionCount) break;
      vec3 local = (uExclusionWorldToLocal[i] * vec4(world.x, height, world.y, 1.0)).xyz;
      float minimumY = uExclusionMinimumLocalYs[i];
      float maximumY = uExclusionUpperLocalYs[i];
      if (local.y < minimumY || local.y > maximumY) continue;
      float progress = clamp((local.y - minimumY) / max(maximumY - minimumY, 0.0001), 0.0, 1.0);
      vec4 bounds = mix(uExclusionLowerBounds[i], uExclusionBounds[i], progress);
      vec2 taper = mix(uExclusionLowerTaperStarts[i], uExclusionTaperStarts[i], progress);
      float taperProgress = max(
        (taper.x - local.z) / max(taper.x - bounds.z, 0.001),
        (local.z - taper.y) / max(bounds.w - taper.y, 0.001));
      float halfWidth = (bounds.y - bounds.x) * 0.5
        * sqrt(max(0.0, 1.0 - pow(clamp(taperProgress, 0.0, 1.0), 2.0)));
      float edge = max(abs(local.x - (bounds.x + bounds.y) * 0.5) - halfWidth,
        max(bounds.z - local.z, local.z - bounds.w));
      float speed = length(uHullMotion[i].zw);
      float contact = (1.0 - smoothstep(0.08, 0.55, abs(edge)))
        * (0.10 * weather + min(speed * 0.25, 1.5));
      // The swept center deposits a trail which remains after the hull moves away.
      vec2 end = uHullMotion[i].xy;
      vec2 segment = uHullMotion[i].zw * uStep;
      vec2 start = end - segment;
      float along = clamp(dot(world - start, segment) / max(dot(segment, segment), 0.0001), 0.0, 1.0);
      float trail = (1.0 - smoothstep(0.20, 0.65, length(world - start - segment * along)))
        * min(speed * 0.18, 1.0);
      source += contact + trail;
    }
    // Exact integration of dF/dt = source * (1 - F) - decay * F.
    float rate = source + 0.32;
    float retained = exp(-rate * uStep);
    float foam = previous * retained + source / rate * (1.0 - retained);
    // Unbiased byte quantization prevents low foam values from surviving forever.
    float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uFoamTime * 19.19) * 43758.5453);
    foam = floor(clamp(foam, 0.0, 1.0) * 255.0 + noise) / 255.0;
    gl_FragColor = vec4(foam, 0.0, 0.0, 1.0);
  }
`;

/** A bounded world-space foam field. Allocate only for High water quality. */
export class OceanFoam {
  readonly origin = new Vector2();
  readonly extent = 128;
  private readTarget = this.createTarget();
  private writeTarget = this.createTarget();
  private readonly previousOrigin = new Vector2();
  private readonly nextOrigin = new Vector2();
  private readonly viewport = new Vector4();
  private readonly scissor = new Vector4();
  private readonly clearColor = new Color();
  private readonly inverse = new Matrix4();
  private readonly center = new Vector3();
  private readonly previousCenters = Array.from({ length: MAX_OCEAN_EXCLUSIONS }, () => new Vector2());
  private readonly hullMotion = Array.from({ length: MAX_OCEAN_EXCLUSIONS }, () => new Vector4());
  private readonly material: ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private lastTime: number | undefined;
  private previousCount = 0;
  private disposed = false;

  constructor(private readonly oceanUniforms: OceanShaderUniforms) {
    this.material = new ShaderMaterial({
      uniforms: {
        ...oceanUniforms,
        uPreviousFoam: { value: this.readTarget.texture },
        uFoamOrigin: { value: this.nextOrigin },
        uPreviousOrigin: { value: this.previousOrigin },
        uFoamExtent: { value: this.extent },
        uStep: { value: 0 },
        uFoamTime: { value: 0 },
        uHullMotion: { value: this.hullMotion },
      },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  get texture(): Texture {
    return this.readTarget.texture;
  }

  update(renderer: WebGLRenderer, time: number, origin: Vector2): void {
    if (!this.canUpdate(time, origin)) return;
    const elapsed = this.lastTime === undefined ? 0 : time - this.lastTime;
    const reset = this.needsReset(elapsed, origin);
    if (!reset && elapsed === 0 && origin.equals(this.origin)) return;
    const step = reset ? 0 : Math.min(elapsed, MAX_STEP);
    const target = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace();
    const mipLevel = renderer.getActiveMipmapLevel();
    const scissorTest = renderer.getScissorTest();
    const clearAlpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    const xrEnabled = renderer.xr.enabled;
    renderer.getViewport(this.viewport);
    renderer.getScissor(this.scissor);
    renderer.getClearColor(this.clearColor);
    this.nextOrigin.copy(origin);
    this.previousOrigin.copy(reset ? origin : this.origin);
    this.material.uniforms.uStep!.value = step;
    this.material.uniforms.uFoamTime!.value = time;
    this.updateHullMotion(elapsed, reset);
    try {
      renderer.xr.enabled = false;
      renderer.autoClear = false;
      renderer.setScissorTest(false);
      if (reset) {
        renderer.setClearColor(0x000000, 0);
        renderer.setRenderTarget(this.readTarget);
        renderer.clear(true, false, false);
        renderer.setRenderTarget(this.writeTarget);
        renderer.clear(true, false, false);
      }
      this.material.uniforms.uPreviousFoam!.value = this.readTarget.texture;
      renderer.setRenderTarget(this.writeTarget);
      this.quad.render(renderer);
      const previous = this.readTarget;
      this.readTarget = this.writeTarget;
      this.writeTarget = previous;
      this.origin.copy(origin);
      this.lastTime = time;
      this.previousCount = this.oceanUniforms.uExclusionCount.value;
      for (let i = 0; i < MAX_OCEAN_EXCLUSIONS; i++) {
        const motion = this.hullMotion[i]!;
        this.previousCenters[i]!.set(motion.x, motion.y);
      }
    } catch (error) {
      // A partial GPU update cannot provide valid history on the next frame.
      this.lastTime = undefined;
      throw error;
    } finally {
      renderer.setViewport(this.viewport);
      renderer.setScissor(this.scissor);
      renderer.setScissorTest(scissorTest);
      // Binding restores the target's physical viewport after the global logical state.
      renderer.setRenderTarget(target, cubeFace, mipLevel);
      renderer.setClearColor(this.clearColor, clearAlpha);
      renderer.autoClear = autoClear;
      renderer.xr.enabled = xrEnabled;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.readTarget.dispose();
    this.writeTarget.dispose();
    this.material.dispose();
    this.quad.dispose();
  }

  private createTarget(): WebGLRenderTarget {
    const target = new WebGLRenderTarget(SIZE, SIZE, {
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
    });
    target.texture.name = 'ocean-persistent-foam';
    return target;
  }

  private canUpdate(time: number, origin: Vector2): boolean {
    return !this.disposed && Number.isFinite(time)
      && Number.isFinite(origin.x) && Number.isFinite(origin.y);
  }

  private needsReset(elapsed: number, origin: Vector2): boolean {
    return this.lastTime === undefined || elapsed < 0
      || Math.abs(origin.x - this.origin.x) >= this.extent
      || Math.abs(origin.y - this.origin.y) >= this.extent;
  }

  private updateHullMotion(elapsed: number, reset: boolean): void {
    const count = this.oceanUniforms.uExclusionCount.value;
    for (let i = 0; i < MAX_OCEAN_EXCLUSIONS; i++) {
      const motion = this.hullMotion[i]!;
      if (i >= count) {
        motion.set(0, 0, 0, 0);
        continue;
      }
      this.inverse.copy(this.oceanUniforms.uExclusionWorldToLocal.value[i]!).invert();
      const bounds = this.oceanUniforms.uExclusionBounds.value[i]!;
      this.center.set((bounds.x + bounds.y) * 0.5, 0, (bounds.z + bounds.w) * 0.5).applyMatrix4(this.inverse);
      const previous = this.previousCenters[i]!;
      const dx = this.center.x - previous.x;
      const dz = this.center.z - previous.y;
      // New hulls and teleports must not draw a trail through the entire field.
      const moving = !reset && i < this.previousCount && elapsed > 0
        && dx * dx + dz * dz < 16 * 16;
      const vx = moving ? dx / elapsed : 0;
      const vz = moving ? dz / elapsed : 0;
      const scale = Math.min(1, 30 / Math.max(Math.hypot(vx, vz), 0.001));
      motion.set(this.center.x, this.center.z, vx * scale, vz * scale);
    }
  }
}
