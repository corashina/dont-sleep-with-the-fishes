import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  enumerateMissingPickupSets,
  runBalanceSimulation,
  type BalanceSimulationProgress,
} from '../src/survival/balanceSimulation';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function resolveIndices(): number[] {
  const explicit = process.env.SIM_INDICES;
  if (explicit !== undefined && explicit !== '') {
    return explicit.split(',').map((text) => Number(text.trim()));
  }
  const sampleTotal = Number(requiredEnv('SIM_SAMPLE_TOTAL'));
  const sampleStart = Number(requiredEnv('SIM_SAMPLE_START'));
  const sampleCount = Number(requiredEnv('SIM_SAMPLE_COUNT'));
  const all = enumerateMissingPickupSets().length;
  const indices: number[] = [];
  for (let offset = sampleStart; offset < sampleStart + sampleCount; offset += 1) {
    indices.push(Math.floor((offset * all) / sampleTotal));
  }
  return indices;
}

const label = process.env.SIM_LABEL ?? 'slice';
const loadoutIndices = resolveIndices();
const seedsPerLoadout = Number(process.env.SIM_SEEDS ?? '10');
const fishingReactionSuccess = Number(process.env.SIM_FISHING_SUCCESS ?? '0.9');
const progressEvery = Number(process.env.SIM_PROGRESS_EVERY ?? '1');
const outputPath = requiredEnv('SIM_OUTPUT');
const startedAt = Date.now();

function reportProgress(progress: BalanceSimulationProgress): void {
  if (progressEvery > 1
    && progress.completedRuns % progressEvery !== 0
    && progress.completedRuns < progress.totalRuns) return;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[${label}] run ${progress.completedRuns}/${progress.totalRuns}`
    + ` | loadout ${progress.loadoutIndex + 1}/${progress.loadoutCount}`
    + ` | ${elapsed}s`);
}

const report = runBalanceSimulation({
  seedsPerLoadout,
  fishingReactionSuccess,
  loadoutIndices,
  onProgress: reportProgress,
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report), 'utf8');

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`[${label}] done ${report.totalRuns} runs in ${elapsed}s`
  + ` | rescued ${report.rescued}`
  + ` | dead ${report.dead}`
  + ` | sunk ${report.sunk}`
  + ` | report ${outputPath}`);
