import { describe, expect, it, vi } from 'vitest';
import { Color, Matrix4, Mesh, ShaderMaterial, Vector2, Vector4, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { OceanFoam } from '../src/ocean/OceanFoam';
import { createOceanShaderDefinition } from '../src/ocean/oceanShader';

function createRenderer() {
  const viewport = new Vector4(4, 5, 640, 360);
  const scissor = new Vector4(6, 7, 320, 180);
  const clearColor = new Color(0x123456);
  let clearAlpha = 0.4;
  let scissorTest = true;
  let target: WebGLRenderTarget | null = new WebGLRenderTarget(32, 32);
  const activeViewport = target.viewport.clone();
  let cubeFace = 2;
  let mipLevel = 1;
  const draws: { material: ShaderMaterial; step: number; previousOrigin: Vector2; origin: Vector2; motion: Vector4[] }[] = [];
  const renderer = {
    xr: { enabled: true },
    autoClear: true,
    getRenderTarget: () => target,
    getActiveCubeFace: () => cubeFace,
    getActiveMipmapLevel: () => mipLevel,
    getViewport: (value: Vector4) => value.copy(viewport),
    getScissor: (value: Vector4) => value.copy(scissor),
    getScissorTest: () => scissorTest,
    getClearColor: (value: Color) => value.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setViewport: (value: Vector4) => { viewport.copy(value); activeViewport.copy(value); },
    setScissor: (value: Vector4) => scissor.copy(value),
    setScissorTest: (value: boolean) => { scissorTest = value; },
    setClearColor: (value: Color | number, alpha: number) => { clearColor.set(value); clearAlpha = alpha; },
    setRenderTarget: vi.fn((value: WebGLRenderTarget | null, face = 0, level = 0) => {
      target = value;
      cubeFace = face;
      mipLevel = level;
      activeViewport.copy(value?.viewport ?? viewport);
    }),
    clear: vi.fn(() => {
      expect(scissorTest).toBe(false);
      expect(clearColor.getHex()).toBe(0);
    }),
    render: vi.fn((mesh: Mesh) => {
      expect(renderer.xr.enabled).toBe(false);
      expect(renderer.autoClear).toBe(false);
      const material = mesh.material as ShaderMaterial;
      draws.push({
        material,
        step: material.uniforms.uStep!.value as number,
        previousOrigin: (material.uniforms.uPreviousOrigin!.value as Vector2).clone(),
        origin: (material.uniforms.uFoamOrigin!.value as Vector2).clone(),
        motion: (material.uniforms.uHullMotion!.value as Vector4[]).map(value => value.clone()),
      });
    }),
  };
  return { renderer: renderer as unknown as WebGLRenderer, stub: renderer, draws, viewport, activeViewport, scissor, clearColor };
}

function createFoam() {
  const uniforms = createOceanShaderDefinition('high').uniforms;
  return { uniforms, foam: new OceanFoam(uniforms) };
}

describe('OceanFoam', () => {

  it('reprojects old world positions into the previous texture without clearing overlap', () => {
    const { foam } = createFoam();
    const { renderer, stub, draws } = createRenderer();
    foam.update(renderer, 1, new Vector2(10, -20));
    foam.update(renderer, 1, new Vector2(26, -28));
    const draw = draws[1]!;
    expect(draw.step).toBe(0);
    expect(draw.previousOrigin).toEqual(new Vector2(10, -20));
    expect(draw.origin).toEqual(new Vector2(26, -28));
    // The same world point moves left/up in the new target, while sampling its old UV.
    const world = new Vector2(30, -15);
    const newUv = world.clone().sub(draw.origin).divideScalar(foam.extent).addScalar(0.5);
    const sampledUv = newUv.clone().add(draw.origin.clone().sub(draw.previousOrigin).divideScalar(foam.extent));
    expect(sampledUv).toEqual(world.clone().sub(draw.previousOrigin).divideScalar(foam.extent).addScalar(0.5));
    expect(stub.clear).toHaveBeenCalledTimes(2);
    expect(foam.origin).toEqual(new Vector2(26, -28));
    foam.dispose();
  });

  it('bounds elapsed time, skips repeated time, and clears on time reversal or teleport', () => {
    const { foam } = createFoam();
    const { renderer, stub, draws } = createRenderer();
    const origin = new Vector2();
    foam.update(renderer, 10, origin);
    foam.update(renderer, 10, origin);
    expect(draws).toHaveLength(1);
    foam.update(renderer, 20, origin);
    expect(draws[1]!.step).toBe(0.1);
    foam.update(renderer, 19, origin);
    expect(draws[2]!.step).toBe(0);
    expect(stub.clear).toHaveBeenCalledTimes(4);
    foam.update(renderer, 19.1, new Vector2(128, 0));
    expect(draws[3]!.step).toBe(0);
    expect(draws[3]!.previousOrigin).toEqual(new Vector2(128, 0));
    expect(stub.clear).toHaveBeenCalledTimes(6);
    foam.update(renderer, NaN, origin);
    foam.update(renderer, 21, new Vector2(Infinity, 0));
    expect(draws).toHaveLength(4);
    foam.dispose();
  });

  it('shares wave uniforms and derives hull centers and velocity from inverse transforms', () => {
    const { foam, uniforms } = createFoam();
    const { renderer, draws } = createRenderer();
    uniforms.uExclusionCount.value = 1;
    uniforms.uExclusionBounds.value[0]!.set(-1, 1, -2, 2);
    uniforms.uExclusionWorldToLocal.value[0]!.copy(new Matrix4().makeTranslation(4, 0, 6)).invert();
    foam.update(renderer, 1, new Vector2());
    expect(draws[0]!.motion[0]).toEqual(new Vector4(4, 6, 0, 0));
    expect(draws[0]!.material.uniforms.uAmplitudeScale).toBe(uniforms.uAmplitudeScale);
    expect(draws[0]!.material.uniforms.uDirections).toBe(uniforms.uDirections);
    uniforms.uExclusionWorldToLocal.value[0]!.copy(new Matrix4().makeTranslation(4.2, 0, 6.3)).invert();
    foam.update(renderer, 1.1, new Vector2());
    expect(draws[1]!.motion[0]!.z).toBeCloseTo(2);
    expect(draws[1]!.motion[0]!.w).toBeCloseTo(3);
    uniforms.uExclusionWorldToLocal.value[0]!.copy(new Matrix4().makeTranslation(90, 0, 6)).invert();
    foam.update(renderer, 1.2, new Vector2());
    expect(draws[2]!.motion[0]).toEqual(new Vector4(90, 6, 0, 0));
    uniforms.uExclusionCount.value = 0;
    foam.update(renderer, 1.3, new Vector2());
    expect(draws[3]!.motion[0]).toEqual(new Vector4(0, 0, 0, 0));
    uniforms.uExclusionCount.value = 1;
    foam.update(renderer, 1.4, new Vector2());
    expect(draws[4]!.motion[0]).toEqual(new Vector4(90, 6, 0, 0));
    foam.dispose();
  });

  it.each([false, true])('restores all renderer state after rendering (failure: %s)', failure => {
    const { foam } = createFoam();
    const { renderer, stub, viewport, activeViewport, scissor, clearColor } = createRenderer();
    const target = renderer.getRenderTarget();
    if (failure) stub.render.mockImplementationOnce(() => { throw new Error('draw failed'); });
    const update = () => foam.update(renderer, 3, new Vector2(1, 2));
    if (failure) expect(update).toThrow('draw failed');
    else update();
    expect(renderer.getRenderTarget()).toBe(target);
    expect(renderer.getActiveCubeFace()).toBe(2);
    expect(renderer.getActiveMipmapLevel()).toBe(1);
    expect(viewport).toEqual(new Vector4(4, 5, 640, 360));
    expect(activeViewport).toEqual(target!.viewport);
    expect(scissor).toEqual(new Vector4(6, 7, 320, 180));
    expect(renderer.getScissorTest()).toBe(true);
    expect(clearColor.getHex()).toBe(0x123456);
    expect(renderer.getClearAlpha()).toBe(0.4);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.xr.enabled).toBe(true);
    if (failure) {
      foam.update(renderer, 3.1, new Vector2(1, 2));
      expect(stub.clear).toHaveBeenCalledTimes(4);
    }
    foam.dispose();
  });

  it('releases both targets, material, and quad once and ignores later updates', () => {
    const { foam } = createFoam();
    const { renderer, stub, draws } = createRenderer();
    foam.update(renderer, 0, new Vector2());
    const targets = new Set(stub.setRenderTarget.mock.calls.map(call => call[0]).filter(target => target?.width === 512));
    expect(targets.size).toBe(2);
    const disposals = [...targets].map(target => vi.spyOn(target!, 'dispose'));
    const materialDisposal = vi.spyOn(draws[0]!.material, 'dispose');
    const mesh = stub.render.mock.calls[0]![0];
    const geometryDisposal = vi.spyOn(mesh.geometry, 'dispose');
    foam.dispose();
    foam.dispose();
    foam.update(renderer, 1, new Vector2());
    disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    expect(materialDisposal).toHaveBeenCalledOnce();
    expect(geometryDisposal).toHaveBeenCalledOnce();
    expect(stub.render).toHaveBeenCalledOnce();
    geometryDisposal.mockRestore();
  });
});
