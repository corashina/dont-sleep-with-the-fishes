// Importance: 95/100. Offscreen foam must not corrupt the main render or leak GPU resources.
import { afterEach, expect, it, vi } from 'vitest';
import { Camera, Color, Vector4, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { OceanFoamSimulation } from '../src/ocean/OceanFoamSimulation';
import { createOceanShaderDefinition } from '../src/ocean/oceanShader';
afterEach(() => vi.restoreAllMocks());
function fixture() {
 let target: WebGLRenderTarget | null = new WebGLRenderTarget(4,4), face=3, mip=2;
 const viewport=new Vector4(4,5,6,7), scissor=new Vector4(1,2,3,4), color=new Color(0.1,0.2,0.3);
 let scissorTest=true, alpha=0.4;
 const canvas=new EventTarget();
 const r={ domElement:canvas, autoClear:false, xr:{enabled:true}, shadowMap:{autoUpdate:true,needsUpdate:true},
 extensions:{has:vi.fn(() => true)}, getRenderTarget:()=>target,
 getActiveCubeFace:()=>face,getActiveMipmapLevel:()=>mip,
 setRenderTarget:(value:WebGLRenderTarget|null,f=0,m=0)=>{target=value;face=f;mip=m;},
 getViewport:(out:Vector4)=>out.copy(viewport), setViewport:(out:Vector4)=>viewport.copy(out),
 getScissor:(out:Vector4)=>out.copy(scissor),setScissor:(out:Vector4)=>scissor.copy(out),
 getScissorTest:()=>scissorTest,setScissorTest:(v:boolean)=>{scissorTest=v;},
 getClearColor:(out:Color)=>out.copy(color),getClearAlpha:()=>alpha,
 setClearColor:(c:Color|number,a=1)=>{color.set(c);alpha=a;},
 clear:vi.fn(),render:vi.fn() };
 const snapshot=()=>({target,face,mip,viewport:viewport.clone(),scissor:scissor.clone(),scissorTest,
 color:color.clone(),alpha,autoClear:r.autoClear,xr:r.xr.enabled,shadow:r.shadowMap.autoUpdate,dirty:r.shadowMap.needsUpdate});
 return {r, renderer:r as unknown as WebGLRenderer, snapshot, canvas};
}
it('restores renderer state after success and failure', () => {
 const f=fixture(), before=f.snapshot(), sim=new OceanFoamSimulation('low',createOceanShaderDefinition('low').uniforms);
 sim.update(f.renderer,1,new Camera()); expect(f.snapshot()).toEqual(before);
 f.r.render.mockImplementationOnce(()=>{throw new Error('draw failed');});
 expect(()=>sim.update(f.renderer,1.04,new Camera())).toThrow('draw failed');
 expect(f.snapshot()).toEqual(before);
 sim.update(f.renderer,1.08,new Camera()); expect(f.snapshot()).toEqual(before); sim.dispose();
});
it('does not allocate targets during frames and disposes each target once', () => {
 const f=fixture(), disposal=vi.spyOn(WebGLRenderTarget.prototype,'dispose');
 const sim=new OceanFoamSimulation('low',createOceanShaderDefinition('low').uniforms);
 const first=sim.uniforms.uFoamCurrent.value;
 sim.update(f.renderer,1,new Camera()); sim.update(f.renderer,1.04,new Camera());
 expect([sim.uniforms.uFoamCurrent.value,sim.uniforms.uFoamPrevious.value]).toContain(first);
 sim.dispose(); sim.dispose(); expect(disposal).toHaveBeenCalledTimes(2);
});
it('cleans partial construction when the second target cannot be created', () => {
 const disposal=vi.spyOn(WebGLRenderTarget.prototype,'dispose');
 vi.spyOn(WebGLRenderTarget.prototype,'clone').mockImplementationOnce(()=>{throw new Error('allocation failed');});
 expect(()=>new OceanFoamSimulation('high',createOceanShaderDefinition('high').uniforms)).toThrow('allocation failed');
 expect(disposal).toHaveBeenCalledTimes(1);
});
it('rejects unsupported render targets before changing renderer state', () => {
 const f=fixture(),before=f.snapshot(),sim=new OceanFoamSimulation('low',createOceanShaderDefinition('low').uniforms);
 f.r.extensions.has.mockReturnValue(false);
 expect(()=>sim.update(f.renderer,1,new Camera())).toThrow(/half.float/i);
 expect(f.snapshot()).toEqual(before); sim.dispose();
});
it('clears history after context restoration and removes its listener', () => {
 const f=fixture(),sim=new OceanFoamSimulation('low',createOceanShaderDefinition('low').uniforms);
 sim.update(f.renderer,1,new Camera()); const clears=f.r.clear.mock.calls.length;
 f.canvas.dispatchEvent(new Event('webglcontextrestored')); sim.update(f.renderer,1,new Camera());
 expect(f.r.clear.mock.calls.length).toBe(clears+2);
 const remove=vi.spyOn(f.canvas,'removeEventListener'); sim.dispose(); expect(remove).toHaveBeenCalledOnce();
});
