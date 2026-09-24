import {
  Camera, Color, HalfFloatType, LinearFilter, Mesh, NoBlending, PlaneGeometry,
  Scene, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderTarget,
  type IUniform, type Texture, type WebGLRenderer,
} from 'three';
import type { WaterQuality } from '../rendering/waterQuality';
import type { OceanShaderUniforms } from './oceanShader';
import type { WaterExclusionRegion } from './WaterExclusion';
import { OceanFoamClock } from './OceanFoamClock';
import { OceanFoamHullHistory } from './OceanFoamHullHistory';
import { OCEAN_FOAM_SIMULATION_FRAGMENT, OCEAN_FOAM_SIMULATION_VERTEX } from './oceanFoamSimulationShader';

interface FoamUniforms {
  uFoamCurrent: IUniform<Texture>;
  uFoamPrevious: IUniform<Texture>;
  uFoamCurrentOrigin: IUniform<Vector2>;
  uFoamPreviousOrigin: IUniform<Vector2>;
  uFoamExtent: IUniform<number>;
  uFoamMix: IUniform<number>;
  uFoamSourceMask: IUniform<Vector2>;
}

/** Persistent world-space coverage. Only this class owns the two field targets. */
export class OceanFoamSimulation {
  readonly sourceMask = new Vector2(1, 1);
  readonly uniforms: FoamUniforms;
  private readonly targets: readonly [WebGLRenderTarget, WebGLRenderTarget];
  private readonly origins = [new Vector2(), new Vector2()] as const;
  private readonly clock = new OceanFoamClock();
  private readonly hulls = new OceanFoamHullHistory(2);
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly material: ShaderMaterial;
  private readonly geometry: PlaneGeometry;
  private readonly viewer = new Vector3();
  private readonly nextOrigin = new Vector2();
  private readonly viewport = new Vector4();
  private readonly scissor = new Vector4();
  private readonly clearColor = new Color();
  private regions: readonly WaterExclusionRegion[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private current = 0;
  private initialized = false;
  private disposed = false;
  private readonly contextRestored = (): void => { this.reset(); };

  constructor(quality: WaterQuality, oceanUniforms: OceanShaderUniforms) {
    const size = quality === 'high' ? 1024 : 512;
    const first = new WebGLRenderTarget(size, size, {
      type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter,
      depthBuffer: false, stencilBuffer: false, samples: 0,
    });
    let second: WebGLRenderTarget | undefined;
    let geometry: PlaneGeometry | undefined;
    let material: ShaderMaterial | undefined;
    try {
      second = first.clone();
      first.texture.name = 'ocean-foam-field-a'; second.texture.name = 'ocean-foam-field-b';
      this.targets = [first, second];
      this.uniforms = {
        uFoamCurrent: { value: first.texture }, uFoamPrevious: { value: second.texture },
        uFoamCurrentOrigin: { value: new Vector2() }, uFoamPreviousOrigin: { value: new Vector2() },
        uFoamExtent: { value: 256 }, uFoamMix: { value: 1 }, uFoamSourceMask: { value: this.sourceMask },
      };
      material = new ShaderMaterial({
        vertexShader: OCEAN_FOAM_SIMULATION_VERTEX, fragmentShader: OCEAN_FOAM_SIMULATION_FRAGMENT,
        depthTest: false, depthWrite: false, blending: NoBlending, toneMapped: false,
        uniforms: {
          ...oceanUniforms, uTime: { value: 0 },
          uExclusionWorldToLocal: { value: this.hulls.worldToLocal },
          uHullPreviousLocalToWorld: { value: this.hulls.previousLocalToWorld },
          uHullLocalToWorld: { value: this.hulls.localToWorld }, uHullIntervals: { value: this.hulls.intervals },
          uFoamHistory: { value: first.texture }, uFoamHistoryOrigin: { value: new Vector2() },
          uFoamTargetOrigin: { value: this.nextOrigin }, uFoamExtent: this.uniforms.uFoamExtent,
          uFoamTexel: { value: 1 / size }, uFoamStep: { value: this.clock.stepSeconds },
          uFoamViewer: { value: this.viewer }, uFoamSourceMask: this.uniforms.uFoamSourceMask,
        },
      });
      this.material = material;
      geometry = new PlaneGeometry(2, 2);
      this.geometry = geometry;
      const quad = new Mesh(geometry, material); quad.frustumCulled = false; this.scene.add(quad);
    } catch (error) {
      first.dispose(); second?.dispose(); geometry?.dispose(); material?.dispose(); throw error;
    }
  }

  setExclusions(regions: readonly WaterExclusionRegion[]): void { this.regions = regions; }

  update(renderer: WebGLRenderer, timeSeconds: number, camera: Camera): void {
    if (this.disposed) return;
    if (this.canvas === null) {
      if (!renderer.extensions.has('EXT_color_buffer_float'))
        throw new Error('Ocean foam requires half-float color render targets');
      this.canvas = renderer.domElement;
      this.canvas.addEventListener('webglcontextrestored', this.contextRestored);
    }
    camera.getWorldPosition(this.viewer);
    const texel = this.uniforms.uFoamExtent.value / this.targets[0].width;
    this.nextOrigin.set(Math.round(this.viewer.x / texel) * texel, Math.round(this.viewer.z / texel) * texel);
    if (this.initialized && this.nextOrigin.distanceTo(this.origins[this.current]!) > 256) this.reset();
    this.clock.advance(timeSeconds);
    if (this.clock.resetRequired) { this.initialized = false; this.hulls.reset(); }
    this.hulls.setRegions(this.regions, timeSeconds);
    this.uniforms.uFoamMix.value = this.clock.mix;
    if (!this.clock.steps) return;

    const target = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    renderer.getViewport(this.viewport); renderer.getScissor(this.scissor); renderer.getClearColor(this.clearColor);
    const alpha = renderer.getClearAlpha(), scissorTest = renderer.getScissorTest();
    const autoClear = renderer.autoClear, xr = renderer.xr.enabled;
    const shadowUpdate = renderer.shadowMap.autoUpdate, shadowDirty = renderer.shadowMap.needsUpdate;
    try {
      renderer.autoClear = false; renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false; renderer.setScissorTest(false);
      if (!this.initialized) {
        renderer.setClearColor(0, 0);
        for (const field of this.targets) { renderer.setRenderTarget(field); renderer.clear(); }
        this.origins[0].copy(this.nextOrigin); this.origins[1].copy(this.nextOrigin);
      }
      for (let step = 0; step < this.clock.steps; step++) {
        const time = this.clock.firstStepTime + step * this.clock.stepSeconds;
        this.hulls.sample(time);
        this.material.uniforms.uTime!.value = time;
        this.material.uniforms.uFoamHistory!.value = this.targets[this.current]!.texture;
        this.material.uniforms.uFoamHistoryOrigin!.value.copy(this.origins[this.current]!);
        const next = 1 - this.current;
        renderer.setRenderTarget(this.targets[next]!);
        renderer.render(this.scene, this.camera);
        this.origins[next]!.copy(this.nextOrigin);
        this.uniforms.uFoamPrevious.value = this.initialized ? this.targets[this.current]!.texture : this.targets[next]!.texture;
        this.uniforms.uFoamPreviousOrigin.value.copy(this.initialized ? this.origins[this.current]! : this.nextOrigin);
        this.current = next; this.initialized = true;
        this.uniforms.uFoamCurrent.value = this.targets[next]!.texture;
        this.uniforms.uFoamCurrentOrigin.value.copy(this.nextOrigin);
      }
    } catch (error) {
      this.reset(); throw error;
    } finally {
      renderer.setRenderTarget(target, face, mip); renderer.setViewport(this.viewport); renderer.setScissor(this.scissor);
      renderer.setScissorTest(scissorTest); renderer.setClearColor(this.clearColor, alpha);
      renderer.autoClear = autoClear; renderer.xr.enabled = xr;
      renderer.shadowMap.autoUpdate = shadowUpdate; renderer.shadowMap.needsUpdate = shadowDirty;
    }
  }

  reset(): void { this.clock.reset(); this.hulls.reset(); this.initialized = false; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas?.removeEventListener('webglcontextrestored', this.contextRestored);
    this.canvas = null;
    this.targets[0].dispose(); this.targets[1].dispose(); this.material.dispose(); this.geometry.dispose();
  }
}
