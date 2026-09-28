import { writeFileSync } from 'node:fs';

// Original synthesized foley: a distant cannon shot and a cannonball striking a wooden hull.
const rate = 44100;
let seed = 1805;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};

function lowpass(cutoff) {
  const k = 1 - Math.exp(-2 * Math.PI * cutoff / rate);
  let state = 0;
  return (input) => (state += k * (input - state));
}

function bandpass(center, q) {
  const w = 2 * Math.PI * center / rate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0; const b2 = -alpha / a0;
  const a1 = -2 * Math.cos(w) / a0; const a2 = (1 - alpha) / a0;
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  return (input) => {
    const output = b0 * input + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = input; y2 = y1; y1 = output;
    return output;
  };
}

const decay = (age, rateValue) => (age < 0 ? 0 : Math.exp(-age * rateValue));

function cannonFire() {
  const samples = new Float64Array(Math.round(rate * 3.4));
  const blast = lowpass(2600);
  const body = lowpass(420);
  const rumble = lowpass(120);
  const echo = lowpass(700);
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const n = noise();
    const crack = blast(n) * decay(t, 45);
    const boom = Math.sin(2 * Math.PI * (62 * t - 18 * t * t)) * decay(t, 5.5);
    const bodyNoise = body(n) * 3.2 * decay(t, 4.2);
    const tail = rumble(n) * 7.5 * decay(t, 1.35) * Math.min(1, t * 18);
    const reflected = echo(n) * 2.2 * (decay(t - 0.42, 7) + 0.55 * decay(t - 1.05, 5));
    samples[i] = (crack * 0.9 + boom * 0.85 + bodyNoise + tail + reflected)
      * Math.min(1, t * 2400) * Math.min(1, (samples.length / rate - t) * 4);
  }
  return samples;
}

function cannonImpact() {
  const samples = new Float64Array(Math.round(rate * 2.4));
  const thumpNoise = lowpass(260);
  const woods = [bandpass(520, 9), bandpass(890, 11), bandpass(1460, 8), bandpass(2350, 6)];
  const crackleFilter = bandpass(3100, 1.4);
  const creakFilter = bandpass(340, 5);
  const patterFilter = bandpass(1800, 1.2);
  const snaps = [0, 0.018, 0.047, 0.083, 0.14, 0.21, 0.33, 0.46];
  let creakPhase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const n = noise();
    const thump = Math.sin(2 * Math.PI * (88 * t - 40 * t * t)) * decay(t, 9)
      + thumpNoise(n) * 3 * decay(t, 11);
    let excite = 0;
    for (let s = 0; s < snaps.length; s++) excite += n * decay(t - snaps[s], 140 - s * 9) * (1 - s * 0.09);
    let crack = 0;
    for (const wood of woods) crack += wood(excite);
    const crackle = crackleFilter(n) * (noise() > 0.93 ? 1 : 0.08) * decay(t - 0.05, 4.5) * 1.6;
    creakPhase += 2 * Math.PI * (96 + 34 * Math.sin(t * 5.3) + 18 * t) / rate;
    const saw = (creakPhase / Math.PI) % 2 - 1;
    const creakEnvelope = Math.max(0, Math.min(1, (t - 0.28) * 5)) * decay(t - 0.28, 2.1);
    const creak = creakFilter(saw + n * 0.2) * creakEnvelope * 1.4;
    const patter = patterFilter(n) * (noise() > 0.985 ? 1 : 0) * decay(t - 0.7, 2.4) * (t > 0.7 ? 1 : 0) * 2.2;
    samples[i] = (thump * 0.95 + crack * 1.7 + crackle + creak + patter)
      * Math.min(1, t * 3000) * Math.min(1, (samples.length / rate - t) * 5);
  }
  return samples;
}

function writeWav(name, samples) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] / peak * 29000), 44 + i * 2);
  writeFileSync(new URL(`../src/assets/audio/${name}.wav`, import.meta.url), wav);
}

writeWav('cannonFire', cannonFire());
writeWav('cannonImpact', cannonImpact());
