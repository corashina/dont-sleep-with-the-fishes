import {
  AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector4, WebGLRenderer,
} from 'three';
import { OceanRenderer, type OceanAtmosphere } from '../../src/ocean/OceanRenderer';
import { HIGH_WATER_LOOK } from '../../src/ocean/highWaterLook';
import { DEFAULT_WAVES, createWaveSample, sampleWaveFieldInto } from '../../src/ocean/WaveField';
import { createWaterLabHull } from '../water-lab/hull';
import { installPreviewEffects } from './effects';

type Preview = { id: string; title: string; flags: readonly number[]; light: number; sea?: number; night?: boolean; close?: boolean };
const previews: readonly Preview[] = [
  { id: '01-baseline', title: 'Current water · baseline', flags: [0, 0, 0, 0], light: 0 },
  { id: '02-crest-foam', title: 'Crest foam · broken whitecaps', flags: [1, 0, 0, 0], light: 0 },
  { id: '03-hull-foam', title: 'Hull foam · water contact', flags: [0, 1, 0, 0], light: 0 },
  { id: '04-bubbles', title: 'Bubbles · surface rings', flags: [0, 0, 1, 0], light: 0 },
  { id: '05-ripples', title: 'Ripples · hull rings and fine waves', flags: [0, 0, 0, 1], light: 0 },
  { id: '06-lighting', title: 'Light · softer water highlights', flags: [0, 0, 0, 0], light: 1 },
  { id: '07-combined', title: 'All effects · rough water', flags: [1, 1, 1, 1], light: 1 },
  { id: '08-calm', title: 'All effects · calm water', flags: [1, 1, 1, 1], light: 1, sea: 0.62 },
  { id: '09-night', title: 'All effects · night', flags: [1, 1, 1, 1], light: 1, night: true },
  { id: '10-bubbles-close', title: 'Bubbles · close view', flags: [0, 0, 1, 0], light: 1, close: true },
  { id: '11-combined-close', title: 'All effects · close view', flags: [1, 1, 1, 1], light: 1, close: true },
];
const width = 1440, height = 900, fixedTime = 18.4;
const scene = new Scene();
const camera = new PerspectiveCamera(48, width / height, 0.1, 1600);
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(width, height);
document.querySelector('#stage')!.append(renderer.domElement);
const ocean = new OceanRenderer('high');
installPreviewEffects(ocean);
scene.add(ocean.mesh);
const { hull, body, exclusion } = createWaterLabHull();
scene.add(hull);
const exclusions = [exclusion];
const sun = new DirectionalLight('#ffe0a2', 3.2);
sun.position.set(-12, 20, -14);
const ambient = new AmbientLight('#7ea9b0', 1.5);
scene.add(sun, ambient);
const sample = createWaveSample();
const atmosphere: OceanAtmosphere = {
  phase: 'day', fogVolume: 0, fogTime: 0, fogLightColor: new Color(),
  fogColor: new Color(), horizonColor: new Color(), skyColor: new Color(),
  sunColor: new Color(), sunVisibility: 1,
};
const failures: string[] = [];
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  failures.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'));
};
const status = document.querySelector<HTMLElement>('#status')!;
let selected = previews[0]!;
let time = fixedTime;
let playing = false;
let lastTime = 0;

function configure(preview: Preview): void {
  selected = preview;
  const look = HIGH_WATER_LOOK[preview.night ? 'night' : 'day'];
  scene.background = look.reflectionColor.clone();
  scene.fog = new Fog(look.fogColor, 35, 170);
  atmosphere.phase = preview.night ? 'night' : 'day';
  atmosphere.fogColor.copy(look.fogColor);
  atmosphere.horizonColor.copy(look.skyColor);
  atmosphere.skyColor.copy(look.skyColor);
  atmosphere.sunColor.copy(look.sunColor);
  atmosphere.sunVisibility = look.lightStrength;
  sun.color.copy(look.sunColor);
  sun.intensity = preview.night ? 0.5 : 3.2;
  ambient.intensity = preview.night ? 0.25 : 1.5;
  (ocean.material.uniforms.uPreviewEffects!.value as Vector4).fromArray(preview.flags);
  ocean.material.uniforms.uPreviewLighting!.value = preview.light;
  if (preview.close) { camera.position.set(4.8, 3.4, 5.0); camera.lookAt(1.9, 0, 0.4); }
  else { camera.position.set(10, 8, 13); camera.lookAt(0, -0.2, -2); }
  camera.updateMatrixWorld();
}

