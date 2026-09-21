import { writeFileSync } from 'node:fs';

// Original underwater groans. All oscillators close on the loop boundary.
const sampleRate = 24000;
const seconds = 16;
const count = sampleRate * seconds;
const samples = new Float64Array(count);
const tau = Math.PI * 2;
let peak = 0;
for (let index = 0; index < count; index += 1) {
  const time = index / sampleRate;
  const breath = (1 - Math.cos(tau * time / 8)) * 0.5;
  const swell = 0.2 + 0.8 * breath * breath;
  const throat = tau * 47 * time + 9 * Math.sin(tau * time / seconds);
  const groan = Math.sin(throat) + 0.35 * Math.sin(throat * 2 + 0.6)
    + 0.18 * Math.sin(throat * 3 + Math.sin(tau * time / 4));
  const distant = Math.sin(tau * 123.0625 * time + 13 * Math.sin(tau * time / 16));
  const rasp = Math.sin(tau * 231 * time + 3 * Math.sin(tau * 17 * time));
  const sample = swell * (groan * 0.48 + distant * 0.18 + rasp * 0.035)
    + Math.sin(tau * 35 * time) * 0.12;
  samples[index] = sample;
  peak = Math.max(peak, Math.abs(sample));
}

const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(count * 2, 40);
for (let index = 0; index < count; index += 1) {
  wav.writeInt16LE(Math.round(samples[index] / peak * 24575), 44 + index * 2);
}
writeFileSync(new URL('../src/assets/audio/underUsPresence.wav', import.meta.url), wav);
