import { Group, PerspectiveCamera } from 'three';
import { expect, it, vi } from 'vitest';
import { MidnightTourPresentation } from '../src/survival/MidnightTourPresentation';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import type { ActionOutcome, EventResultPresentation } from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

it('prepares chest dirt before uncovering the island and retains it when the animation starts', async () => {
  const propModels = createTestPropModels();
  const camera = new PerspectiveCamera();
  const cameraRig = new Group();
  cameraRig.add(camera);
  const presentation = new MidnightTourPresentation({
    camera, cameraRig, propModels, emitCue: vi.fn(), waves: [],
  } as unknown as FocusedEventPresentationDependencies);
  const result: EventResultPresentation = {
    eventId: 'midnight-tour', choiceId: 'visit', resultId: 'tour-chest',
  };
  const outcome = { accepted: true, eventResult: result } as ActionOutcome;
  try {
    presentation.stage();
    await presentation.playChoice({ choiceId: 'visit', instanceId: null, condition: null });
    presentation.prepareResult(result, outcome);
    const site = presentation.root.getObjectByName('midnight-tour-dig-site');
    const dirt = presentation.root.getObjectByName('midnight-tour-dirt-pile');
    expect(site?.visible).toBe(true);
    expect(dirt?.visible).toBe(true);
    const position = site!.position.clone();
    presentation.prepareResult(result, outcome);
    void presentation.react(result, outcome);
    presentation.update(0.1, 0.1);
    expect(presentation.root.getObjectByName('midnight-tour-dig-site')).toBe(site);
    expect(presentation.root.getObjectByName('midnight-tour-dirt-pile')).toBe(dirt);
    expect(site!.position.equals(position)).toBe(true);
  } finally {
    presentation.dispose();
    propModels.dispose();
  }
});
