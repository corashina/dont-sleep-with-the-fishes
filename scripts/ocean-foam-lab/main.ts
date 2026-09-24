import { OceanFoamSimulation } from '../../src/ocean/OceanFoamSimulation';
import { createOceanFoamDetail } from '../../src/ocean/OceanFoamDetail';
import type { OceanShaderUniforms } from '../../src/ocean/oceanShader';
import { installFoamPreview } from './foamPreview';
import { runFoamChecks } from './foamChecks';
import {
  AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, Vector2, WebGLRenderer,
} from 'three';
import { OceanRenderer, type OceanAtmosphere } from '../../src/ocean/OceanRenderer';
import { HIGH_WATER_LOOK } from '../../src/ocean/highWaterLook';
import { DEFAULT_WAVES, createWaveSample, sampleWaveFieldInto } from '../../src/ocean/WaveField';
import { createLifeboat } from '../../src/world/Lifeboat';
import { LifeboatAssets } from '../../src/world/LifeboatAssets';
import { createWaterExclusion } from '../../src/ocean/WaterExclusion';


type Preview = { id: string; title: string; flags: readonly number[]; sea?: number; night?: boolean; close?: boolean; low?: boolean; blood?: boolean; fog?: boolean; raised?: boolean; moved?: boolean; moving?: boolean };
const previews: readonly Preview[] = [
  { id: '01-baseline', title: 'Current water · foam disabled', flags: [0, 0] },
  { id: '02-crest-foam', title: 'Crest foam · broken edges and fine pores', flags: [1, 0] },
  { id: '03-hull-foam', title: 'Hull foam · curved boat contact', flags: [0, 1] },
  { id: '04-combined', title: 'Hull and crest foam · rough water', flags: [1, 1] },
  { id: '05-close', title: 'Hull and crest foam · close view', flags: [1, 1], close: true },
  { id: '06-calm', title: 'Hull and crest foam · calm water', flags: [1, 1], sea: 0.62 },
  { id: '07-night', title: 'Hull and crest foam · night', flags: [1, 1], night: true },
  { id: '08-low', title: 'Hull and crest foam · Low quality', flags: [1, 1], low: true },
  { id: '09-blood', title: 'Hull and crest foam · blood ocean', flags: [1, 1], blood: true },
  { id: '10-fog', title: 'Hull and crest foam · fog', flags: [1, 1], fog: true },
  { id: '11-raised-hull', title: 'Contact check · hull above water, no foam', flags: [0, 1], raised: true },
  { id: '12-moved-hull', title: 'Contact check · translated and rotated hull', flags: [0, 1], moved: true },
  { id: '13-source-off', title: 'Foam after its source stops', flags: [1, 1], close: true },
  { id: '14-moving-hull', title: 'Moving hull · foam left behind', flags: [0, 1], moving: true },
  { id: '15-origin-scroll', title: 'Camera scroll · foam stays in the world', flags: [1, 1] },
  { id: '16-paused', title: 'Paused clock · stable foam', flags: [1, 1] },
  { id: '17-quality-switch', title: 'Quality change · rebuilt Low foam', flags: [1, 1], low: true },
  { id: '18-context-restored', title: 'WebGL context restored · rebuilt foam', flags: [1, 1] },
];
const width = 1440, height = 900, fixedTime = 18.4;
const scene = new Scene();
const camera = new PerspectiveCamera(48, width / height, 0.1, 1600);
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(width, height);
document.querySelector('#stage')!.append(renderer.domElement);
const ocean = new OceanRenderer('high');
// Lab-only switches allow exact A/B captures of the production shader.
ocean.material.uniforms.uFoamPreviewMask = { value: new Vector2(1, 1) };
ocean.material.fragmentShader = 'uniform vec2 uFoamPreviewMask;\n' + ocean.material.fragmentShader;
let simulation = new OceanFoamSimulation('high', ocean.material.uniforms as OceanShaderUniforms);
const detail = createOceanFoamDetail();
installFoamPreview(ocean, simulation, detail);
let simulationQuality = 'high';
window.addEventListener('pagehide', () => { simulation.dispose(); detail.dispose(); }, { once: true });
scene.add(ocean.mesh);
const assets = await LifeboatAssets.load();
assets.configure(renderer.capabilities.getMaxAnisotropy());
const build = createLifeboat(assets);
const hull = build.root;
const body = hull;
const profile = build.waterExclusion;
const exclusion = createWaterExclusion(hull, profile.halfWidth, profile.halfLength,
  profile.taperStart, profile.minimumLocalY, undefined, profile.longitudinalProfile);
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
  const quality = preview.low ? 'low' : 'high';
  ocean.setQuality(quality);
  if (quality !== simulationQuality) {
    simulation.dispose(); simulation = new OceanFoamSimulation(quality, ocean.material.uniforms as OceanShaderUniforms);
    Object.assign(ocean.material.uniforms, simulation.uniforms); simulationQuality = quality;
  }
  simulation.reset(); simulation.sourceMask.set(1, 1);
  ocean.setBloodOceanIntensity(preview.blood ? 1 : 0);
  atmosphere.fogVolume = preview.fog ? 1 : 0;
  atmosphere.fogTime = fixedTime;
  atmosphere.fogLightColor.set('#97b2b6');
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
  (ocean.material.uniforms.uFoamPreviewMask!.value as Vector2).fromArray(preview.flags);

  if (preview.close) { camera.position.set(4.8, 3.3, 4.6); camera.lookAt(0.7, 0, -0.4); }
  else { camera.position.set(10, 8, 13); camera.lookAt(0, -0.2, -2); }
  if (preview.moved) {
    camera.position.x += 22; camera.position.z -= 11;
    camera.lookAt(22, -0.2, -13);
  }
  camera.updateMatrixWorld();
}

