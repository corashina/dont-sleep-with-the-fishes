// Importance: 5/5. Protects routing for the five authored event scenes.
import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { FeaturedEventPresentations } from '../src/survival/FeaturedEventPresentations';
import type { SurvivalEventModels } from '../src/survival/SurvivalEventModelLibrary';

const models: SurvivalEventModels = {
  clone(id) {
    const root = new Group();
    root.name = id;
    return root;
  },
};

describe('FeaturedEventPresentations', () => {
  it('routes each featured event and exposes stable roots', async () => {
    const cameraRig = new Group();
    const deckTarget = new Group();
    const presentation = new FeaturedEventPresentations(models, cameraRig, deckTarget);

    for (const eventId of [
      'drifting-loot',
      'drifting-bottle',
      'check-the-back',
      'mystery-chest',
      'flowers',
    ] as const) {
      presentation.stage(eventId, eventId === 'drifting-loot' ? 'barrel' : null);
      expect(presentation.interactionRoot(eventId)).not.toBeNull();
      expect(presentation.resultRoot(eventId)).not.toBeNull();
      const reveal = presentation.reveal(eventId);
      presentation.update(1, 2);
      await reveal;
      presentation.clear();
      expect(presentation.interactionRoot(eventId)).toBeNull();
    }

    presentation.dispose();
  });

  it('ignores unrelated event IDs', async () => {
    const presentation = new FeaturedEventPresentations(models, new Group(), new Group());
    presentation.stage('ghosts', null);
    expect(presentation.interactionRoot('ghosts')).toBeNull();
    await expect(presentation.reveal('ghosts')).resolves.toBeUndefined();
    presentation.dispose();
  });
});
