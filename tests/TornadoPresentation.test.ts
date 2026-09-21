import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
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
      const model = new Group();
      const geometry = new BoxGeometry(1, 3, 1);
      const material = new MeshStandardMaterial();
      model.add(new Mesh(geometry, material));
      const presentation = new TornadoPresentation({
        eventModels: { create: () => ({
          root: model,
          dispose: () => { geometry.dispose(); material.dispose(); },
        }) },
        sampleWorldWaveInto: () => {},
        readWorldWaveAmplitudeScale: () => 1,
      } as unknown as DedicatedEventEnvironment);

      try {
        presentation.stage({ eventId: 'tornado', targetInstanceId: null, variantSeed: 7 });
        const reveal = presentation.reveal();
        presentation.update(TORNADO_REVEAL_DURATION, TORNADO_REVEAL_DURATION);
        await reveal;
        const wind = presentation.worldRoot.getObjectByName('tornado-wind-band-1') as Mesh;
        const spray = presentation.worldRoot.getObjectByName('tornado-sea-spray-1') as Mesh;
        const windOpacity = (wind.material as MeshStandardMaterial).opacity;
        const sprayOpacity = (spray.material as MeshStandardMaterial).opacity;
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
          expect(model.visible).toBe(true);
          expect(material.opacity).toBe(1);
          expect(model.scale.x).toBe(1);
          expect(wind.visible).toBe(true);
          expect(spray.visible).toBe(true);
          expect((wind.material as MeshStandardMaterial).opacity).toBe(windOpacity);
          expect((spray.material as MeshStandardMaterial).opacity).toBe(sprayOpacity);
        }
        await reaction;

        const rotation = model.rotation.y;
        const sprayPosition = spray.position.clone();
        presentation.update(6, 0.2);
        expect(model.rotation.y).not.toBe(rotation);
        expect(spray.position.equals(sprayPosition)).toBe(false);
        presentation.clear();
        expect(presentation.worldRoot.visible).toBe(false);
        expect(model.visible).toBe(false);
      } finally {
        presentation.dispose();
      }
    },
  );
});
