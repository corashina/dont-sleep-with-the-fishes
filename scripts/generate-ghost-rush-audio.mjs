import { writeFileSync } from 'node:fs';

// Original synthesized ghost rush: a rising wail, five close whooshing shrieks, and a falling moan.
// Pass times match ghostBaitChoreography: rush cue, then each ghost reaches the player.
const rate = 44100;
const length = 4.4;
const passes = [0, 1, 2, 3, 4].map(index => 1.575 + index * 0.28);
const firstPass = passes[0];
const lastPass = passes[passes.length - 1];
const samples = new Float64Array(Math.round(rate * length));
const voices = [
  { frequency: 196, phase: 0 },
  { frequency: 207.6, phase: 0 },
  { frequency: 277.2, phase: 0 },
  { frequency: 293.7, phase: 0 },
];
const shrieks = passes.map((_, index) => ({ frequency: 1250 + index * 90, phase: 0 }));
let seed = 7331;
let air = 0;
let body = 0;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
const smooth = value => {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
};

for (let i = 0; i < samples.length; i++) {
  const t = i / rate;
  const n = noise();

  // Wail: rises toward the first pass, then drops as the ghosts rush away.
  const rise = smooth(t / firstPass);
  const fall = smooth((t - firstPass) / (lastPass - firstPass + 0.9));
  const pitch = 2 ** ((5 * rise - 14 * fall) / 12);
  const wailLevel = (0.08 + 0.92 * rise ** 2.2) * (1 - smooth((t - lastPass) / 1.1));
  const tremolo = 0.72 + 0.28 * Math.sin(2 * Math.PI * (5.2 + 3 * rise) * t);
  let wail = 0;
  for (let v = 0; v < voices.length; v++) {
    const voice = voices[v];
    const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * (4.1 + v * 0.7) * t + v);
    voice.phase += 2 * Math.PI * voice.frequency * pitch * vibrato / rate;
    wail += Math.sin(voice.phase) + 0.35 * Math.sin(voice.phase * 2 + 0.3) + 0.18 * Math.sin(voice.phase * 3);
  }
  wail *= wailLevel * tremolo * 0.16;

  // Whoosh and shriek for each ghost that passes through the player.
  let rushLevel = 0;
  let shriek = 0;
  for (let p = 0; p < passes.length; p++) {
    const age = t - passes[p];
    const whoosh = Math.exp(-((age + 0.03) ** 2) / (2 * 0.09 ** 2));
    rushLevel += whoosh * (p === 0 ? 1.2 : 0.9);
    if (age > -0.12 && age < 0.45) {
      const glide = smooth((age + 0.12) / 0.57);
      const voice = shrieks[p];
      const rough = 1 + 0.04 * Math.sin(2 * Math.PI * 38 * t);
      voice.phase += 2 * Math.PI * voice.frequency * (1.15 - 0.55 * glide) * rough / rate;
      const level = smooth((age + 0.12) / 0.1) * (1 - smooth(age / 0.45));
      shriek += Math.sin(voice.phase) * level * 0.22;
    }
  }
  const cutoff = Math.min(0.55, 0.035 + 0.18 * rise + 0.3 * Math.min(1, rushLevel));
  air += cutoff * (n - air);
  body += 0.02 * (n - body);
  const breath = air * (0.05 + 0.1 * rise) + (air - body) * rushLevel * 0.9;

  // Low pressure drop as the first ghost hits.
  const hit = t - firstPass;
  const thump = hit > -0.02 ? Math.sin(2 * Math.PI * (58 * hit - 30 * hit * hit)) * Math.exp(-Math.max(0, hit) * 9) : 0;

  samples[i] = (wail + shriek + breath + thump * 0.45)
    * Math.min(1, t * 20)
    * Math.min(1, (length - t) * 4);
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
writeFileSync(new URL('../src/assets/audio/ghostRush.wav', import.meta.url), wav);
