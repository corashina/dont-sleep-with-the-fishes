// Importance: 4/5. Protects spatial audio graphs, gain routing, and backend cleanup.
import { describe, expect, it, vi } from 'vitest';
import { WebAudioBackend } from '../src/audio/WebAudioBackend';

class FakeAudioParam {
  value = 0;
  readonly setValueAtTime = vi.fn((value: number) => { this.value = value; });
  readonly cancelScheduledValues = vi.fn();
  readonly linearRampToValueAtTime = vi.fn((value: number) => { this.value = value; });
}

class FakeNode {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeGain extends FakeNode {
  readonly gain = new FakeAudioParam();
}

class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  readonly start = vi.fn();
  readonly stop = vi.fn(() => this.onended?.());
}

class FakePanner extends FakeNode {
  panningModel: PanningModelType = 'equalpower';
  distanceModel: DistanceModelType = 'inverse';
  refDistance = 1;
  maxDistance = 10_000;
  rolloffFactor = 1;
  readonly positionX = new FakeAudioParam();
  readonly positionY = new FakeAudioParam();
  readonly positionZ = new FakeAudioParam();
}

class FakeListener {
  readonly positionX = new FakeAudioParam();
  readonly positionY = new FakeAudioParam();
  readonly positionZ = new FakeAudioParam();
  readonly forwardX = new FakeAudioParam();
  readonly forwardY = new FakeAudioParam();
  readonly forwardZ = new FakeAudioParam();
  readonly upX = new FakeAudioParam();
  readonly upY = new FakeAudioParam();
  readonly upZ = new FakeAudioParam();
}

class FakeContext {
  currentTime = 2;
  readonly state = 'running';
  readonly destination = new FakeNode();
  readonly listener = new FakeListener();
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  readonly panners: FakePanner[] = [];
  readonly resume = vi.fn(() => Promise.resolve());
  readonly close = vi.fn(() => Promise.resolve());
  readonly decodeAudioData = vi.fn(() => Promise.resolve({ duration: 60 } as AudioBuffer));

  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createPanner(): PannerNode {
    const panner = new FakePanner();
    this.panners.push(panner);
    return panner as unknown as PannerNode;
  }
}

describe('WebAudioBackend spatial loops', () => {
  it('resumes one-shot music from its paused offset', async () => {
    const context = new FakeContext();
    const fetchAudio = vi.fn(() => Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
    } as Response));
    const backend = new WebAudioBackend(
      context as unknown as AudioContext,
      fetchAudio,
    );
    await backend.acquire(['scavengeChase']);

    const voice = backend.play('scavengeChase')!;
    expect(context.sources[0]!.start).toHaveBeenCalledWith(0, 0);

    context.currentTime = 14;
    voice.setPaused(true);
    expect(context.sources[0]!.stop).toHaveBeenCalledOnce();

    context.currentTime = 30;
    voice.setPaused(false);
    expect(context.sources).toHaveLength(2);
    expect(context.sources[1]!.start).toHaveBeenCalledWith(0, 12);
    backend.dispose();
  });

  it('feeds one half-volume source through three positioned room panners', async () => {
    const context = new FakeContext();
    const fetchAudio = vi.fn(() => Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
    } as Response));
    const backend = new WebAudioBackend(
      context as unknown as AudioContext,
      fetchAudio,
    );
    await backend.acquire(['shipAlarm']);
    const emitters = [
      { position: [1, 5, 9] as const },
      { position: [2, 5, 19] as const },
      { position: [3, 5, -14] as const },
    ];

    const voice = backend.playSpatialLoop('shipAlarm', emitters, {
      gain: 0.5,
      refDistance: 1.5,
      maxDistance: 11,
      rolloffFactor: 1,
    });

    expect(voice?.id).toBe('shipAlarm');
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]).toMatchObject({ loop: true });
    expect(context.sources[0]!.start).toHaveBeenCalledOnce();
    expect(context.panners).toHaveLength(3);
    expect(context.panners.map((panner) => [
      panner.positionX.value,
      panner.positionY.value,
      panner.positionZ.value,
    ])).toEqual(emitters.map(({ position }) => [...position]));
    const voiceGain = context.gains.at(-1)!;
    expect(voiceGain.gain.value).toBeCloseTo(0.46 * 0.5);
    context.panners.forEach((panner) => {
      expect(panner).toMatchObject({
        panningModel: 'HRTF',
        distanceModel: 'linear',
        refDistance: 1.5,
        maxDistance: 11,
        rolloffFactor: 1,
      });
    });

    backend.setListenerPose({
      position: { x: 4, y: 3.7, z: 8 },
      forward: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    });
    expect(context.listener.positionX.value).toBe(4);
    expect(context.listener.positionY.value).toBe(3.7);
    expect(context.listener.positionZ.value).toBe(8);
    expect(context.listener.forwardX.value).toBe(1);
    expect(context.listener.upY.value).toBe(1);
    backend.dispose();
  });

  it('releases an event buffer after its last lease', async () => {
    const context = new FakeContext();
    const fetchAudio = vi.fn(() => Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
    } as Response));
    const backend = new WebAudioBackend(
      context as unknown as AudioContext,
      fetchAudio,
    );

    await backend.acquire(['tentacleMovement']);
    expect(backend.play('tentacleMovement')).not.toBeNull();

    backend.release(['tentacleMovement']);

    expect(backend.play('tentacleMovement')).toBeNull();
    backend.dispose();
  });
});
