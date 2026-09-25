import { Color, Fog, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer } from 'three';
import { sceneSeaFogUniforms } from '../../src/world/SeaFogMaterial';
import { SURVIVAL_CELESTIAL_DIRECTION } from '../../src/world/celestialLight';
import { TornadoPresentation } from '../../src/survival/events/TornadoPresentation';
import type { DedicatedEventEnvironment } from '../../src/survival/eventPresentationTypes';
import { OceanRenderer, type OceanAtmosphere } from '../../src/ocean/OceanRenderer';
import { DEFAULT_WAVES, sampleWaveFieldInto } from '../../src/ocean/WaveField';

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1440, 1000);
renderer.setPixelRatio(1);
document.body.append(renderer.domElement);
const scene = new Scene();
scene.background = new Color('#859ba3');
scene.fog = new Fog('#859ba3', 110, 260);
const camera = new PerspectiveCamera(46, 1.44, 0.1, 1000);
camera.position.set(34, 12, 54);
camera.lookAt(12.8, 22, -19);
const ocean = new OceanRenderer('high');
scene.add(ocean.mesh);
const atmosphere: OceanAtmosphere = {
  phase: 'day', fogVolume: 0.15, fogTime: 0, fogLightColor: new Color('#8fa4ae'),
  fogColor: new Color('#859ba3'), horizonColor: new Color('#859ba3'),
  skyColor: new Color('#607d8a'), sunColor: new Color('#c6d4d7'), sunVisibility: 0.45,
};
const presentation = new TornadoPresentation({
  sampleWorldWaveInto: (out, time, x, z, scale) => sampleWaveFieldInto(out, DEFAULT_WAVES, time, x, z, scale),
  readWorldWaveAmplitudeScale: () => 1.25,
} as DedicatedEventEnvironment);
scene.add(presentation.worldRoot);
presentation.stage({ eventId: 'tornado', targetInstanceId: null, variantSeed: 7 });
const errors: string[] = [];
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  errors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'));
};
let time = 0;
function render(delta: number): void {
  time += delta;
  presentation.update(time, delta);
  ocean.follow(camera.position.x, camera.position.z);
  ocean.update(time, 1.25, 0.005, atmosphere);
  renderer.render(scene, camera);
  const error = renderer.getContext().getError();
  if (error) errors.push(`WebGL error ${error}`);
  if (errors.length) throw new Error(errors.join('\n'));
}
async function capture(id: string): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    renderer.domElement.toBlob(blob => blob ? resolve(blob) : reject(new Error('Capture failed')));
  });
  const response = await fetch(`/__tornado-preview/${id}`, { method: 'POST', body: blob });
  if (!response.ok) throw new Error(`Upload failed: ${id}`);
}
// Importance: 98/100. A cloud behind the hull must never paint over its opaque surface.
async function checkHullOcclusion(): Promise<number> {
  camera.position.set(12.8, 5, 10);
  camera.lookAt(12.8, 5, -19);
  const hull = new Mesh(new PlaneGeometry(9, 5), new MeshBasicMaterial({ color: '#604026', fog: false }));
  hull.position.set(12.8, 5, -8);
  scene.add(hull);
  ocean.mesh.visible = false;
  const gl = renderer.getContext();
  const visible = new Uint8Array(64 * 64 * 4);
  const hidden = new Uint8Array(visible.length);
  renderer.render(scene, camera);
  gl.readPixels(688, 468, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, visible);
  await capture('tornado-occlusion');
  presentation.worldRoot.visible = false;
  renderer.render(scene, camera);
  gl.readPixels(688, 468, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, hidden);
  let changed = 0;
  for (let i = 0; i < visible.length; i += 4) {
    if (Math.abs(visible[i]! - hidden[i]!) + Math.abs(visible[i + 1]! - hidden[i + 1]!)
      + Math.abs(visible[i + 2]! - hidden[i + 2]!) > 3) changed++;
  }
  hull.removeFromParent(); hull.geometry.dispose(); hull.material.dispose();
  presentation.worldRoot.visible = true;
  ocean.mesh.visible = true;
  if (errors.length) throw new Error(errors.join('\n'));
  if (changed > 0) throw new Error(`Tornado covers ${changed}/4096 opaque hull pixels`);
  return changed;
}
async function main(): Promise<void> {
  render(12);
  if (!location.search.includes('capture')) {
    let previous = performance.now();
    renderer.setAnimationLoop(now => { render(Math.min((now - previous) / 1000, 0.1)); previous = now; });
    return;
  }
  await capture('tornado');
  render(2);
  await capture('tornado-motion');
  const times: number[] = [];
  for (let i = 0; i < 24; i++) {
    const start = performance.now();
    render(1 / 60);
    renderer.getContext().finish();
    times.push(performance.now() - start);
  }
  camera.position.set(0, 2.5, 0);
  camera.lookAt(12.8, 9, -19);
  render(0);
  await capture('tornado-boat');
  const { calls: renderCalls, triangles } = renderer.info.render;
  sceneSeaFogUniforms.set(scene, {
    uSunVisibility: { value: 0 }, uMoonVisibility: { value: 1 },
    uMoonDirection: { value: new Vector3(...SURVIVAL_CELESTIAL_DIRECTION).normalize() },
  });
  scene.background = new Color('#0b1420');
  scene.fog = new Fog('#0b1420', 110, 260);
  atmosphere.phase = 'night';
  atmosphere.skyColor.set('#173047'); atmosphere.horizonColor.set('#304451');
  atmosphere.fogColor.set('#0b1420'); atmosphere.sunVisibility = 0.2;
  render(0);
  await capture('tornado-night-close');
  camera.position.set(34, 12, 54); camera.lookAt(12.8, 22, -19);
  render(0);
  await capture('tornado-night');
  const coveredHullPixels = await checkHullOcclusion();
  times.sort((a, b) => a - b);
  await fetch('/__tornado-preview-complete', { method: 'POST', body: JSON.stringify({
    shaderErrors: errors, coveredHullPixels, width: 1440, height: 1000, renderCalls,
    triangles, medianFrameMs: times[12], p95FrameMs: times[22],
    note: 'Actual TornadoPresentation and ocean. Full-height preview camera and boat-height camera. Headless GPU timings include ocean rendering and forced synchronization.',
  }, null, 2) });
}
void main().catch(async error => {
  document.body.append(String(error));
  await fetch('/__tornado-preview-failed', { method: 'POST', body: String(error) });
});
