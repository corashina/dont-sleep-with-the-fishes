// Importance: 8/10. Protects tornado staging, time continuity, effects, and resource cleanup.
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import { createInactiveVortexWaveState } from '../src/ocean/WaveField';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import type { DedicatedEventEnvironment } from '../src/survival/eventPresentationTypes';
import { TornadoPresentation } from '../src/survival/events/TornadoPresentation';

function reactionResult() {
  return {
    outcome: {
      accepted: true,
      code: 'event-resolved' as const,
      message: 'The hull takes damage.',
      deltas: { hull: -8 },
      cue: 'impact' as const,
    },
    resourceDeltas: { hull: -8 },
    gainedInstanceIds: [],
    brokenInstanceIds: [],
    lostInstanceIds: [],
    consumedInstanceIds: [],
    selectedInstanceId: null,
    selectedCondition: null,
    targetInstanceId: null,
  };
}

function createFixture(amplitudeScale = 1) {
  const geometry = new BoxGeometry(1, 2, 1);
  const material = new MeshStandardMaterial();
  const modelRoot = new Group();
  modelRoot.add(new Mesh(geometry, material));
  const modelDispose = vi.fn(() => {
    geometry.dispose();
    material.dispose();
  });
  const sampleWorldWaveInto = vi.fn((
    output: Parameters<DedicatedEventEnvironment['sampleWorldWaveInto']>[0],
    _time: number,
    _x: number,
    _z: number,
    scale: number,
  ) => {
    output.height = scale * 2;
    output.displacementX = 0;
    output.displacementZ = 0;
    output.normal.x = 0;
    output.normal.y = 1;
    output.normal.z = 0;
  });
  const eventModels = {
    create: vi.fn(() => ({ root: modelRoot, dispose: modelDispose })),
    animations: vi.fn(() => []),
    dispose: vi.fn(),
  } as unknown as EventModelLibrary;
  const environment: DedicatedEventEnvironment = {
    eventModels,
    supplies: {
      borrowEventActor: vi.fn(() => null),
      itemType: vi.fn(() => null),
    } as unknown as DedicatedEventEnvironment['supplies'],
    carlitos: {} as DedicatedEventEnvironment['carlitos'],
    vortexWave: createInactiveVortexWaveState(),
    sampleWorldWaveInto,
    readWorldWaveAmplitudeScale: () => amplitudeScale,
  };
  const presentation = new TornadoPresentation(environment);
  presentation.stage({ eventId: 'tornado', targetInstanceId: null, variantSeed: 1 });
  return {
    geometry,
    material,
    modelDispose,
    modelRoot,
    presentation,
    sampleWorldWaveInto,
  };
}

function forwardAngle(from: number, to: number): number {
  const turn = Math.PI * 2;
  return (to - from + turn) % turn;
}

