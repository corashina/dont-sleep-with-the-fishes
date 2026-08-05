// @vitest-environment jsdom
import { Mesh } from 'three';
import { expect, it, vi } from 'vitest';
import {
  MENU_SIGN_TITLE,
  MENU_TITLE_SIGN_POSITION,
  MenuTitleSign,
  type TitleCanvasSurface,
} from '../src/menu/MenuTitleSign';

function fakeSurface(): TitleCanvasSurface {
  const canvas = document.createElement('canvas');
  const gradient = { addColorStop: vi.fn() };
  const context = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
  } as unknown as CanvasRenderingContext2D;
  return { canvas, context };
}

it('builds the left foreground title sign and owns its texture once', () => {
  const surface = fakeSurface();
  const sign = new MenuTitleSign(() => surface);
  expect(sign.root.name).toBe('menu:title-sign');
  expect(sign.root.position.toArray()).toEqual([...MENU_TITLE_SIGN_POSITION]);
  expect(surface.context.fillText).toHaveBeenCalledWith(MENU_SIGN_TITLE, 512, 184);
  expect(sign.root.getObjectByName('menu:title-sign-board')).toBeInstanceOf(Mesh);
  expect(sign.root.getObjectByName('menu:title-sign-post-left')).toBeInstanceOf(Mesh);
  expect(sign.root.getObjectByName('menu:title-sign-post-right')).toBeInstanceOf(Mesh);
  const textureDispose = vi.spyOn(sign.texture, 'dispose');
  sign.dispose();
  sign.dispose();
  expect(textureDispose).toHaveBeenCalledTimes(1);
});
