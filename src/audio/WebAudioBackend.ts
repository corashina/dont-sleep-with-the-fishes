import type {
  AudioBackend,
  AudioVoice,
} from './AudioBackend';
import {
  AUDIO_MANIFEST,
  SOUND_IDS,
  type AudioBusId,
  type SoundId,
} from './audioManifest';

type BrowserAudioContext = AudioContext;

function clampGain(gain: number): number {
  if (!Number.isFinite(gain)) return 0;
  return Math.min(1, Math.max(0, gain));
}

function rampGain(
  parameter: AudioParam,
  context: BrowserAudioContext,
  gain: number,
  rampSeconds: number,
): void {
  const now = context.currentTime;
  const duration = Math.max(0, Number.isFinite(rampSeconds) ? rampSeconds : 0);
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(clampGain(gain), now + duration);
}

class WebAudioVoice implements AudioVoice {
  private readonly callbacks = new Set<() => void>();
  private ended = false;
  private stopping = false;

  constructor(
    readonly id: SoundId,
    private readonly context: BrowserAudioContext,
    private readonly source: AudioBufferSourceNode,
    private readonly gainNode: GainNode,
    private readonly baseGain: number,
  ) {
    source.onended = () => this.finish();
  }

  setGain(gain: number, rampSeconds = 0.05): void {
    if (this.ended || this.stopping) return;
    rampGain(
      this.gainNode.gain,
      this.context,
      this.baseGain * clampGain(gain),
      rampSeconds,
    );
  }

  stop(fadeSeconds = 0): void {
    if (this.ended || this.stopping) return;
    this.stopping = true;
    const fade = Math.max(0, Number.isFinite(fadeSeconds) ? fadeSeconds : 0);
    if (fade > 0) {
      rampGain(this.gainNode.gain, this.context, 0, fade);
    }
    try {
      this.source.stop(this.context.currentTime + fade);
    } catch {
      this.finish();
    }
  }

  onEnded(callback: () => void): void {
    if (this.ended) {
      callback();
      return;
    }
    this.callbacks.add(callback);
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.source.onended = null;
    this.source.disconnect();
    this.gainNode.disconnect();
    const callbacks = [...this.callbacks];
    this.callbacks.clear();
    for (const callback of callbacks) callback();
  }
}

export class WebAudioBackend implements AudioBackend {
  private readonly master: GainNode;
  private readonly buses: Readonly<Record<AudioBusId, GainNode>>;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private readonly voices = new Map<SoundId, WebAudioVoice[]>();
  private loaded = false;
  private disposed = false;

  constructor(
    private readonly context: BrowserAudioContext,
    private readonly fetchAudio: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.master = context.createGain();
    this.master.connect(context.destination);
    this.buses = {
      music: context.createGain(),
      ambience: context.createGain(),
      effects: context.createGain(),
      interface: context.createGain(),
    };
    for (const bus of Object.values(this.buses)) bus.connect(this.master);
  }

  async load(): Promise<void> {
    if (this.disposed || this.loaded) return;
    const decoded = await Promise.all(SOUND_IDS.map(async (id) => {
      const response = await this.fetchAudio(AUDIO_MANIFEST[id].url);
      if (!response.ok) {
        throw new Error(`Audio download failed for ${id}: ${response.status}`);
      }
      const bytes = await response.arrayBuffer();
      return [id, await this.context.decodeAudioData(bytes)] as const;
    }));
    if (this.disposed) return;
    for (const [id, buffer] of decoded) this.buffers.set(id, buffer);
    this.loaded = true;
  }

  async unlock(): Promise<void> {
    if (this.disposed || this.context.state === 'running') return;
    await this.context.resume();
  }

  play(id: SoundId): AudioVoice | null {
    if (this.disposed || !this.loaded) return null;
    const definition = AUDIO_MANIFEST[id];
    const buffer = this.buffers.get(id);
    if (buffer === undefined) return null;
    const active = this.voices.get(id) ?? [];
    while (active.length >= definition.maxVoices) active.shift()?.stop();

    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    source.buffer = buffer;
    source.loop = definition.loop;
    gainNode.gain.value = definition.gain;
    source.connect(gainNode);
    gainNode.connect(this.buses[definition.bus]);
    const voice = new WebAudioVoice(
      id,
      this.context,
      source,
      gainNode,
      definition.gain,
    );
    active.push(voice);
    this.voices.set(id, active);
    voice.onEnded(() => {
      const index = active.indexOf(voice);
      if (index >= 0) active.splice(index, 1);
      if (active.length === 0) this.voices.delete(id);
    });
    source.start();
    return voice;
  }

  setBusGain(bus: AudioBusId, gain: number, rampSeconds = 0.05): void {
    if (this.disposed) return;
    rampGain(this.buses[bus].gain, this.context, gain, rampSeconds);
  }

  setMasterGain(gain: number, rampSeconds = 0.05): void {
    if (this.disposed) return;
    rampGain(this.master.gain, this.context, gain, rampSeconds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const active of this.voices.values()) {
      for (const voice of active) voice.stop();
    }
    this.voices.clear();
    this.buffers.clear();
    for (const bus of Object.values(this.buses)) bus.disconnect();
    this.master.disconnect();
    void this.context.close();
  }
}
