import { installWaterPrototype } from './waterPrototype';
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
  { id: '01-baseline', title: 'Water without foam', flags: [0, 0] },
  { id: '02-open-water', title: 'Crest foam removed · open water unchanged', flags: [0, 1] },
  { id: '03-hull-foam', title: 'Cartoon hull foam · thin contact ribbon', flags: [0, 1] },
  { id: '04-close', title: 'Cartoon hull foam · close view', flags: [0, 1], close: true },
  { id: '05-prototype', title: 'PROTOTYPE · flowing filaments across all water', flags: [1, 1] },
  { id: '06-prototype-close', title: 'PROTOTYPE · close view', flags: [1, 1], close: true },
  { id: '07-night', title: 'Cartoon hull foam · night', flags: [0, 1], night: true },
  { id: '08-low', title: 'Cartoon hull foam · Low quality', flags: [0, 1], low: true },
  { id: '09-blood', title: 'Cartoon hull foam · blood ocean', flags: [0, 1], blood: true },
  { id: '10-fog', title: 'Cartoon hull foam · fog', flags: [0, 1], fog: true },
  { id: '11-raised-hull', title: 'Airborne hull · no foam', flags: [0, 1], raised: true },
  { id: '12-moved-hull', title: 'Cartoon hull foam · translated and rotated hull', flags: [0, 1], moved: true },
  { id: '13-calm', title: 'Cartoon hull foam · calm sea', flags: [0, 1], sea: 0.62 },
  { id: '14-prototype-calm', title: 'PROTOTYPE · calm sea', flags: [1, 1], sea: 0.62 },
  { id: '15-paused', title: 'Paused clock · stable edge', flags: [0, 1] },
  { id: '17-contact-close', title: 'Cartoon hull foam · calm close view', flags: [0, 1], sea: 0.62, close: true },
  { id: '16-context-restored', title: 'Context restored · cartoon hull foam', flags: [0, 1] },
];
const width = 1440, height = 900, fixedTime = 18.4;
const scene = new Scene();
const camera = new PerspectiveCamera(48, width / height, 0.1, 1600);
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(width, height);
document.querySelector('#stage')!.append(renderer.domElement);
const ocean = new OceanRenderer('high');
// Lab-only comparison of the production hull edge and the whole-water prototype.
ocean.material.uniforms.uFoamPreviewMask = { value: new Vector2(0, 1) };
installWaterPrototype(ocean.material);
window.addEventListener('pagehide', () => ocean.dispose(), { once: true });
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
const noExclusions: typeof exclusions = [];
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
let selected = previews.find(preview => preview.id === new URLSearchParams(location.search).get('view')) ?? previews[15]!;
let time = fixedTime;
let playing = false;
let lastTime = 0;

function configure(preview: Preview): void {
  selected = preview;
  const quality = preview.low ? 'low' : 'high';
  ocean.setQuality(quality);
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
  ocean.setExclusions(selected.id === '02-open-water' ? noExclusions : exclusions);
  ocean.follow(camera.position.x, camera.position.z);
  ocean.update(time, sea, selected.night ? 0.012 : 0.006, atmosphere);
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
  context.fillText('Thin cartoon hull contact · prototype water is lab-only', 26, 60);
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
  ocean.material.uniformsNeedUpdate = true;
  renderer.render(scene, camera);
  const disabled = readPixels();
  flags.fromArray(preview.flags);
  ocean.material.uniformsNeedUpdate = true;
  renderer.render(scene, camera);
  let changed = 0;
  for (let i = 0; i < enabled.length; i += 4) {
    const delta = Math.abs(enabled[i]! - disabled[i]!)
      + Math.abs(enabled[i + 1]! - disabled[i + 1]!)
      + Math.abs(enabled[i + 2]! - disabled[i + 2]!);
    if (delta > 6) changed++;
  }
  const mustBeClear = preview.id === '01-baseline' || preview.id === '02-open-water' || preview.raised;
  if (mustBeClear && changed !== 0) throw new Error(preview.id + ': unexpected foam');
  if (!mustBeClear && changed < 50) throw new Error(preview.id + ': foam is missing (' + changed + ' pixels)');
  return changed;
}

