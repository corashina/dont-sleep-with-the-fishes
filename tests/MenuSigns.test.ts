// @vitest-environment jsdom
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import { expect, it, vi } from 'vitest';
import {
  MENU_GUIDE_SIGN_POSITION,
  MENU_GUIDE_SIGN_TITLE,
  MENU_START_SIGN_POSITION,
  MENU_START_SIGN_TITLE,
  MenuSigns,
  type MenuSignCanvasSurface,
} from '../src/menu/MenuSigns';

function fakeFactory(surfaces: MenuSignCanvasSurface[]): () => MenuSignCanvasSurface {
  return () => {
    const canvas = document.createElement('canvas');
    const gradient = { addColorStop: vi.fn() };
    const context = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
      fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
    } as unknown as CanvasRenderingContext2D;
    const surface = { canvas, context };
    surfaces.push(surface);
    return surface;
  };
}

it('builds smaller guide and start signs in swapped positions', () => {
  const surfaces: MenuSignCanvasSurface[] = [];
  const signs = new MenuSigns(fakeFactory(surfaces));
  const guide = signs.root.getObjectByName('menu:guide-sign')!;
  const start = signs.root.getObjectByName('menu:start-sign')!;

  expect(guide.position.toArray()).toEqual([...MENU_GUIDE_SIGN_POSITION]);
  expect(start.position.toArray()).toEqual([...MENU_START_SIGN_POSITION]);
  expect(guide.position.x).toBeLessThan(0);
  expect(start.position.x).toBeGreaterThan(0);
  expect(surfaces[0]!.context.fillText).toHaveBeenCalledWith(MENU_GUIDE_SIGN_TITLE, 512, 184);
  expect(surfaces[1]!.context.fillText).toHaveBeenCalledWith(MENU_START_SIGN_TITLE, 512, 184);
  expect((signs.guideHitTarget.geometry as BoxGeometry).parameters.width).toBeLessThan(2.5);
  expect((signs.startHitTarget.geometry as BoxGeometry).parameters.width).toBeLessThan(2.5);
  expect(signs.startHitTarget.name).toBe('menu:start-sign-board');
  expect(signs.guideHitTarget.name).toBe('menu:guide-sign-board');

  const textureDisposers = signs.textures.map((texture) => vi.spyOn(texture, 'dispose'));
  signs.dispose();
  signs.dispose();
  for (const dispose of textureDisposers) expect(dispose).toHaveBeenCalledOnce();
});

it('highlights each complete sign without changing its transform', () => {
  const signs = new MenuSigns(fakeFactory([]));
  const guide = signs.root.getObjectByName('menu:guide-sign')!;
  const start = signs.root.getObjectByName('menu:start-sign')!;
  const guidePost = guide.getObjectByName('menu:guide-sign-post-left') as Mesh;
  const startPost = start.getObjectByName('menu:start-sign-post-left') as Mesh;
  const guidePosition = guide.position.clone();

  signs.setGuideHighlighted(true);
  expect(guide.scale.toArray()).toEqual([1, 1, 1]);
  expect(guide.position.equals(guidePosition)).toBe(true);
  expect(signs.guideHitTarget.material.emissiveIntensity).toBeGreaterThan(0);
  expect((guidePost.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
  expect(signs.startHitTarget.material.emissiveIntensity).toBe(0);

  signs.setStartHighlighted(true);
  expect(start.scale.toArray()).toEqual([1, 1, 1]);
  expect(signs.startHitTarget.material.emissiveIntensity).toBeGreaterThan(0);
  expect((startPost.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);

  signs.setGuideHighlighted(false);
  expect(signs.guideHitTarget.material.emissiveIntensity).toBe(0);
  expect((guidePost.material as MeshStandardMaterial).emissiveIntensity).toBe(0);
  signs.setStartHighlighted(false);
  expect(signs.startHitTarget.material.emissiveIntensity).toBe(0);
  signs.dispose();
});

it('keeps both signs support posts behind their painted surfaces', () => {
  const signs = new MenuSigns(fakeFactory([]));
  for (const signName of ['menu:start-sign', 'menu:guide-sign']) {
    const sign = signs.root.getObjectByName(signName)!;
    const board = sign.getObjectByName(`${signName}-board`) as Mesh;
    const boardFront = board.position.z
      + 0.5 * (board.geometry as BoxGeometry).parameters.depth;

    for (const suffix of ['post-left', 'post-right']) {
      const post = sign.getObjectByName(`${signName}-${suffix}`) as Mesh;
      const postFront = post.position.z
        + 0.5 * (post.geometry as BoxGeometry).parameters.depth;
      expect(postFront).toBeLessThan(boardFront);
    }
  }
  signs.dispose();
});
