import { HalfFloatType, LinearSRGBColorSpace, ShaderMaterial, UniformsUtils, Vector2, WebGLRenderTarget, type Texture, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

/** Spread captured emission without a repeating light field or individual light sources. */
export class UnderwaterGlowScattering {
  private readonly horizontal = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType, depthBuffer: false, stencilBuffer: false,
  });
  private readonly vertical = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType, depthBuffer: false, stencilBuffer: false,
  });
  private readonly downsampleMaterial = new ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, texel: { value: new Vector2() } },
    vertexShader: HorizontalBlurShader.vertexShader,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 texel;
      varying vec2 vUv;
      void main() {
        // Four bilinear samples cover the source's 4x4 pixel footprint.
        gl_FragColor = 0.25 * (
          texture2D(tDiffuse, vUv + texel) + texture2D(tDiffuse, vUv - texel)
          + texture2D(tDiffuse, vUv + vec2(texel.x, -texel.y))
          + texture2D(tDiffuse, vUv + vec2(-texel.x, texel.y)));
      }
    `,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  private readonly horizontalMaterial = new ShaderMaterial({
    ...HorizontalBlurShader, uniforms: UniformsUtils.clone(HorizontalBlurShader.uniforms),
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  private readonly verticalMaterial = new ShaderMaterial({
    ...VerticalBlurShader, uniforms: UniformsUtils.clone(VerticalBlurShader.uniforms),
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  private readonly quad = new FullScreenQuad(this.horizontalMaterial);
  readonly texture = this.vertical.texture;

  constructor() {
    this.horizontal.texture.colorSpace = LinearSRGBColorSpace;
    this.texture.colorSpace = LinearSRGBColorSpace;
    this.texture.name = 'underwater-glow-scattering';
  }

  // The capture owner restores the render target and viewport after these draws.
  update(renderer: WebGLRenderer, source: Texture, captureWidth: number, captureHeight: number): void {
    const width = Math.max(1, Math.ceil(captureWidth / 4));
    const height = Math.max(1, Math.ceil(captureHeight / 4));
    if (this.horizontal.width !== width || this.horizontal.height !== height) {
      this.horizontal.setSize(width, height);
      this.vertical.setSize(width, height);
    }
    this.downsampleMaterial.uniforms.tDiffuse!.value = source;
    this.downsampleMaterial.uniforms.texel!.value.set(1 / captureWidth, 1 / captureHeight);
    this.quad.material = this.downsampleMaterial;
    renderer.setRenderTarget(this.vertical);
    this.quad.render(renderer);
    this.horizontalMaterial.uniforms.tDiffuse!.value = this.vertical.texture;
    this.horizontalMaterial.uniforms.h!.value = 1 / width;
    this.verticalMaterial.uniforms.tDiffuse!.value = this.horizontal.texture;
    this.verticalMaterial.uniforms.v!.value = 1 / height;
    // A second convolution softens the truncated kernel's outer edge. Reuse both buffers.
    for (let pass = 0; pass < 2; pass += 1) {
      this.quad.material = this.horizontalMaterial;
      renderer.setRenderTarget(this.horizontal);
      this.quad.render(renderer);
      this.quad.material = this.verticalMaterial;
      renderer.setRenderTarget(this.vertical);
      this.quad.render(renderer);
    }
  }

  dispose(): void {
    this.horizontal.dispose();
    this.vertical.dispose();
    this.horizontalMaterial.dispose();
    this.verticalMaterial.dispose();
    this.downsampleMaterial.dispose();
    this.quad.dispose();
  }
}
