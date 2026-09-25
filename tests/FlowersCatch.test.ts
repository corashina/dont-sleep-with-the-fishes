// Importance: 92/100. Detached catch models must return to their owner on cleanup and replay.
import { expect, it } from 'vitest';
import { Group } from 'three';
import { FlowersPresentation } from '../src/survival/FlowersPresentation';

it.each(['fishingNet', 'bucket'] as const)('carries the brain in %s and clears it on release, cancellation, and replay', (itemId) => {
  const presentation = new FlowersPresentation({ clone: () => new Group() }, new Group());
  const net = new Group();
  presentation.stage();
  const piece = presentation.root.getObjectByName('flowers-heart-piece')!;
  expect(piece.visible).toBe(false);
  presentation.itemCatch.capture(net, itemId);
  expect(piece.parent).toBe(net);
  expect(net.children).toEqual([piece]);
  expect(piece.visible).toBe(true);
  presentation.itemCatch.release();
  expect(piece.visible).toBe(false);
  expect(piece.parent).not.toBe(net);
  presentation.stage();
  presentation.itemCatch.capture(net, itemId);
  presentation.clear();
  expect(piece.visible).toBe(false);
  expect(piece.parent).not.toBe(net);
  presentation.stage();
  presentation.itemCatch.capture(net, itemId);
  presentation.dispose();
  expect(net.children).toHaveLength(0);
});