describe('TornadoPresentation', () => {
  it('stages the doubled tornado with one tenth below the sea', () => {
    const fixture = createFixture();
    fixture.presentation.worldRoot.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(fixture.modelRoot);
    const seaY = fixture.presentation.worldRoot.position.y;
    const submergedFraction = (seaY - bounds.min.y) / (bounds.max.y - bounds.min.y);

    expect(fixture.modelRoot.visible).toBe(true);
    expect(fixture.modelRoot.scale.toArray()).toEqual([1, 1, 1]);
    expect(fixture.presentation.worldRoot.scale.toArray()).toEqual([2, 2, 2]);
    expect(submergedFraction).toBeCloseTo(0.1);
    expect(fixture.presentation.worldRoot.getObjectByName('tornado-wind-band-1')?.visible)
      .toBe(true);

    fixture.presentation.dispose();
  });

  it('uses the rendered sea amplitude at the fixed tornado coordinates', () => {
    const fixture = createFixture(0.35);

    fixture.presentation.update(8, 0.2);

    expect(fixture.sampleWorldWaveInto).toHaveBeenLastCalledWith(
      expect.anything(),
      8,
      12.8,
      -19,
      0.35,
    );
    expect(fixture.presentation.worldRoot.position.y).toBeCloseTo(0.74);
    fixture.presentation.dispose();
  });

  it('keeps visual phases independent from absolute game time', () => {
    const early = createFixture();
    const late = createFixture();
    early.presentation.reveal();
    late.presentation.reveal();

    early.presentation.update(10, 0.75);
    late.presentation.update(10_000, 0.75);
    early.presentation.update(20, 0.75);
    late.presentation.update(20_000, 0.75);

    const earlyWind = early.presentation.worldRoot.getObjectByName('tornado-wind-band-1')!;
    const lateWind = late.presentation.worldRoot.getObjectByName('tornado-wind-band-1')!;
    const earlySpray = early.presentation.worldRoot.getObjectByName('tornado-sea-spray-1')!;
    const lateSpray = late.presentation.worldRoot.getObjectByName('tornado-sea-spray-1')!;
    expect(early.modelRoot.rotation.toArray()).toEqual(late.modelRoot.rotation.toArray());
    expect(earlyWind.rotation.toArray()).toEqual(lateWind.rotation.toArray());
    expect(earlySpray.position.toArray()).toEqual(lateSpray.position.toArray());

    early.presentation.dispose();
    late.presentation.dispose();
  });

  it('continues forward phases across reveal, item, and reaction boundaries', async () => {
    const fixture = createFixture();
    const wind = fixture.presentation.worldRoot.getObjectByName('tornado-wind-band-1')!;
    const spray = fixture.presentation.worldRoot.getObjectByName('tornado-sea-spray-1')!;
    const phases = () => ({
      model: fixture.modelRoot.rotation.y,
      wind: wind.rotation.y,
      spray: Math.atan2(spray.position.z, spray.position.x),
    });
    const reveal = fixture.presentation.reveal();
    fixture.presentation.update(1_000, 1.5);
    fixture.presentation.update(2_000, 1.5);
    await reveal;
    const revealEnd = phases();

    const item = fixture.presentation.playItemUse(
      'anchor',
      'anchor-1' as ItemInstanceId,
    );
    expect(phases()).toEqual(revealEnd);
    fixture.presentation.update(3_000, 0.2);
    const activeItem = phases();
    expect(forwardAngle(revealEnd.model, activeItem.model)).toBeGreaterThan(0);
    expect(forwardAngle(revealEnd.wind, activeItem.wind)).toBeGreaterThan(0);
    expect(forwardAngle(revealEnd.spray, activeItem.spray)).toBeGreaterThan(0);
    fixture.presentation.update(4_000, 3.8);
    await item;
    const itemEnd = phases();

    const reaction = fixture.presentation.react(reactionResult());
    expect(phases()).toEqual(itemEnd);
    fixture.presentation.update(5_000, 0.2);
    const activeReaction = phases();
    expect(forwardAngle(itemEnd.model, activeReaction.model)).toBeGreaterThan(0);
    expect(forwardAngle(itemEnd.wind, activeReaction.wind)).toBeGreaterThan(0);
    expect(forwardAngle(itemEnd.spray, activeReaction.spray)).toBeGreaterThan(0);
    fixture.presentation.update(6_000, 1.2);
    await reaction;
    expect(fixture.modelRoot.scale.toArray()).toEqual([1, 1, 1]);
    fixture.presentation.dispose();
  });

  it('hides every effect on clear and disposes each owned resource once', () => {
    const fixture = createFixture();
    const internals = fixture.presentation as unknown as {
      ownedGeometries: Set<BufferGeometry>;
      ownedMaterials: Set<Material>;
    };
    const effectGeometryDisposals = [...internals.ownedGeometries]
      .map((resource) => vi.spyOn(resource, 'dispose'));
    const effectMaterialDisposals = [...internals.ownedMaterials]
      .map((resource) => vi.spyOn(resource, 'dispose'));
    const modelGeometryDispose = vi.spyOn(fixture.geometry, 'dispose');
    const modelMaterialDispose = vi.spyOn(fixture.material, 'dispose');
    fixture.presentation.reveal();
    fixture.presentation.update(1, 1);

    fixture.presentation.clear();

    expect(fixture.presentation.worldRoot.visible).toBe(false);
    expect(fixture.modelRoot.visible).toBe(false);
    expect(fixture.presentation.worldRoot.getObjectByName('tornado-wind-band-1')?.visible)
      .toBe(false);
    expect(fixture.presentation.worldRoot.getObjectByName('tornado-sea-spray-1')?.visible)
      .toBe(false);

    fixture.presentation.dispose();
    fixture.presentation.dispose();
    expect(fixture.modelDispose).toHaveBeenCalledOnce();
    expect(modelGeometryDispose).toHaveBeenCalledOnce();
    expect(modelMaterialDispose).toHaveBeenCalledOnce();
    effectGeometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    effectMaterialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
