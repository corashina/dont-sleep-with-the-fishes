import type {
  AudioBackend,
  AudioListenerPose,
  AudioVoice,
  SpatialAudioEmitter,
  SpatialAudioOptions,
} from './AudioBackend';
import {
  AUDIO_MANIFEST,
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
  private source: AudioBufferSourceNode | null = null;
  private playbackOffset = 0;
  private startedAt = 0;
  private paused = false;
  private ended = false;
  private stopping = false;

  constructor(
    readonly id: SoundId,
    private readonly context: BrowserAudioContext,
    private readonly buffer: AudioBuffer,
    private readonly loop: boolean,
    private readonly gainNode: GainNode,
    private readonly baseGain: number,
    private readonly outputNodes: readonly AudioNode[],
  ) {}

  start(): void {
    if (!this.ended && this.source === null) this.startSource();
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

  setPaused(paused: boolean): void {
    if (this.ended || this.stopping || this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      const source = this.source;
      if (source === null) return;
      this.playbackOffset = this.currentOffset();
      this.source = null;
      source.onended = null;
      try {
        source.stop();
      } catch {
        // The source can already be stopped by the browser at this boundary.
      }
      source.disconnect();
      return;
    }
    this.startSource();
  }

  stop(fadeSeconds = 0): void {
    if (this.ended || this.stopping) return;
    this.stopping = true;
    const fade = Math.max(0, Number.isFinite(fadeSeconds) ? fadeSeconds : 0);
    if (fade > 0) {
      rampGain(this.gainNode.gain, this.context, 0, fade);
    }
    try {
      if (this.source === null) {
        this.finish();
        return;
      }
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
    if (this.source !== null) {
      this.source.onended = null;
      this.source.disconnect();
      this.source = null;
    }
    for (const node of this.outputNodes) node.disconnect();
    const callbacks = [...this.callbacks];
    this.callbacks.clear();
    for (const callback of callbacks) callback();
  }

  private currentOffset(): number {
    const elapsed = Math.max(0, this.context.currentTime - this.startedAt);
    const offset = this.playbackOffset + elapsed;
    const duration = this.buffer.duration;
    if (!Number.isFinite(duration) || duration <= 0) return offset;
    return this.loop ? offset % duration : Math.min(offset, duration);
  }

  private startSource(): void {
    if (this.ended || this.stopping || this.paused || this.source !== null) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = this.loop;
    source.connect(this.gainNode);
    source.onended = () => {
      if (this.source !== source) return;
      this.source = null;
      source.disconnect();
      this.finish();
    };
    this.source = source;
    this.startedAt = this.context.currentTime;
    source.start(0, this.playbackOffset);
  }
}

export class WebAudioBackend implements AudioBackend {
  private readonly master: GainNode;
  private readonly buses: Readonly<Record<AudioBusId, GainNode>>;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private readonly references = new Map<SoundId, number>();
  private readonly pending = new Map<SoundId, Promise<AudioBuffer>>();
  private readonly voices = new Map<SoundId, WebAudioVoice[]>();
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

  async acquire(ids: readonly SoundId[]): Promise<void> {
    if (this.disposed) throw new Error('Audio backend is disposed.');
    const uniqueIds = [...new Set(ids)];
    for (const id of uniqueIds) {
      this.references.set(id, (this.references.get(id) ?? 0) + 1);
    }
    try {
      await Promise.all(uniqueIds.map((id) => this.loadBuffer(id)));
      if (this.disposed) throw new Error('Audio backend was disposed while loading.');
    } catch (error) {
      this.release(uniqueIds);
      throw error;
    }
  }

  release(ids: readonly SoundId[]): void {
    for (const id of new Set(ids)) {
      const references = this.references.get(id) ?? 0;
      if (references > 1) {
        this.references.set(id, references - 1);
        continue;
      }
      this.references.delete(id);
      this.stopVoices(id);
      this.buffers.delete(id);
    }
  }

  async unlock(): Promise<void> {
    if (this.disposed || this.context.state === 'running') return;
    await this.context.resume();
  }

  play(id: SoundId): AudioVoice | null {
    if (this.disposed) return null;
    const definition = AUDIO_MANIFEST[id];
    const buffer = this.buffers.get(id);
    if (buffer === undefined) return null;
    const active = this.voices.get(id) ?? [];
    while (active.length >= definition.maxVoices) active.shift()?.stop();

    const gainNode = this.context.createGain();
    gainNode.gain.value = definition.gain;
    gainNode.connect(this.buses[definition.bus]);
    const voice = new WebAudioVoice(
      id,
      this.context,
      buffer,
      definition.loop,
      gainNode,
      definition.gain,
      [gainNode],
    );
    active.push(voice);
    this.voices.set(id, active);
    voice.onEnded(() => {
      const index = active.indexOf(voice);
      if (index >= 0) active.splice(index, 1);
      if (active.length === 0) this.voices.delete(id);
    });
    voice.start();
    return voice;
  }

  playSpatialLoop(
    id: SoundId,
    emitters: readonly SpatialAudioEmitter[],
    options: Readonly<SpatialAudioOptions>,
  ): AudioVoice | null {
    if (this.disposed || emitters.length === 0) return null;
    const definition = AUDIO_MANIFEST[id];
    const buffer = this.buffers.get(id);
    if (buffer === undefined) return null;
    const active = this.voices.get(id) ?? [];
    while (active.length >= definition.maxVoices) active.shift()?.stop();

    const gainNode = this.context.createGain();
    const spatialGain = clampGain(options.gain);
    const baseGain = definition.gain * spatialGain;
    const refDistance = Math.max(0.01, finiteOr(options.refDistance, 1));
    const maxDistance = Math.max(refDistance, finiteOr(options.maxDistance, refDistance));
    const rolloffFactor = Math.max(0, finiteOr(options.rolloffFactor, 1));
    const panners: PannerNode[] = [];
    gainNode.gain.value = baseGain;
    for (const emitter of emitters) {
      const panner = this.context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.refDistance = refDistance;
      panner.maxDistance = maxDistance;
      panner.rolloffFactor = rolloffFactor;
      setPosition(panner, emitter.position[0], emitter.position[1], emitter.position[2], this.context.currentTime);
      gainNode.connect(panner);
      panner.connect(this.buses[definition.bus]);
      panners.push(panner);
    }
    const voice = new WebAudioVoice(
      id,
      this.context,
      buffer,
      true,
      gainNode,
      baseGain,
      [gainNode, ...panners],
    );
    active.push(voice);
    this.voices.set(id, active);
    voice.onEnded(() => {
      const index = active.indexOf(voice);
      if (index >= 0) active.splice(index, 1);
      if (active.length === 0) this.voices.delete(id);
    });
    voice.start();
    return voice;
  }

  setListenerPose(pose: Readonly<AudioListenerPose>): void {
    if (this.disposed) return;
    const listener = this.context.listener;
    const now = this.context.currentTime;
    setListenerPosition(listener, pose.position.x, pose.position.y, pose.position.z, now);
    setListenerOrientation(
      listener,
      pose.forward.x,
      pose.forward.y,
      pose.forward.z,
      pose.up.x,
      pose.up.y,
      pose.up.z,
      now,
    );
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
    this.references.clear();
    this.pending.clear();
    for (const bus of Object.values(this.buses)) bus.disconnect();
    this.master.disconnect();
    void this.context.close();
  }

  private loadBuffer(id: SoundId): Promise<AudioBuffer> {
    const loaded = this.buffers.get(id);
    if (loaded !== undefined) return Promise.resolve(loaded);
    const current = this.pending.get(id);
    if (current !== undefined) return current;

    let request: Promise<AudioBuffer>;
    request = (async () => {
      const response = await this.fetchAudio(AUDIO_MANIFEST[id].url);
      if (!response.ok) {
        throw new Error(`Audio download failed for ${id}: ${response.status}`);
      }
      const bytes = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(bytes);
      if (!this.disposed && (this.references.get(id) ?? 0) > 0) {
        this.buffers.set(id, buffer);
      }
      return buffer;
    })().finally(() => {
      if (this.pending.get(id) === request) this.pending.delete(id);
    });
    this.pending.set(id, request);
    return request;
  }

  private stopVoices(id: SoundId): void {
    const active = this.voices.get(id);
    if (active === undefined) return;
    this.voices.delete(id);
    for (const voice of active) voice.stop();
  }
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function setPosition(
  panner: PannerNode,
  x: number,
  y: number,
  z: number,
  time: number,
): void {
  panner.positionX.setValueAtTime(finiteOr(x, 0), time);
  panner.positionY.setValueAtTime(finiteOr(y, 0), time);
  panner.positionZ.setValueAtTime(finiteOr(z, 0), time);
}

function setListenerPosition(
  listener: AudioListener,
  x: number,
  y: number,
  z: number,
  time: number,
): void {
  listener.positionX.setValueAtTime(finiteOr(x, 0), time);
  listener.positionY.setValueAtTime(finiteOr(y, 0), time);
  listener.positionZ.setValueAtTime(finiteOr(z, 0), time);
}

function setListenerOrientation(
  listener: AudioListener,
  forwardX: number,
  forwardY: number,
  forwardZ: number,
  upX: number,
  upY: number,
  upZ: number,
  time: number,
): void {
  listener.forwardX.setValueAtTime(finiteOr(forwardX, 0), time);
  listener.forwardY.setValueAtTime(finiteOr(forwardY, 0), time);
  listener.forwardZ.setValueAtTime(finiteOr(forwardZ, -1), time);
  listener.upX.setValueAtTime(finiteOr(upX, 0), time);
  listener.upY.setValueAtTime(finiteOr(upY, 1), time);
  listener.upZ.setValueAtTime(finiteOr(upZ, 0), time);
}
