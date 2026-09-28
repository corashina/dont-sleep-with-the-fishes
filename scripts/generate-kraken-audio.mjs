import { writeFileSync } from 'node:fs';

// Original synthesized Kraken sounds. No external samples.
const sampleRate = 24000;
const tau = Math.PI * 2;

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ biquad. `type` is 'low', 'band', or 'high'. The frequency may change per sample. */
function biquad(type) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (input, frequency, q) => {
    const w = tau * Math.min(frequency, sampleRate * 0.45) / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    let b0, b1, b2;
    if (type === 'low') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
    else if (type === 'high') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
    const output = (b0 * input + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = input; y2 = y1; y1 = output;
    return output;
  };
}

/** A Schroeder reverb for a wide, open sea. */
function reverb(samples, mix, size) {
  const combs = [1557, 1617, 1491, 1422].map(length => ({ buffer: new Float64Array(Math.round(length * size)), index: 0 }));
  const passes = [225, 556].map(length => ({ buffer: new Float64Array(length), index: 0 }));
  const output = new Float64Array(samples.length);
  for (let index = 0; index < samples.length; index++) {
    let wet = 0;
    for (const comb of combs) {
      const delayed = comb.buffer[comb.index];
      comb.buffer[comb.index] = samples[index] + delayed * 0.84;
      comb.index = (comb.index + 1) % comb.buffer.length;
      wet += delayed;
    }
    wet *= 0.25;
    for (const pass of passes) {
      const delayed = pass.buffer[pass.index];
      pass.buffer[pass.index] = wet + delayed * 0.5;
      pass.index = (pass.index + 1) % pass.buffer.length;
      wet = delayed - wet * 0.5;
    }
    output[index] = samples[index] * (1 - mix) + wet * mix;
  }
  return output;
}

function envelope(time, attack, hold, release) {
  if (time < 0) return 0;
  if (time < attack) return time / attack;
  if (time < attack + hold) return 1;
  return Math.max(0, 1 - (time - attack - hold) / release);
}

/** Short upward chirps: bubbles and gurgles. */
function addBubbles(samples, next, from, to, rate, low, high, gain) {
  let time = from;
  while (time < to) {
    time += -Math.log(1 - next()) / rate(time);
    const start = Math.floor(time * sampleRate);
    const length = Math.floor((0.02 + next() * 0.06) * sampleRate);
    const base = low + next() * (high - low);
    const loudness = gain * (0.4 + next() * 0.6);
    let phase = 0;
    for (let offset = 0; offset < length && start + offset < samples.length; offset++) {
      const t = offset / length;
      phase += tau * base * (1 + t * 1.8) / sampleRate;
      samples[start + offset] += Math.sin(phase) * Math.sin(Math.PI * t) * (1 - t) * loudness;
    }
  }
}

/** Short noise bursts that ring through a band: splashes and pouring sheets. */
function addSplashes(samples, next, from, to, rate, center, gain) {
  let time = from;
  const filter = biquad('band');
  const grains = new Float64Array(samples.length);
  while (time < to) {
    time += -Math.log(1 - next()) / rate(time);
    const start = Math.floor(time * sampleRate);
    const length = Math.floor((0.03 + next() * 0.12) * sampleRate);
    const loudness = gain * (0.3 + next() * 0.7);
    for (let offset = 0; offset < length && start + offset < samples.length; offset++) {
      grains[start + offset] += (next() * 2 - 1) * Math.exp(-offset / length * 4) * loudness;
    }
  }
  for (let index = 0; index < samples.length; index++) samples[index] += filter(grains[index], center, 0.6);
}

function write(name, samples, peakTarget = 0.92) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const wav = Buffer.alloc(44 + samples.length * 2);
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
  wav.writeUInt32LE(samples.length * 2, 40);
  const fade = Math.floor(sampleRate * 0.05);
  for (let index = 0; index < samples.length; index++) {
    const edge = Math.min(1, index / 64, (samples.length - 1 - index) / fade);
    wav.writeInt16LE(Math.round(samples[index] / peak * peakTarget * edge * 32767), 44 + index * 2);
  }
  writeFileSync(new URL(`../src/assets/audio/${name}.wav`, import.meta.url), wav);
}

/** A beast voice: a low buzzing source with a rattle, shaped by moving throat formants. */
function voice(seconds, next, contour, formantOpen, rattleRate) {
  const count = Math.floor(seconds * sampleRate);
  const output = new Float64Array(count);
  const formants = [biquad('band'), biquad('band'), biquad('band')];
  const body = biquad('low');
  const breath = biquad('band');
  let phase = 0;
  let drift = 0;
  for (let index = 0; index < count; index++) {
    const time = index / sampleRate;
    drift += (next() - 0.5) * 0.02 - drift * 0.0008;
    const frequency = contour(time) * (1 + drift * 0.04);
    phase += frequency / sampleRate;
    // A band-limited buzz with a period-doubled growl beneath it.
    let buzz = 0;
    const limit = Math.min(48, Math.floor(sampleRate * 0.4 / frequency));
    for (let harmonic = 1; harmonic <= limit; harmonic++) buzz += Math.sin(tau * phase * harmonic) / harmonic ** 1.05;
    buzz += Math.sin(tau * phase * 0.5) * 0.9 + Math.sin(tau * phase * 1.5) * 0.3;
    const rattle = 0.45 + 0.55 * Math.abs(Math.sin(Math.PI * rattleRate(time) * time)) ** 2.5;
    const source = buzz * rattle;
    const open = formantOpen(time);
    const shaped = formants[0](source, 240 + open * 160, 3.5) * 1.3
      + formants[1](source, 520 + open * 380, 4.5) * 0.9
      + formants[2](source, 1050 + open * 450, 6) * 0.45
      + body(source, 200, 0.8) * 1.2;
    const hiss = breath(next() * 2 - 1, 700 + open * 600, 1.2) * 0.5 * (0.3 + open);
    output[index] = Math.tanh((shaped + hiss) * 1.6);
  }
  return output;
}

