import { Group, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import { MidnightTourPresentation } from '../src/survival/MidnightTourPresentation';
import { createTestPropModels } from './helpers/propModels';

describe('MidnightTourPresentation', () => {
  it('keeps the island at one height throughout its reveal', async () => {
    const propModels = createTestPropModels();
    const dependencies = {
      propModels,
      waves: [],
      cameraRig: new Group(),
      camera: new PerspectiveCamera(),
      supplyDisplay: {},
      chestDisplay: {},
    } as unknown as FocusedEventPresentationDependencies;
    const presentation = new MidnightTourPresentation(dependencies);

    presentation.stage(8);
    const island = presentation.root.getObjectByName('midnight-tour-island')!;
    const stagedY = island.position.y;
    const reveal = presentation.reveal();

    presentation.update(0.625, 0.625);
    expect(island.position.y).toBe(stagedY);
    presentation.update(1.25, 0.625);
    await reveal;
    expect(island.position.y).toBe(stagedY);

    presentation.dispose();
    propModels.dispose();
  });
});
