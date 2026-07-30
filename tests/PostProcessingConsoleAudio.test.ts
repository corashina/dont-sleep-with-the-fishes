// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createVisualQualityPreference } from '../src/rendering/visualQuality';
import { createWaterQualityPreference } from '../src/rendering/waterQuality';
import {
  PostProcessingConsole,
  type AudioControls,
} from '../src/ui/PostProcessingConsole';

describe('PostProcessingConsole audio controls', () => {
  it('changes master volume and mute', () => {
    const mount = document.createElement('main');
    const audio: AudioControls = {
      volume: 0.7,
      muted: false,
      setVolume: vi.fn(),
      setMuted: vi.fn(),
    };
    const tuning = new PostProcessingConsole(
      mount,
      {
        getState: () => ({
          ambientOcclusionAvailable: true,
          ambientOcclusionMode: 'composite',
          ambientOcclusionIntensity: 0.5,
          ambientOcclusionRadius: 0.2,
        }),
        setAmbientOcclusionMode: () => undefined,
        setNumeric: () => undefined,
      },
      () => undefined,
      undefined,
      createVisualQualityPreference(() => undefined, null),
      undefined,
      undefined,
      createWaterQualityPreference(() => undefined, null),
      undefined,
      audio,
    );

    const volume = tuning.element.querySelector<HTMLInputElement>(
      '[data-audio-volume]',
    )!;
    volume.value = '35';
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    const mute = tuning.element.querySelector<HTMLInputElement>('[data-audio-muted]')!;
    mute.checked = true;
    mute.dispatchEvent(new Event('change', { bubbles: true }));

    expect(audio.setVolume).toHaveBeenCalledWith(0.35);
    expect(audio.setMuted).toHaveBeenCalledWith(true);
    expect(
      tuning.element.querySelector<HTMLOutputElement>('[data-audio-volume-output]')?.value,
    ).toBe('35%');
    expect(
      tuning.element.querySelector<HTMLOutputElement>('[data-audio-muted-state]')?.value,
    ).toBe('ON');
  });
});