function render(): void {
  const sea = selected.sea ?? 1.45;
  sampleWaveFieldInto(sample, DEFAULT_WAVES, time, 0, 0, sea);
  hull.position.y = sample.height + 0.18;
  hull.rotation.z = sample.normal.x * -0.22;
  hull.rotation.x = sample.normal.z * 0.22;
  body.updateWorldMatrix(true, false);
  exclusion.worldToLocal.copy(body.matrixWorld).invert();
  ocean.setExclusions(exclusions);
  ocean.follow(camera.position.x, camera.position.z);
  ocean.update(time, sea, selected.night ? 0.012 : 0.006, atmosphere);
  renderer.render(scene, camera);
  const error = renderer.getContext().getError();
  if (error) failures.push(`WebGL error: ${error}`);
  if (failures.length) throw new Error(failures.join('\n'));
}

function labeledCapture(title: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height + 76;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#0d2029'; context.fillRect(0, 0, width, canvas.height);
  context.fillStyle = '#dceae8'; context.font = '26px sans-serif'; context.fillText(title, 26, 33);
  context.fillStyle = '#9cb8bd'; context.font = '16px sans-serif';
  context.fillText('GPU render · experimental preview · game unchanged', 26, 60);
  context.drawImage(renderer.domElement, 0, 76);
  return canvas;
}

async function upload(id: string, canvas: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    value => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
  const response = await fetch(`/__ocean-preview/${id}`, { method: 'POST', body: blob });
  if (!response.ok) throw new Error(`Screenshot upload failed: ${id}`);
}

async function captureAll(): Promise<void> {
  const sheet = document.createElement('canvas');
  sheet.width = 1920; sheet.height = 1302;
  const context = sheet.getContext('2d')!;
  const records = [];
  for (const [index, preview] of previews.entries()) {
    configure(preview);
    time = fixedTime;
    render(); render();
    const capture = labeledCapture(preview.title);
    if (index < 9) context.drawImage(capture, (index % 3) * 640, Math.floor(index / 3) * 434, 640, 434);
    await upload(preview.id, capture);
    records.push({ id: preview.id, time, sea: preview.sea ?? 1.45, night: !!preview.night, flags: preview.flags });
    status.textContent = `Captured ${index + 1}/${previews.length}`;
  }
  await upload('comparison', sheet);
  await fetch('/__ocean-preview-complete', { method: 'POST', body: JSON.stringify({
    width, height, shaderErrors: failures, cases: records,
    note: 'Rendered from the current ocean shader with preview-only material changes. No gameplay integration.',
  }) });
}

const select = document.querySelector<HTMLSelectElement>('#effect')!;
for (const preview of previews) select.add(new Option(preview.title, preview.id));
select.addEventListener('change', () => {
  configure(previews.find(preview => preview.id === select.value)!); time = fixedTime; render();
});
document.querySelector('#motion')!.addEventListener('click', event => {
  playing = !playing; (event.target as HTMLButtonElement).textContent = playing ? 'Pause' : 'Play';
});
function frame(now: number): void {
  if (playing) { time += Math.min((now - lastTime) / 1000, 0.05); render(); }
  lastTime = now; requestAnimationFrame(frame);
}
async function main(): Promise<void> {
  configure(selected); render();
  if (new URLSearchParams(location.search).has('capture')) await captureAll();
  else { status.textContent = 'Ready · fixed comparison time'; requestAnimationFrame(frame); }
}
void main().catch(async error => {
  status.textContent = String(error);
  await fetch('/__ocean-preview-failed', { method: 'POST', body: String(error) });
});
