import { OceanFoamSimulation } from '../../src/ocean/OceanFoamSimulation';
import { summarizeFrameTimes } from './frameTiming';

interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
/** Benchmark-only instrumentation. Queries are pooled and read only after availability. */
export function instrumentFoamGpu() {
  const original = OceanFoamSimulation.prototype.update;
  let gl: WebGL2RenderingContext | null = null;
  let extension: TimerExtension | null = null;
  let pool: { query: WebGLQuery; pending: boolean }[] = [];
  let recording = false;
  const samples: number[] = [];
  const poll = () => {
    if (!gl || !extension) return;
    const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
    for (const slot of pool) {
      if (!slot.pending) continue;
      if (disjoint) { gl.deleteQuery(slot.query); slot.query = gl.createQuery()!; slot.pending = false; }
      else if (gl.getQueryParameter(slot.query, gl.QUERY_RESULT_AVAILABLE)) {
        samples.push(gl.getQueryParameter(slot.query, gl.QUERY_RESULT) / 1e6);
        slot.pending = false;
      }
    }
  };
  OceanFoamSimulation.prototype.update = function(renderer, time, camera) {
    if (!gl) {
      gl = renderer.getContext() as WebGL2RenderingContext;
      extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
      if (extension) pool = Array.from({length: 8}, () => ({query: gl!.createQuery()!, pending: false}));
    }
    poll();
    const slot = recording && extension ? pool.find(value => !value.pending) : undefined;
    if (slot) gl.beginQuery(extension!.TIME_ELAPSED_EXT, slot.query);
    try { original.call(this, renderer, time, camera); }
    finally { if (slot) { gl.endQuery(extension!.TIME_ELAPSED_EXT); slot.pending = true; } }
  };
  return {
    start() { poll(); samples.length = 0; recording = true; },
    stop() { recording = false; poll(); return samples.length ? summarizeFrameTimes(samples) : null; },
    dispose() {
      OceanFoamSimulation.prototype.update = original;
      for (const slot of pool) gl!.deleteQuery(slot.query);
    },
  };
}