function prepareSpecialCapture(preview: Preview): void {
    if (preview.id === '15-paused') {
      const pixels = readPixels();
      for (let i = 0; i < 20; i++) render();
      const after = readPixels();
      if (pixels.some((value, i) => value !== after[i])) throw new Error('Paused image changes');
    }
}

async function restoreMainContext(): Promise<boolean> {
  const extension = renderer.getContext().getExtension('WEBGL_lose_context');
  if (!extension) return false;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Production context restore timed out')), 5000);
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      clearTimeout(timeout); resolve();
    }, {once: true});
    renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); setTimeout(() => extension.restoreContext(), 100);
    }, {once: true});
    extension.loseContext();
  });
  return true;
}

async function restoreCase(preview: Preview, checks: Record<string, number | string>): Promise<void> {
  if (preview.id !== '16-context-restored') return;
  if (!await restoreMainContext()) { checks.productionContextRestoration = 'unavailable'; return; }
  advanceTo(time + 6);
  checks.productionContextRestoration = 'passed';
}

function captureCase(preview: Preview, checks: Record<string, number | string>): HTMLCanvasElement {
  if (preview.id !== '16-context-restored' || checks.productionContextRestoration === 'passed')
    return labeledCapture(preview.title);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height + 76;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#0d2029'; context.fillRect(0,0,canvas.width,canvas.height);
  context.fillStyle = 'white'; context.font = '26px sans-serif';
  context.fillText('CHECK UNAVAILABLE: WEBGL_lose_context is unavailable', 26, 60);
  return canvas;
}

async function captureAll(): Promise<void> {
  const sheet = document.createElement('canvas');
  sheet.width = 1920; sheet.height = 1736;
  const context = sheet.getContext('2d')!;
  const records = [];
  const fieldChecks: Record<string, number | string> = {};
  for (const [index, preview] of previews.entries()) {
    configure(preview);
    time = fixedTime - 6;
    advanceTo(fixedTime);
    await restoreCase(preview, fieldChecks);
    prepareSpecialCapture(preview);
    const capture = captureCase(preview, fieldChecks);
    if (index < 12) context.drawImage(capture, (index % 3) * 640, Math.floor(index / 3) * 434, 640, 434);
    await upload(preview.id, capture);
    const changedPixels = verifyCoverage(preview);
    records.push({ id: preview.id, time, sea: preview.sea ?? 1.45, night: !!preview.night, flags: preview.flags, changedPixels, quality: preview.low ? 'low' : 'high' });
    status.textContent = `Captured ${index + 1}/${previews.length}`;
  }
  await upload('comparison', sheet);
  const motion = document.createElement('canvas');
  motion.width = 1440; motion.height = 976;
  const motionContext = motion.getContext('2d')!;
  configure({ id: 'motion', title: 'Foam motion', flags: [0, 1], sea: 0.9, close: true });
  time = fixedTime - 6; advanceTo(fixedTime);
  for (let index = 0; index < 4; index++) {
    advanceTo(fixedTime + index * 0.6);
    motionContext.drawImage(labeledCapture('Foam motion · ' + time.toFixed(1) + ' seconds'),
      (index % 2) * 720, Math.floor(index / 2) * 488, 720, 488);
  }
  await upload('motion', motion);
  configure({id: 'prototype-motion', title: 'Prototype motion', flags: [1,1], close: true});
  for (let index=0; index<4; index++) {
    time = fixedTime + index * 0.6; render();
    motionContext.drawImage(labeledCapture('PROTOTYPE · ' + time.toFixed(1) + ' seconds'),
      (index % 2)*720, Math.floor(index/2)*488, 720, 488);
  }
  await upload('prototype-motion', motion);
  await fetch('/__ocean-preview-complete', { method: 'POST', body: JSON.stringify({
    width, height, shaderErrors: failures, cases: records, fieldChecks,
    note: 'Production cartoon hull foam. Whole-water material remains a lab-only prototype.',
  }) });
}

const select = document.querySelector<HTMLSelectElement>('#effect')!;
for (const preview of previews) select.add(new Option(preview.title, preview.id));
select.value = selected.id;
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
