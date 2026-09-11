import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  mergeBalanceReports,
  type BalanceReport,
} from '../src/survival/balanceSimulation';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function daySamples(
  endingsByDay: Readonly<Record<string, number>>,
  endingId?: string,
): number[] {
  const days: number[] = [];
  for (const [key, count] of Object.entries(endingsByDay)) {
    const [id, dayText] = key.split(':');
    if (endingId !== undefined && id !== endingId) continue;
    const day = Number(dayText);
    for (let index = 0; index < count; index += 1) days.push(day);
  }
  return days.sort((left, right) => left - right);
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  return values[Math.min(values.length - 1, Math.floor(fraction * (values.length - 1)))]!;
}

function round(value: number | null): number {
  return value === null ? 0 : Math.round(value * 1000) / 1000;
}

function formatRate(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${((count / total) * 100).toFixed(1)}%`;
}

interface EndingRow {
  readonly id: string;
  readonly count: number;
  readonly mean: number | null;
  readonly median: number | null;
  readonly minimum: number | null;
  readonly maximum: number | null;
}

function endingRows(
  endingsByDay: Readonly<Record<string, number>>,
): EndingRow[] {
  const ids = new Set<string>();
  for (const key of Object.keys(endingsByDay)) ids.add(key.split(':')[0]!);
  return [...ids].map((id) => {
    const days = daySamples(endingsByDay, id);
    const count = days.length;
    return {
      id,
      count,
      mean: round(mean(days)),
      median: days.length === 0 ? null : days[Math.floor((days.length - 1) / 2)]!,
      minimum: days[0] ?? null,
      maximum: days[days.length - 1] ?? null,
    };
  }).sort((left, right) => right.count - left.count);
}

function countRows(id: string, count: number, total: number): string {
  return `| ${id} | ${count} | ${formatRate(count, total)} |`;
}

const reportDir = requiredEnv('SIM_REPORT_DIR');
const outputPath = process.env.SIM_REPORT_OUTPUT ?? 'docs/scenario-simulation.md';
const files = readdirSync(reportDir)
  .filter((name) => name.startsWith('scenario-slice-') && name.endsWith('.json'))
  .sort();
if (files.length === 0) {
  throw new Error(`No slice reports found in ${reportDir}.`);
}

const reports = files.map((name) => JSON.parse(
  readFileSync(join(reportDir, name), 'utf8'),
) as BalanceReport);
const report = mergeBalanceReports(reports);

const totalRuns = report.totalRuns;
const rescueDays = daySamples(report.endingsByDay, 'rescue');
const noSignalRescueDays = daySamples(report.noSignal.endingsByDay, 'rescue');
const signalRate = totalRuns === 0 ? 0 : report.rescued / totalRuns;
const noSignalRate = report.noSignal.totalRuns === 0
  ? 0
  : report.noSignal.rescued / report.noSignal.totalRuns;

const lines: string[] = [];
lines.push('# Scenario Simulation Report');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push('## Configuration');
lines.push('');
lines.push('| Setting | Value |');
lines.push('| --- | --- |');
lines.push(`| Loadouts sampled | ${Object.keys(report.byMissingPickupSet).length} |`);
lines.push(`| Slices (parallel agents) | ${reports.length} |`);
lines.push(`| Total seed runs | ${totalRuns} |`);
lines.push(`| Total sessions | ${totalRuns * 2} |`);
lines.push('');

lines.push('## Total Game Statistics');
lines.push('');
lines.push(`Each seed run plays two sessions: one with signals enabled and one with signals disabled.`);
lines.push(`Total sessions: **${totalRuns * 2}**.`);
lines.push('');
lines.push('### Outcomes (seed runs)');
lines.push('');
lines.push('| Outcome | Count | Rate |');
lines.push('| --- | --- | --- |');
lines.push(countRows('rescued', report.rescued, totalRuns));
lines.push(countRows('dead', report.dead, totalRuns));
lines.push(countRows('sunk', report.sunk, totalRuns));
lines.push(countRows('abducted', report.abducted, totalRuns));
lines.push(countRows('blocked', report.blocked, totalRuns));
lines.push('');

lines.push('### Rescue timing (signal cohort)');
lines.push('');
lines.push('| Statistic | Day |');
lines.push('| --- | --- |');
lines.push(`| Mean | ${round(report.averageRescueDay)} |`);
lines.push(`| Median | ${report.medianRescueDay ?? '-'} |`);
lines.push(`| Minimum | ${rescueDays[0] ?? '-'} |`);
lines.push(`| P10 | ${percentile(rescueDays, 0.1) ?? '-'} |`);
lines.push(`| P90 | ${percentile(rescueDays, 0.9) ?? '-'} |`);
lines.push(`| Maximum | ${rescueDays[rescueDays.length - 1] ?? '-'} |`);
lines.push(`| Rescued day 30-35 | ${formatRate(rescueDays.filter((day) => day >= 30 && day <= 35).length, rescueDays.length)} |`);
lines.push('');

lines.push('### Ending distribution (signal cohort)');
lines.push('');
lines.push('| Ending | Count | Rate | Mean day | Median day | Min day | Max day |');
lines.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const row of endingRows(report.endingsByDay)) {
  lines.push(`| ${row.id} | ${row.count} | ${formatRate(row.count, totalRuns)}`
    + ` | ${row.mean ?? '-'} | ${row.median ?? '-'} | ${row.minimum ?? '-'} | ${row.maximum ?? '-'} |`);
}
lines.push('');

lines.push('### Signals enabled vs disabled');
lines.push('');
lines.push('| Cohort | Runs | Rescued | Rescue rate | Mean rescue day | Median rescue day |');
lines.push('| --- | --- | --- | --- | --- | --- |');
lines.push(`| Signals enabled | ${totalRuns} | ${report.rescued} | ${formatRate(report.rescued, totalRuns)}`
  + ` | ${round(report.averageRescueDay)} | ${report.medianRescueDay ?? '-'} |`);
lines.push(`| Signals disabled | ${report.noSignal.totalRuns} | ${report.noSignal.rescued}`
  + ` | ${formatRate(report.noSignal.rescued, report.noSignal.totalRuns)}`
  + ` | ${round(report.noSignal.averageRescueDay)} | ${report.noSignal.medianRescueDay ?? '-'} |`);
lines.push('');
lines.push(`Signal effect: rescue rate ${round(signalRate - noSignalRate)}`
  + ` | mean rescue day ${round(
    report.averageRescueDay === null || report.noSignal.averageRescueDay === null
      ? null
      : report.averageRescueDay - report.noSignal.averageRescueDay,
  )}`);
lines.push('');

lines.push('## Integrity');
lines.push('');
lines.push('| Check | Count |');
lines.push('| --- | --- |');
lines.push(`| Blocked loadouts | ${report.blockedLoadouts.length} |`);
lines.push(`| Unrescued loadouts | ${report.unrescuedLoadouts.length} |`);
lines.push('');

const content = `${lines.join('\n')}\n`;
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content, 'utf8');
console.log(`[report] merged ${reports.length} slices, ${totalRuns} seed runs, ${totalRuns * 2} sessions`);
console.log(`[report] wrote ${outputPath}`);