function render(): void {
  const sea = selected.sea ?? 1.45;
  hull.position.x = selected.moving ? time - fixedTime : selected.moved ? 22 : 0;
  hull.position.z = selected.moved ? -11 : 0;
  hull.rotation.y = selected.moved ? 0.7 : 0;
  sampleWaveFieldInto(sample, DEFAULT_WAVES, time, hull.position.x, hull.position.z, sea);
  hull.position.y = sample.height + 0.18 + (selected.raised ? 2.5 : 0);
  hull.rotation.z = sample.normal.x * -0.22;
  hull.rotation.x = sample.normal.z * 0.22;
  body.updateWorldMatrix(true, false);
  exclusion.worldToLocal.copy(body.matrixWorld).invert();
  ocean.setExclusions(exclusions);
  ocean.follow(camera.position.x, camera.position.z);
  ocean.update(time, sea, selected.night ? 0.012 : 0.006, atmosphere);
  simulation.setExclusions(exclusions);
  const beforeSim = renderer.getContext().getError();
  if (beforeSim) throw new Error('before main simulation: WebGL ' + beforeSim);
  simulation.update(renderer, time, camera);
  const afterSim = renderer.getContext().getError();
  if (afterSim) throw new Error('after main simulation: WebGL ' + afterSim);
  renderer.render(scene, camera);
  const error = renderer.getContext().getError();
  if (error) failures.push(`WebGL error: ${error}`);
  if (failures.length) throw new Error(failures.join('\n'));
}

function advanceTo(target: number): void {
  while (time + 1 / 60 < target) { time += 1 / 60; render(); }
  time = target; render();
}

function labeledCapture(title: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height + 76;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#0d2029'; context.fillRect(0, 0, width, canvas.height);
  context.fillStyle = '#dceae8'; context.font = '26px sans-serif'; context.fillText(title, 26, 33);
  context.fillStyle = '#9cb8bd'; context.font = '16px sans-serif';
  context.fillText('Production shaders · real lifeboat · no bubbles or added ripples', 26, 60);
  context.drawImage(renderer.domElement, 0, 76);
  return canvas;
}

async function upload(id: string, canvas: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    value => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
  const response = await fetch(`/__ocean-preview/${id}`, { method: 'POST', body: blob });
  if (!response.ok) throw new Error(`Screenshot upload failed: ${id}`);
}

