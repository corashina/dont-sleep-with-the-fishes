import { describe, expect, it } from 'vitest';
import {
  AUDIO_MANIFEST,
  SOUND_IDS,
} from '../src/audio/audioManifest';

describe('audio manifest', () => {
  it('contains every approved sound exactly once', () => {
    expect(SOUND_IDS).toHaveLength(48);
    expect(new Set(SOUND_IDS).size).toBe(48);
    expect(Object.keys(AUDIO_MANIFEST).sort()).toEqual([...SOUND_IDS].sort());
  });

  it('registers the Eerie Melody ambience as one loop', () => {
    expect(SOUND_IDS).toContain('eerieMelody');
    expect(AUDIO_MANIFEST.eerieMelody).toMatchObject({
      loop: true,
      maxVoices: 1,
    });
  });

  it('uses build assets and valid playback settings', () => {
    for (const id of SOUND_IDS) {
      const entry = AUDIO_MANIFEST[id];
      expect(entry.url).toMatch(/\.(?:mp3|wav)(?:\?|$)/);
      expect(entry.gain).toBeGreaterThan(0);
      expect(entry.gain).toBeLessThanOrEqual(1);
      expect(entry.maxVoices).toBeGreaterThan(0);
      if (entry.loop) expect(entry.maxVoices).toBe(1);
    }
  });

  it('keeps the approved shared action sources singular', () => {
    expect(SOUND_IDS).toContain('itemHandling');
    expect(SOUND_IDS).toContain('journal');
    expect(SOUND_IDS).toContain('eating');
    expect(SOUND_IDS).not.toContain('itemPickup');
    expect(SOUND_IDS).not.toContain('journalPage');
    expect(SOUND_IDS).not.toContain('energyBar');
  });
});
