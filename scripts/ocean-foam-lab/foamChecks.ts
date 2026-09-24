// Importance: 98/100. These checks execute the real GPU field, not shader source comparisons.
import { Camera, Mesh, Object3D, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { OceanFoamSimulation } from '../../src/ocean/OceanFoamSimulation';
import { createOceanShaderDefinition } from '../../src/ocean/oceanShader';
import { createWaterExclusion } from '../../src/ocean/WaterExclusion';
import { OCEAN_FOAM_SIMULATION_VERTEX } from '../../src/ocean/oceanFoamSimulationShader';

function requireFoam(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export async function runFoamChecks(renderer: WebGLRenderer): Promise<Record<string, number | string>> {
 const checkGL=(label:string)=>{const code=renderer.getContext().getError();if(code)throw new Error(label+': WebGL '+code);};
 const u=createOceanShaderDefinition('low').uniforms;
 u.uAmplitudeScale.value=1.45;
 const camera=new Camera(); camera.position.set(0,8,0);
 const sim=new OceanFoamSimulation('low',u);
 const target=new WebGLRenderTarget(512,512,{depthBuffer:false,stencilBuffer:false});
 const material=new ShaderMaterial({vertexShader:OCEAN_FOAM_SIMULATION_VERTEX,
 fragmentShader:'varying vec2 vUv; uniform sampler2D field; void main(){gl_FragColor=texture2D(field,vUv);}',
 uniforms:{field:{value:sim.uniforms.uFoamCurrent.value}},depthTest:false,depthWrite:false,toneMapped:false});
 const geometry=new PlaneGeometry(2,2),scene=new Scene(); scene.add(new Mesh(geometry,material));
 const read=()=>{
   material.uniforms.field!.value=sim.uniforms.uFoamCurrent.value;
   const old=renderer.getRenderTarget(); renderer.setRenderTarget(target); renderer.render(scene,new Camera());
   const data=new Uint8Array(512*512*4); renderer.readRenderTargetPixels(target,0,0,512,512,data); renderer.setRenderTarget(old);
   let crest=0,hull=0,x=0,z=0;
   for(let i=0;i<data.length;i+=4){
     if(data[i+1]!>data[i]!+1||data[i+3]!>data[i+2]!+1)throw new Error('Fresh foam exceeds coverage');
     crest+=data[i]!; hull+=data[i+2]!;
     x+=(i/4%512)*data[i+2]!; z+=Math.floor(i/4/512)*data[i+2]!;
   }
   return {crest,hull,x:hull?x/hull:0,z:hull?z/hull:0,data};
 };
 let time=0;
 const advance=(seconds:number)=>{const steps=Math.round(seconds*30); for(let i=0;i<steps;i++){time+=1/30;sim.update(renderer,time,camera);}};
 try {
   sim.sourceMask.set(1,0); sim.update(renderer,time,camera); advance(2);
   const formed=read(); requireFoam(formed.crest>100, 'GPU check: crest foam was not deposited');
   sim.sourceMask.set(0,0); advance(1); const aged=read();
   requireFoam(aged.crest>0 && aged.crest<formed.crest, 'GPU check: foam did not persist and decay');
   advance(5); const old=read(); requireFoam(old.crest<aged.crest, 'GPU check: old foam did not decay');
   const hull=new Object3D(); hull.position.y=6;
   const region=createWaterExclusion(hull,1,3,2,-1,{lowerHalfWidth:1,lowerHalfLength:3,lowerTaperStart:2,upperLocalY:1});
   const regions=[region]; u.uExclusionCount.value=1;
   u.uExclusionBounds.value[0]!.copy(region.bounds); u.uExclusionLowerBounds.value[0]!.copy(region.lowerBounds);
   u.uExclusionTaperStarts.value[0]!.copy(region.taperStarts); u.uExclusionLowerTaperStarts.value[0]!.copy(region.lowerTaperStarts);
   u.uExclusionMinimumLocalYs.value[0]=-1;u.uExclusionUpperLocalYs.value[0]=1;
   sim.setExclusions(regions); sim.sourceMask.set(0,1); sim.reset();advance(1);
   if(read().hull!==0)throw new Error('GPU check: airborne hull deposits foam');
   hull.position.y=0;hull.updateMatrixWorld(true);region.worldToLocal.copy(hull.matrixWorld).invert();
   sim.reset();advance(2); const contact=read();if(contact.hull<=10)throw new Error('GPU check: hull foam missing');
   sim.sourceMask.set(0,0); u.uAmplitudeScale.value=0;
   const before=read(); advance(2);const drift=read();
   const expectedX=0.18*2*0.92/Math.hypot(0.92,0.39)/0.5;
   if(Math.abs(drift.x-before.x-expectedX)>1)throw new Error('GPU check: incorrect foam advection');
   const paused=read();for(let i=0;i<20;i++)sim.update(renderer,time,camera);
   const pausedAfter=read();if(paused.data.some((value,i)=>value!==pausedAfter.data[i]))throw new Error('GPU check: paused field changes');
   camera.position.x+=8;sim.update(renderer,time+1/30,camera);time+=1/30;
   const scrolled=read();if(Math.abs(scrolled.x-drift.x+16)>1.2)throw new Error('GPU check: origin shift moved world foam');
   checkGL('before context loss');
   const ext=renderer.getContext().getExtension('WEBGL_lose_context');
   let contextStatus = 'unavailable';
   if (ext) {
     await new Promise<void>((resolve,reject)=>{
       const timeout=setTimeout(()=>reject(new Error('Context restore timed out')),5000);
       renderer.domElement.addEventListener('webglcontextrestored',()=>{clearTimeout(timeout);resolve();},{once:true});
       renderer.domElement.addEventListener('webglcontextlost',event=>{
         event.preventDefault();target.dispose();material.dispose();geometry.dispose();setTimeout(()=>ext.restoreContext(),100);
       },{once:true});
       ext.loseContext();
     });
     checkGL('after restore event');
     sim.update(renderer,time,camera); checkGL('after restored simulation');
     const restored=read();if(restored.crest!==0||restored.hull!==0)throw new Error('Context restore retained stale foam');
     checkGL('after restored readback');
     contextStatus='passed';
   }
   return {crestFormed:formed.crest,crestAfterOneSecond:aged.crest,crestAfterSixSeconds:old.crest,
     hullContact:contact.hull,driftTexels:drift.x-before.x,originShiftTexels:scrolled.x-drift.x,
     pause:'passed',contextRestoration:contextStatus};
 } finally {sim.dispose();checkGL('dispose simulation');target.dispose();checkGL('dispose readback');material.dispose();checkGL('dispose material');geometry.dispose();checkGL('dispose geometry');}
}
