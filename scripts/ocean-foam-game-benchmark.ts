import { instrumentFoamGpu } from './ocean-foam-lab/gpuTiming';
const gpuTimer = instrumentFoamGpu();
void import('../src/main');
import { summarizeFrameTimes } from './ocean-foam-lab/frameTiming';
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;z-index:99999;right:12px;top:12px;padding:10px;background:#10232b;color:white;font:14px sans-serif';
panel.innerHTML = '<button type="button">Measure scene (10s warmup + 30s)</button><pre></pre>';
document.body.append(panel);
const button = panel.querySelector('button')!;
const output = panel.querySelector('pre')!;
function hardwareInfo() {
  const canvas = document.querySelector('canvas');
  const gl = canvas?.getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return {gpu: info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unavailable',
    browser: navigator.userAgent, width: canvas?.width, height: canvas?.height, pixelRatio: devicePixelRatio};
}
button.onclick = () => {
  button.disabled = true;
  const samples: number[] = [];
  let first = 0, previous = 0;
  let invalid = false;
  let recording = false;
  const frame = (now: number) => {
    if (!first) first = now;
    if (document.hidden) invalid = true;
    if (now - first >= 10000 && !recording) { recording = true; gpuTimer.start(); }
    if (recording && previous) samples.push(now - previous);
    previous = now;
    output.textContent = Math.ceil(Math.max(0, 40000 - (now - first)) / 1000) + ' seconds remaining';
    if (now - first < 40000) { requestAnimationFrame(frame); return; }
    const report = { ...summarizeFrameTimes(samples), invalid, ...hardwareInfo(),
      gpuFoamMs: gpuTimer.stop(), targetMet: !invalid && summarizeFrameTimes(samples).p95Ms <= 16.7 };
    output.textContent = JSON.stringify(report, null, 2);
    button.disabled = false;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    link.download = 'foam-game-timing.json'; link.textContent = 'Save timing JSON'; panel.append(link);
  };
  requestAnimationFrame(frame);
};
