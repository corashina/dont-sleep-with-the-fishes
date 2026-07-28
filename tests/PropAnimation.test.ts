import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  VectorKeyframeTrack,
} from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import { PropModelLibrary } from '../src/world/PropModelLibrary';

function animatedCaptainLibrary(): PropModelLibrary {
  const template = new Group();
  const animated = new Group();
  animated.name = 'WhiskersHead';
  animated.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  template.add(animated);
  const clip = new AnimationClip('CaptainWhiskersIdle', 2, [
    new VectorKeyframeTrack(
      'WhiskersHead.position',
      [0, 1, 2],
      [0, 0, 0, 0.1, 0, 0, 0, 0, 0],
    ),
  ]);
  return PropModelLibrary.fromTemplatesForTest(
    new Map<ItemId, Group>([['captainWhiskers', template]]),
    new Map(),
    new Map(),
    new Map<ItemId, readonly AnimationClip[]>([['captainWhiskers', [clip]]]),
  );
}

describe('animated prop presentation', () => {
  it('starts at a deterministic instance phase and advances independently', () => {
    const library = animatedCaptainLibrary();
    const first = library.createPresentation({
      instanceId: 'captainWhiskers-1',
      type: 'captainWhiskers',
    });
    const sameId = library.createPresentation({
      instanceId: 'captainWhiskers-1',
      type: 'captainWhiskers',
    });
    const other = library.createPresentation({
      instanceId: 'captainWhiskers-2',
      type: 'captainWhiskers',
    });

    expect(first.animation!.time).toBe(sameId.animation!.time);
    expect(other.animation!.time).not.toBe(first.animation!.time);
    const otherTime = other.animation!.time;
    first.update(0.25);
    expect(first.animation!.time).not.toBe(sameId.animation!.time);
    expect(other.animation!.time).toBe(otherTime);

    first.dispose();
    sameId.dispose();
    other.dispose();
    library.dispose();
  });

  it('pauses while hidden and disposal is idempotent', () => {
    const library = animatedCaptainLibrary();
    const presentation = library.createPresentation({
      instanceId: 'captainWhiskers-1',
      type: 'captainWhiskers',
    });
    const parent = new Group();
    parent.add(presentation.root);
    parent.visible = false;
    const initialTime = presentation.animation!.time;

    presentation.update(0.5);
    expect(presentation.animation!.time).toBe(initialTime);

    parent.visible = true;
    presentation.update(0.5);
    expect(presentation.animation!.time).not.toBe(initialTime);
    const disposedTime = presentation.animation!.time;
    presentation.dispose();
    presentation.dispose();
    presentation.update(0.5);
    expect(presentation.animation!.time).toBe(disposedTime);
    library.dispose();
  });
});
