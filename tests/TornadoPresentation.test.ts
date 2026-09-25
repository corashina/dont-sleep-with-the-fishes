import { Mesh, ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { TornadoPresentation } from '../src/survival/events/TornadoPresentation';
import {
  TORNADO_REACTION_DURATION,
  TORNADO_REVEAL_DURATION,
} from '../src/survival/events/tornadoChoreography';
import type {
  DedicatedEventEnvironment,
  EventOutcomePresentation,
} from '../src/survival/eventPresentationTypes';

describe('Tornado presentation', () => {
  it.each([false, true])(
    'keeps the tornado visible and moving after sleep until cleared (settle: %s)',
    async (settle) => {
      // Importance: 95/100. Sleep and visibility changes must not remove an active hazard.
      const presentation = new TornadoPresentation({
        sampleWorldWaveInto: () => {},
        readWorldWaveAmplitudeScale: () => 1,
      } as unknown as DedicatedEventEnvironment);

      try {
        presentation.stage({ eventId: 'tornado', targetInstanceId: null, variantSeed: 7 });
        const reveal = presentation.reveal();
        presentation.update(TORNADO_REVEAL_DURATION, TORNADO_REVEAL_DURATION);
        await reveal;
        const cloud = presentation.worldRoot.getObjectByName('tornado-cloud-volume') as Mesh;
        const material = cloud.material as ShaderMaterial;
        const reaction = presentation.react({
          outcome: { eventResult: { eventId: 'tornado', choiceId: 'sleep', resultId: 'tornado-pass' } },
          resourceDeltas: { hull: -1 },
          selectedInstanceId: null,
          brokenInstanceIds: [],
          lostInstanceIds: [],
        } as unknown as EventOutcomePresentation);

        for (let step = 1; step <= 4; step += 1) {
          presentation.update(
            TORNADO_REVEAL_DURATION + step * TORNADO_REACTION_DURATION / 4,
            TORNADO_REACTION_DURATION / 4,
          );
          if (settle && step === 1) presentation.settleForVisibilityChange();
          expect(presentation.worldRoot.visible).toBe(true);
          expect(cloud.parent!.visible).toBe(true);
          expect(material.uniforms.uVisibility!.value).toBe(1);
        }
        await reaction;

        const time = material.uniforms.uTime!.value;
        presentation.update(6, 0.2);
        expect(material.uniforms.uTime!.value).toBeGreaterThan(time);
        presentation.clear();
        expect(presentation.worldRoot.visible).toBe(false);
        expect(cloud.parent!.visible).toBe(false);
      } finally {
        presentation.dispose();
      }
    },
  );
});
