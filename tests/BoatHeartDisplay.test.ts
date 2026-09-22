// Importance: 95/100. Shared model disposal would break later events and new runs.
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { expect, it, vi } from 'vitest';
import { BoatHeartDisplay } from '../src/survival/BoatHeartDisplay';
import { COMPLETE_HEART } from '../src/survival/heartOfTheSea';

it('keeps the basket after collection and preserves borrowed model resources', () => {
  const blood = new Group();
  const geometry = new BoxGeometry(0.3, 0.75, 0.3);
  const material = new MeshStandardMaterial();
  blood.add(new Mesh(geometry, material));
  const geometryDispose = vi.spyOn(geometry, 'dispose');
  const materialDispose = vi.spyOn(material, 'dispose');
  const clone = vi.fn(() => blood.clone(true));
  const display = new BoatHeartDisplay({ clone });
  expect(clone.mock.calls).toEqual([['flowersHeart'], ['chestHeart'], ['bloodHeart']]);
  display.sync({ heartPieces: COMPLETE_HEART, ending: null });
  expect(display.root.visible).toBe(true);
  display.beginCollection();
  display.takePiece('blood', new Group());
  expect(display.tooltip).toBe('Brain, Kidneys');
  display.endCollection(true);
  expect(display.root.visible).toBe(true);
  expect(display.piece('blood').parent).toBe(display.root);
  expect(display.tooltip).toBe('?');
  display.dispose();
  expect(geometryDispose).not.toHaveBeenCalled();
  expect(materialDispose).not.toHaveBeenCalled();
  geometry.dispose(); material.dispose();
});
