import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  Vector3,
} from 'three';
import { OceanRenderer, type OceanAtmosphere } from '../../src/ocean/OceanRenderer';
import { HIGH_WATER_LOOK } from '../../src/ocean/highWaterLook';
import { createWaterLabHull } from './hull';
import { DEFAULT_WAVES, createWaveSample, sampleWaveFieldInto } from '../../src/ocean/WaveField';
import type { WaterQuality } from '../../src/rendering/waterQuality';
import { PostProcessingPipeline } from '../../src/rendering/PostProcessingPipeline';
import type { SceneVisualState } from '../../src/rendering/SceneRenderer';

const stage = document.querySelector<HTMLElement>('#stage')!;
const diagnostics = document.querySelector<HTMLElement>('#diagnostics')!;
const errorBox = document.querySelector<HTMLElement>('#error')!;
const scene = new Scene();
const camera = new PerspectiveCamera(48, 1, 0.1, 1600);
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.info.autoReset = false;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor('#102d3a');
stage.append(renderer.domElement);

const ocean = new OceanRenderer('high');
let pipeline: PostProcessingPipeline | null = null;
let useComposer = false;
const visualState: SceneVisualState = { kind: 'survival', elapsedSeconds: 0, phase: 'day', weather: 'calm' };
scene.add(ocean.mesh);
scene.fog = new Fog('#173d4a', 35, 170);
const horizonColor = new Color('#8bb8bd');
const skyColor = new Color('#8bb8bd');

const sun = new DirectionalLight('#ffe0a2', 3.2);
sun.position.set(-12, 20, 8);
scene.add(sun, new AmbientLight('#7ea9b0', 1.5));

