// Importance: 9/10. Protects Empty Lifeboat staging, wave motion, and exit reactions.

import { Group, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EmptyLifeboatPresentation } from '../src/survival/EmptyLifeboatPresentation';
import type { DriftingWater } from '../src/survival/DriftingWaveMotion';
import { EVENT_BUNDLE_SPECS } from '../src/survival/eventBundleManifest';
import { FeaturedEventPresentations } from '../src/survival/FeaturedEventPresentations';

function createWater(): DriftingWater {
  return {
    sampleWaveInto: vi.fn((sample) => {
      sample.height = 0.25;
      sample.displacementX = 0;
      sample.displacementZ = 0;
      sample.normal.x = 0.1;
      sample.normal.y = 0.99;
      sample.normal.z = -0.05;
      return sample;
    }),
    readAmplitudeScale: vi.fn(() => 1),
  };
}

describe('EmptyLifeboatPresentation', () => {
  it('loads its pinned model through the featured event family', () => {
    const clone = vi.fn(() => new Group());
    const presentations = new FeaturedEventPresentations(
      { clone },
      new PerspectiveCamera(),
      new Group(),
      new Group(),
      new Group(),
      vi.fn(),
      'empty-lifeboat',
      createWater(),
    );

    presentations.stage('empty-lifeboat', 0);

    expect(EVENT_BUNDLE_SPECS['empty-lifeboat'].models).toEqual(['emptyLifeboat']);
    expect(clone).toHaveBeenCalledExactlyOnceWith('emptyLifeboat');
    expect(presentations.root.getObjectByName('empty-lifeboat:subject')).not.toBeNull();
    presentations.dispose();
  });

  it('stages the empty boat on the seeded side and follows the shared waves', () => {
    const water = createWater();
    const presentation = new EmptyLifeboatPresentation(new Group(), water);

    presentation.stage(0);
    presentation.update(2, 0);
    const subject = presentation.root.getObjectByName('empty-lifeboat:subject')!;
    expect(subject.position.x).toBeLessThan(0);
    expect(subject.position.y).toBeCloseTo(0.49);
    expect(presentation.root.userData.eventSide).toBe('left');
    expect(water.sampleWaveInto).toHaveBeenCalled();

    presentation.stage(1);
    presentation.update(3, 0);
    expect(subject.position.x).toBeGreaterThan(0);
    expect(presentation.root.userData.eventSide).toBe('right');
  });

  it('pulls close and leaves after the search', async () => {
    const presentation = new EmptyLifeboatPresentation(new Group(), createWater());
    presentation.stage(0);
    const subject = presentation.root.getObjectByName('empty-lifeboat:subject')!;
    const startDistance = Math.abs(subject.position.x);

    const reaction = presentation.react('empty-lifeboat.search');
    presentation.update(1, 0.6);
    expect(Math.abs(subject.position.x)).toBeLessThan(startDistance);
    presentation.update(2, 2);
    await reaction;

    expect(presentation.root.visible).toBe(false);
    expect(presentation.root.userData.state).toBe('searched');
  });

  it('lets the empty boat drift away and settles hidden', async () => {
    const presentation = new EmptyLifeboatPresentation(new Group(), createWater());
    presentation.stage(1);

    const reaction = presentation.react('empty-lifeboat.drift');
    presentation.settleForVisibilityChange();
    await reaction;

    expect(presentation.root.visible).toBe(false);
    expect(presentation.root.userData.state).toBe('drifted');
  });
});
