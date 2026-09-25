import { AmbientLight, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Color, WebGLRenderer } from 'three';
import { EventModelLibrary } from '../../src/survival/EventModelLibrary';
import { SharkSwarmPresentation } from '../../src/survival/events/SharkSwarmPresentation';
const run = async () => {
 const scene = new Scene(); scene.background = new Color(0x758a91);
 const camera = new PerspectiveCamera(80, 960/600, .1, 500); camera.position.set(6,27,15); camera.lookAt(6,0,-4);
 const effects = new Group(); effects.add(camera); scene.add(effects);
 scene.add(new AmbientLight(0xbcdbe5,2)); const sun = new DirectionalLight(0xffe7cd,3); sun.position.set(-4,10,5); scene.add(sun);
 const sea = new Mesh(new PlaneGeometry(100,100),new MeshStandardMaterial({color:0x244b58,roughness:.4})); sea.rotation.x=-Math.PI/2; scene.add(sea);
 const renderer = new WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); renderer.setSize(960,600);
 const eventModels = await EventModelLibrary.load(['shark']);
 const presentation = new SharkSwarmPresentation({ emitCue:()=>{}, eventModels, camera, cameraEffectsRoot:effects, readWorldWaveAmplitudeScale:()=>0, sampleWorldWaveInto:()=>{} } as never);
 scene.add(presentation.worldRoot,presentation.boatRoot);
 const sheet = document.createElement('canvas'); sheet.width=1920; sheet.height=1230; const ctx=sheet.getContext('2d')!;
 for(const [n,seed] of [42,123456789].entries()) {
  presentation.stage({eventId:'swarm-of-sharks',targetInstanceId:null,variantSeed:seed}); void presentation.reveal(); presentation.skip(); presentation.update(20,0);
  void presentation.react({resourceDeltas:{food:-1},selectedInstanceId:null,brokenInstanceIds:[]} as never);
  let last=0;
  for(const [i,t] of [0,5,10,15,20,25].entries()) {
   while(last+.01<t){last+=.01;presentation.update(20+last,.01);} presentation.update(20+t,t-last);last=t;
   renderer.render(scene,camera); const x=(i%2)*960,y=Math.floor(i/2)*410;
   ctx.drawImage(renderer.domElement,x,y,960,380); ctx.fillStyle='#13202a';ctx.fillRect(x,y+380,960,30);ctx.fillStyle='white';ctx.font='18px sans-serif';ctx.fillText(`Seed ${seed}: ${t.toFixed(2)} seconds`,x+15,y+401);
  }
  const png=await new Promise<Blob>(resolve=>sheet.toBlob(b=>resolve(b!),'image/png'));
  await fetch(`/capture/food-${n}`,{method:'POST',body:png});
 }
 presentation.dispose();eventModels.dispose();renderer.dispose();
 await fetch('/complete',{method:'POST',body:'Rendered food diversion frames with production shark model.'});
}; run().catch(e=>fetch('/failed',{method:'POST',body:e.stack??String(e)}));





