import { writeFileSync } from 'node:fs';

// Original synthesized foley: a low jaw impact, dry wood snaps, and a short crunch.
const rate = 44100;
const samples = new Float64Array(rate);
let seed = 1947;
let low = 0;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
for (let i = 0; i < samples.length; i++) {
  const t = i / rate;
  const n = noise();
  low += 0.13 * (n - low);
  let snap = 0;
  for (const start of [0, 0.035, 0.09, 0.16, 0.24]) {
    const age = t - start;
    if (age >= 0) snap += Math.exp(-age * 65) * (n * 0.5 + Math.sin(age * 2100) * 0.3);
  }
  const crush = (low * 2.8 + n * 0.15) * Math.exp(-t * 7) * (0.5 + 0.5 * Math.sin(t * 160) ** 2);
  const thump = Math.sin(2 * Math.PI * (105 * t - 35 * t * t)) * Math.exp(-t * 14);
  samples[i] = (snap * 0.5 + crush + thump * 0.7) * Math.min(1, t * 1600) * Math.min(1, (1 - t) * 30);
}
let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] / peak * 29000), 44 + i * 2);
writeFileSync(new URL('../src/assets/audio/fogMonsterBite.wav', import.meta.url), wav);