function surge() {
  const seconds = 7;
  const next = random(11);
  const samples = new Float64Array(seconds * sampleRate);
  const rush = biquad('low');
  const hiss = biquad('band');
  let brown = 0;
  let boomPhase = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    brown = brown * 0.985 + (next() * 2 - 1) * 0.12;
    const swell = envelope(time, 2.6, 2.2, 2.2);
    const cutoff = 180 + 1600 * Math.min(1, time / 3);
    boomPhase += (26 + 20 * Math.exp(-time * 1.4)) / sampleRate;
    const boom = Math.sin(tau * boomPhase) * Math.exp(-time * 0.9) * envelope(time, 0.08, 0, 9);
    samples[index] = rush(brown, cutoff, 0.7) * swell * 2.4 + boom * 0.9
      + hiss(next() * 2 - 1, 2600, 0.7) * swell * 0.25;
  }
  addSplashes(samples, next, 0.8, 6.4, time => 6 + 40 * Math.min(1, Math.max(0, (time - 1) / 4)), 2400, 0.55);
  addSplashes(samples, next, 1.5, 6, time => 4 + 10 * Math.min(1, time / 4), 700, 0.9);
  addBubbles(samples, next, 0, 3.5, () => 14, 110, 380, 0.22);
  write('krakenSurge', reverb(samples, 0.28, 1.1));
}

function roar() {
  const seconds = 5.6;
  const next = random(23);
  const contour = time => {
    const rise = Math.min(1, time / 0.7);
    const fall = Math.max(0, (time - 3.4) / 2.2);
    return 34 + 22 * rise - 16 * fall + Math.sin(time * 5.3) * 1.5;
  };
  const open = time => Math.min(1, time / 0.9) * (1 - Math.max(0, (time - 3.2) / 2.4) * 0.8);
  const main = voice(seconds, next, contour, open, time => 17 + Math.sin(time * 1.3) * 5);
  const under = voice(seconds, next, time => contour(time) * 0.52, open, time => 11 + time);
  const samples = new Float64Array(main.length);
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    samples[index] = (main[index] + under[index] * 0.7) * envelope(time, 0.45, 2.7, 2.4);
  }
  addBubbles(samples, next, 0.2, 5.2, time => 10 + 12 * Math.sin(Math.PI * time / 5.6), 70, 240, 0.28);
  write('krakenRoar', reverb(samples, 0.36, 1.25));
}

function grip() {
  const seconds = 1.8;
  const next = random(37);
  const samples = new Float64Array(seconds * sampleRate);
  const squelch = biquad('band');
  const creak = biquad('band');
  let creakPhase = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const wet = [0, 0.22, 0.5].reduce((sum, start) => sum + Math.exp(-Math.max(0, time - start) * 9)
      * (time >= start ? 1 : 0), 0);
    const center = 650 - 420 * ((time * 3) % 1);
    creakPhase += (70 + 35 * Math.sin(time * 9) + next() * 20) / sampleRate;
    const stick = (creakPhase % 1) < 0.06 ? 1 : 0;
    const strain = envelope(time - 0.35, 0.2, 0.8, 0.4);
    samples[index] = squelch(next() * 2 - 1, center, 3) * wet * 1.4 + creak(stick, 520, 6) * strain * 2.2;
  }
  for (let pop = 0; pop < 6; pop++) {
    const start = Math.floor((0.05 + pop * 0.13 + next() * 0.05) * sampleRate);
    const frequency = 500 + next() * 700;
    for (let offset = 0; offset < 400; offset++) {
      samples[start + offset] += Math.sin(tau * frequency * offset / sampleRate) * Math.exp(-offset / 60) * 0.7;
    }
  }
  write('krakenGrip', reverb(samples, 0.15, 0.6));
}

function sink() {
  const seconds = 6.5;
  const next = random(53);
  const samples = new Float64Array(seconds * sampleRate);
  const rush = biquad('low');
  let brown = 0;
  const groan = voice(seconds, next, time => 30 - time * 1.6, () => 0.15, () => 9);
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    brown = brown * 0.985 + (next() * 2 - 1) * 0.12;
    samples[index] = rush(brown, 900 - time * 110, 0.7) * envelope(time, 0.6, 1.8, 3.8) * 2
      + groan[index] * envelope(time - 0.8, 1.2, 1.5, 3) * 0.45;
  }
  addBubbles(samples, next, 0.3, 6, time => 24 * Math.exp(-time * 0.35), 55, 230, 0.4);
  addSplashes(samples, next, 0, 3, time => 16 * Math.exp(-time), 1800, 0.45);
  write('krakenSink', reverb(samples, 0.32, 1.2));
}

surge();
roar();
grip();
sink();