// Importance: 95/100. A compiling shader can still silently omit foam or leave
// foam below an airborne hull. Compare rendered pixels against foam disabled.
function readPixels(): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  renderer.getContext().readPixels(0, 0, width, height, renderer.getContext().RGBA,
    renderer.getContext().UNSIGNED_BYTE, pixels);
  return pixels;
}
function verifyCoverage(preview: Preview): number {
  const enabled = readPixels();
  const flags = ocean.material.uniforms.uFoamPreviewMask!.value as Vector2;
  flags.set(0, 0);
  renderer.render(scene, camera);
  const disabled = readPixels();
  flags.fromArray(preview.flags);
  renderer.render(scene, camera);
  let changed = 0;
  for (let i = 0; i < enabled.length; i += 4) {
    const delta = Math.abs(enabled[i]! - disabled[i]!)
      + Math.abs(enabled[i + 1]! - disabled[i + 1]!)
      + Math.abs(enabled[i + 2]! - disabled[i + 2]!);
    if (delta > 6) changed++;
  }
  const mustBeClear = preview.id === '01-baseline' || preview.raised;
  if (mustBeClear && changed !== 0) throw new Error(preview.id + ': unexpected foam');
  if (!mustBeClear && changed < 50) throw new Error(preview.id + ': foam is missing');
  return changed;
}

function prepareSpecialCapture(preview: Preview): void {
    if (preview.id === '13-source-off') { simulation.sourceMask.set(0, 0); advanceTo(time + 1); }
    if (preview.id === '15-origin-scroll') { camera.position.x += 8; advanceTo(time + 1 / 30); }
    if (preview.id === '16-paused') {
      const pixels = readPixels();
      for (let i = 0; i < 20; i++) render();
      const after = readPixels();
      if (pixels.some((value, i) => value !== after[i])) throw new Error('Paused image changes');
    }
}

async function captureAll(): Promise<void> {
  const sheet = document.createElement('canvas');
  sheet.width = 1920; sheet.height = 1736;
  const context = sheet.getContext('2d')!;
  const records = [];
  const checkRenderer = new WebGLRenderer();
  let fieldChecks: Record<string, number | string>;
  try { fieldChecks = await runFoamChecks(checkRenderer); }
  finally { checkRenderer.dispose(); }
  for (const [index, preview] of previews.entries()) {
    configure(preview);
    time = fixedTime - 6;
    advanceTo(fixedTime);
    prepareSpecialCapture(preview);
    const changedPixels = verifyCoverage(preview);
    const capture = labeledCapture(preview.title);
    if (index < 12) context.drawImage(capture, (index % 3) * 640, Math.floor(index / 3) * 434, 640, 434);
    await upload(preview.id, capture);
    records.push({ id: preview.id, time, sea: preview.sea ?? 1.45, night: !!preview.night, flags: preview.flags, changedPixels, quality: preview.low ? 'low' : 'high' });
    status.textContent = `Captured ${index + 1}/${previews.length}`;
  }
  await upload('comparison', sheet);
  const motion = document.createElement('canvas');
  motion.width = 1440; motion.height = 976;
  const motionContext = motion.getContext('2d')!;
  configure({ id: 'motion', title: 'Foam motion', flags: [1, 1], sea: 0.9, close: true });
  time = fixedTime - 6; advanceTo(fixedTime);
  for (let index = 0; index < 4; index++) {
    advanceTo(fixedTime + index * 0.6);
    motionContext.drawImage(labeledCapture('Foam motion · ' + time.toFixed(1) + ' seconds'),
      (index % 2) * 720, Math.floor(index / 2) * 488, 720, 488);
  }
  await upload('motion', motion);
  for (const mode of ['aging', 'hull', 'origin']) {
    configure({id: mode, title: mode, flags: mode === 'hull' ? [0,1] : [1,1], close: true, moving: mode === 'hull'});
    time = fixedTime - 6; advanceTo(fixedTime);
    if (mode === 'aging') simulation.sourceMask.set(0,0);
    for (let index=0;index<4;index++) {
      if (mode === 'origin') camera.position.x += 0.25;
      advanceTo(fixedTime + (mode === 'aging' ? [0,1,3,6][index]! : index * 0.6));
      motionContext.drawImage(labeledCapture(mode + ' · ' + (time-fixedTime).toFixed(2) + ' seconds'),
        (index % 2)*720, Math.floor(index/2)*488, 720, 488);
    }
    await upload(mode + '-motion', motion);
  }
  await fetch('/__ocean-preview-complete', { method: 'POST', body: JSON.stringify({
    width, height, shaderErrors: failures, cases: records, fieldChecks,
    note: 'Production foam shader. Only the A/B switches are lab-specific.',
  }) });
}

const select = document.querySelector<HTMLSelectElement>('#effect')!;
for (const preview of previews) select.add(new Option(preview.title, preview.id));
select.addEventListener('change', () => {
  configure(previews.find(preview => preview.id === select.value)!); time = fixedTime - 6; advanceTo(fixedTime);
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