const floor = new Mesh(new PlaneGeometry(180, 180), new MeshStandardMaterial({ color: '#6d6454', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.4;
scene.add(floor);

const markerMaterial = [new MeshStandardMaterial({ color: '#d06a45', roughness: .62 }), new MeshStandardMaterial({ color: '#e4c35d', roughness: .55 }), new MeshStandardMaterial({ color: '#b8e0d2', roughness: .5 })];
for (const [index, [x, z]] of [[-7, -8], [4, -12], [10, -5]].entries()) {
  const marker = new Mesh(new BoxGeometry(1.1, 5.8, 1.1), markerMaterial[index % markerMaterial.length]!);
  marker.position.set(x, -1.2, z);
  scene.add(marker);
}
for (const [x, z, y] of [[-4, -3, -1], [3, -7, -2], [8, -11, -2.7]] as const) {
  const object = new Mesh(new SphereGeometry(.75, 18, 10), new MeshStandardMaterial({ color: '#d8d0b7', roughness: .9 }));
  object.position.set(x, y, z);
  scene.add(object);
}

const { hull, body: hullBody, exclusion: hullExclusion } = createWaterLabHull();
scene.add(hull);

let quality: WaterQuality = 'high';
let amplitudeScale = 1;
let lightMode: 'day' | 'night' = 'day';
let cameraMode: 'near' | 'horizon' | 'top' = 'near';
let moving = true;
let paused = false;
let hullHeight = 0;
let time = 0;
let lastFrame = performance.now();
let cpuMs = 0;
let lastErrorPoll = 0;
let shaderErrors = 0;
let lastFrameInterval = 0;
const errorLogs: string[] = [];
const sample = createWaveSample();
const exclusions = [hullExclusion] as const;
const atmosphere: OceanAtmosphere = { phase: lightMode, fogColor: (scene.fog as Fog).color, horizonColor, skyColor, sunColor: sun.color, sunVisibility: 1 };
renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
  shaderErrors += 1;
  const details = [
    `program: ${gl.getProgramInfoLog(program) || 'no log'}`,
    `vertex: ${gl.getShaderInfoLog(vertexShader) || 'no log'}`,
    `fragment: ${gl.getShaderInfoLog(fragmentShader) || 'no log'}`,
  ].join('\n');
  if (!errorLogs.includes(details)) errorLogs.push(details);
};

function setPressed(selector: string, value: string): void {
  document.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.quality === value || button.dataset.state === value || button.dataset.light === value || button.dataset.camera === value)));
}
function updateCamera(): void {
  const targets = { near: new Vector3(0, 0, -2), horizon: new Vector3(0, 0, -24), top: new Vector3(0, 0, -4) };
  if (cameraMode === 'near') camera.position.set(9, 6, 14);
  if (cameraMode === 'horizon') camera.position.set(3, 8, 20);
  if (cameraMode === 'top') camera.position.set(0, 28, 2);
  camera.lookAt(targets[cameraMode]);
}
function updateAtmosphere(): void {
  const night = lightMode === 'night';
  const look = HIGH_WATER_LOOK[lightMode];
  scene.background = look.reflectionColor.clone();
  scene.fog = new Fog(look.fogColor, 35, 170);
  horizonColor.copy(look.skyColor);
  skyColor.copy(horizonColor);
  sun.color.copy(look.sunColor);
  sun.intensity = night ? .8 : 3.2;
}
function frame(now: number): void {
  requestAnimationFrame(frame);
  const rawDelta = Math.max(0, (now - lastFrame) / 1000);
  const delta = Math.min(.05, rawDelta);
  lastFrame = now;
  lastFrameInterval = rawDelta * 1000;
  if (!paused) time += delta;
  if (moving && !paused) hull.position.x = Math.sin(time * .22) * 7;
  sampleWaveFieldInto(sample, DEFAULT_WAVES, time, hull.position.x, hull.position.z, amplitudeScale);
  hull.position.y = sample.height + .18 + hullHeight;
  hull.rotation.z = sample.normal.x * -.22;
  hull.rotation.x = sample.normal.z * .22;
  ocean.follow(camera.position.x, camera.position.z);
  hullBody.updateWorldMatrix(true, false);
  hullExclusion.worldToLocal.copy(hullBody.matrixWorld).invert();
  ocean.setExclusions(exclusions);
  atmosphere.fogColor = (scene.fog as Fog).color;
  atmosphere.phase = lightMode;
  atmosphere.sunVisibility = lightMode === 'night' ? .25 : 1;
  ocean.update(time, amplitudeScale, lightMode === 'night' ? .012 : .006, atmosphere);
  const start = performance.now();
  renderer.info.reset();
  visualState.elapsedSeconds = time;
  if (useComposer) pipeline!.render(scene, camera, visualState);
  else renderer.render(scene, camera);
  cpuMs = performance.now() - start;
  if (now - lastErrorPoll > 1000) { lastErrorPoll = now; diagnostics.textContent = `Frame interval: ${lastFrameInterval.toFixed(1)} ms\nSimulation delta: ${(delta * 1000).toFixed(1)} ms\nCPU render: ${cpuMs.toFixed(2)} ms\nWebGL errors: ${renderer.getContext().getError()}\nShader errors: ${shaderErrors}${errorLogs.length ? `\n${errorLogs.join('\n')}` : ''}\nGeometry: ${renderer.info.memory.geometries}\nTextures: ${renderer.info.memory.textures}\nDraw calls: ${renderer.info.render.calls}`; }
}
document.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((button) => button.addEventListener('click', () => { quality = button.dataset.quality as WaterQuality; ocean.setQuality(quality); setPressed('[data-quality]', quality); }));
document.querySelectorAll<HTMLButtonElement>('[data-state]').forEach((button) => button.addEventListener('click', () => { amplitudeScale = button.dataset.state === 'rough' ? 1.65 : .62; setPressed('[data-state]', button.dataset.state!); }));
document.querySelectorAll<HTMLButtonElement>('[data-light]').forEach((button) => button.addEventListener('click', () => { lightMode = button.dataset.light as typeof lightMode; updateAtmosphere(); setPressed('[data-light]', lightMode); }));
document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach((button) => button.addEventListener('click', () => { cameraMode = button.dataset.camera as typeof cameraMode; updateCamera(); setPressed('[data-camera]', cameraMode); }));
document.querySelector<HTMLInputElement>('#moving')!.addEventListener('change', (event) => { moving = (event.target as HTMLInputElement).checked; });
document.querySelector<HTMLInputElement>('#hull-height')!.addEventListener('input', (event) => {
  hullHeight = (event.target as HTMLInputElement).valueAsNumber;
});
document.querySelector<HTMLInputElement>('#composer')!.addEventListener('change', (event) => {
  useComposer = (event.target as HTMLInputElement).checked;
  if (useComposer && !pipeline) {
    pipeline = new PostProcessingPipeline(renderer, 'high', 'high');
    pipeline.resize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
  }
});
document.querySelector<HTMLButtonElement>('#pause')!.addEventListener('click', (event) => { paused = !paused; (event.target as HTMLButtonElement).textContent = paused ? 'Resume' : 'Pause'; });

setPressed('[data-quality]', quality); setPressed('[data-state]', 'calm'); setPressed('[data-light]', lightMode); setPressed('[data-camera]', cameraMode); updateAtmosphere(); updateCamera();
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight, false); pipeline?.resize(window.innerWidth, window.innerHeight, renderer.getPixelRatio()); });
window.addEventListener('error', (event) => { errorLogs.push(`runtime: ${event.message}`); errorBox.textContent = event.message; errorBox.style.display = 'block'; });
window.addEventListener('unhandledrejection', (event) => { const message = event.reason instanceof Error ? event.reason.message : String(event.reason); errorLogs.push(`runtime: ${message}`); errorBox.textContent = message; errorBox.style.display = 'block'; });
window.dispatchEvent(new Event('resize'));
try { requestAnimationFrame(frame); } catch (cause) { errorBox.textContent = cause instanceof Error ? cause.message : String(cause); errorBox.style.display = 'block'; }
