// @vitest-environment jsdom
import { BoxGeometry, Mesh } from 'three';
import { expect, it, vi } from 'vitest';
import {
  MENU_GUIDE_SIGN_POSITION,
  MENU_GUIDE_SIGN_TITLE,
  MENU_SIGN_TITLE,
  MENU_TITLE_SIGN_POSITION,
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

it('builds the lowered uppercase title and the right guide sign', () => {
  const surfaces: MenuSignCanvasSurface[] = [];
  const signs = new MenuSigns(fakeFactory(surfaces));
  const title = signs.root.getObjectByName('menu:title-sign')!;
  const guide = signs.root.getObjectByName('menu:guide-sign')!;

  expect(title.position.toArray()).toEqual([...MENU_TITLE_SIGN_POSITION]);
  expect(guide.position.toArray()).toEqual([...MENU_GUIDE_SIGN_POSITION]);
  expect(surfaces[0]!.context.fillText).toHaveBeenCalledWith(MENU_SIGN_TITLE, 512, 184);
  expect(surfaces[1]!.context.fillText).toHaveBeenCalledWith(MENU_GUIDE_SIGN_TITLE, 512, 184);
  expect(MENU_SIGN_TITLE).toBe("DON'T SLEEP WITH THE FISHES");
  expect(signs.guideHitTarget.name).toBe('menu:guide-sign-board');

  const textureDisposers = signs.textures.map((texture) => vi.spyOn(texture, 'dispose'));
  signs.dispose();
  signs.dispose();
  for (const dispose of textureDisposers) expect(dispose).toHaveBeenCalledOnce();
});

it('highlights only the guide sign and restores its transform', () => {
  const signs = new MenuSigns(fakeFactory([]));
  const guide = signs.root.getObjectByName('menu:guide-sign')!;
  const title = signs.root.getObjectByName('menu:title-sign')!;

  signs.setGuideHighlighted(true);
  expect(guide.scale.x).toBeCloseTo(1.035);
  expect(guide.position.y).toBeCloseTo(MENU_GUIDE_SIGN_POSITION[1] + 0.04);
  expect(signs.guideHitTarget.material.emissiveIntensity).toBe(0.45);
  expect(title.scale.x).toBe(1);

  signs.setGuideHighlighted(false);
  expect(guide.scale.x).toBe(1);
  expect(guide.position.y).toBe(MENU_GUIDE_SIGN_POSITION[1]);
  expect(signs.guideHitTarget.material.emissiveIntensity).toBe(0);
  signs.dispose();
});

it('keeps both signs support posts behind their painted surfaces', () => {
  const signs = new MenuSigns(fakeFactory([]));
  for (const signName of ['menu:title-sign', 'menu:guide-sign']) {
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
