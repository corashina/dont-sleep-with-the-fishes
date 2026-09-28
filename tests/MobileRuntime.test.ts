// @vitest-environment jsdom
// Importance: 100/100. Rotation and interruption must stop active gameplay.
// Importance: 95/100. Viewport changes must keep the canvas and game aligned.
// Importance: 95/100. The gate must return keyboard focus after Resume.
// Importance: 100/100. Gate keys must not reach controls behind the dialog.
// Importance: 90/100. Mobile defaults must preserve each valid saved setting.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebGLRenderer } from 'three';
import { MobileViewportController } from '../src/browser/MobileViewportController';
import { prefersTouchControls } from '../src/browser/deviceCapabilities';
import type { PreferenceStorage } from '../src/browser/storage';
import { createVisualQualityPreference, VISUAL_QUALITY_STORAGE_KEY } from '../src/rendering/visualQuality';
import { createWaterQualityPreference, WATER_QUALITY_STORAGE_KEY } from '../src/rendering/waterQuality';
import { createShadowQualityPreference, SHADOW_QUALITY_STORAGE_KEY } from '../src/rendering/shadowQuality';
import { createAntiAliasingQualityPreference } from '../src/rendering/antiAliasingQuality';
import { createTestGame, flushPhases } from './helpers/game';
import type { GamePhase } from '../src/app/GamePhase';
import type { MenuModelLibrary } from '../src/menu/MenuModelLibrary';
import { createTestPropModels } from './helpers/propModels';
import { createTestShipFurniture } from './helpers/shipFurniture';
import { createTestSkyAssets } from './helpers/skyAssets';
import { testPhysicsRuntime } from './helpers/physics';

const physicsRuntime = await testPhysicsRuntime();
const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalPixelRatio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');

function setSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  window.dispatchEvent(new Event('resize'));
}

function coarsePointer(): void {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
}

function phase(): GamePhase {
  return {
    start: vi.fn(), update: vi.fn(), resize: vi.fn(), render: vi.fn(),
    setMobileSuspended: vi.fn(), dispose: vi.fn(),
  };
}

afterEach(() => {
  if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
  if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
  if (originalPixelRatio) Object.defineProperty(window, 'devicePixelRatio', originalPixelRatio);
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('mobile runtime', () => {
  it('selects coarse input safely and keeps valid graphics settings independent', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersTouchControls()).toBe(false);
    coarsePointer();
    expect(prefersTouchControls()).toBe(true);
    const saved = new Map([
      [VISUAL_QUALITY_STORAGE_KEY, 'high'],
      [WATER_QUALITY_STORAGE_KEY, 'invalid'],
      [SHADOW_QUALITY_STORAGE_KEY, 'high'],
    ]);
    const storage: PreferenceStorage = {
      getItem: key => saved.get(key) ?? null,
      setItem: (key, value) => { saved.set(key, value); },
    };
    expect(createVisualQualityPreference(vi.fn(), storage).get()).toBe('high');
    expect(createWaterQualityPreference(vi.fn(), storage).get()).toBe('low');
    expect(createShadowQualityPreference(vi.fn(), storage).get()).toBe('high');
    expect(createAntiAliasingQualityPreference(vi.fn(), storage).get()).toBe('low');
    const unavailable: PreferenceStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const apply = vi.fn();
    const preference = createVisualQualityPreference(apply, unavailable);
    expect(preference.get()).toBe('low');
    preference.set('high');
    expect(preference.get()).toBe('high');
    expect(apply).toHaveBeenCalledWith('high');
  });

  it('requires Resume after rotation or lost focus', () => {
    coarsePointer();
    setSize(844, 390);
    const mount = document.createElement('main');
    document.body.append(mount);
    const changed = vi.fn();
    const viewport = new MobileViewportController(mount, changed);
    expect(viewport.isSuspended()).toBe(false);
    setSize(390, 844);
    expect(viewport.isSuspended()).toBe(true);
    expect(mount.querySelector('.mobile-viewport-gate__resume')?.hasAttribute('hidden')).toBe(true);
    setSize(844, 390);
    expect(viewport.isSuspended()).toBe(true);
    mount.querySelector<HTMLButtonElement>('.mobile-viewport-gate__resume')!.click();
    expect(viewport.isSuspended()).toBe(false);
    window.dispatchEvent(new Event('blur'));
    expect(viewport.isSuspended()).toBe(true);
    viewport.dispose();
    expect(mount.querySelector('.mobile-viewport-gate')).toBeNull();
  });

  it('moves focus into the gate and restores the prior control after Resume', () => {
    coarsePointer();
    setSize(844, 390);
    const mount = document.createElement('main');
    const prior = document.createElement('button');
    mount.append(prior);
    document.body.append(mount);
    prior.focus();
    const viewport = new MobileViewportController(mount, vi.fn());
    try {
      setSize(390, 844);
      expect(document.activeElement).toBe(mount.querySelector('.mobile-viewport-gate__title'));
      setSize(844, 390);
      const resume = mount.querySelector<HTMLButtonElement>('.mobile-viewport-gate__resume')!;
      expect(document.activeElement).toBe(resume);
      resume.click();
      expect(document.activeElement).toBe(prior);
    } finally {
      viewport.dispose();
    }
  });

  it('keeps Tab inside the gate and blocks shortcuts behind it', () => {
    coarsePointer();
    setSize(390, 844);
    const mount = document.createElement('main');
    const behind = document.createElement('button');
    const activateBehind = vi.fn();
    behind.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') activateBehind();
    });
    mount.append(behind);
    document.body.append(mount);
    behind.focus();
    const viewport = new MobileViewportController(mount, vi.fn());
    const globalShortcut = vi.fn();
    window.addEventListener('keydown', globalShortcut);
    try {
      const heading = mount.querySelector<HTMLElement>('.mobile-viewport-gate__title')!;
      expect(document.activeElement).toBe(heading);
      behind.focus();
      for (const key of ['Tab', 'Escape', 'F2', 'Enter']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        behind.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(heading);
      }
      expect(activateBehind).not.toHaveBeenCalled();
      expect(globalShortcut).not.toHaveBeenCalled();
      setSize(844, 390);
      const resume = mount.querySelector<HTMLButtonElement>('.mobile-viewport-gate__resume')!;
      expect(document.activeElement).toBe(resume);
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      resume.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(resume);
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      resume.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBe(false);
      expect(globalShortcut).not.toHaveBeenCalled();
      resume.click();
      expect(document.activeElement).toBe(behind);
    } finally {
      viewport.dispose();
      window.removeEventListener('keydown', globalShortcut);
    }
  });

  it('blocks a phase installed during portrait and starts it once after Resume', async () => {
    coarsePointer();
    setSize(844, 390);
    const menu = phase();
    const ship = phase();
    let completeMenu: () => void = () => undefined;
    const mount = document.createElement('main');
    document.body.append(mount);
    const game = createTestGame({
      createMenu: (_context, complete) => { completeMenu = complete; return menu; },
      createScavenge: () => ship,
      createSurvival: () => phase(),
    }, {
      mount,
      propModels: createTestPropModels(),
      menuModels: { dispose: vi.fn() } as unknown as MenuModelLibrary,
      shipFurniture: createTestShipFurniture(),
      skyAssets: createTestSkyAssets(),
      physicsRuntime,
    });
    try {
      await flushPhases();
      game.start();
      completeMenu();
      setSize(390, 844);
      await flushPhases();
      expect(ship.setMobileSuspended).toHaveBeenCalledWith(true);
      expect(ship.start).not.toHaveBeenCalled();
      setSize(844, 390);
      expect(ship.start).not.toHaveBeenCalled();
      mount.querySelector<HTMLButtonElement>('.mobile-viewport-gate__resume')!.click();
      expect(ship.setMobileSuspended).toHaveBeenLastCalledWith(false);
      expect(ship.start).toHaveBeenCalledOnce();
    } finally {
      game.dispose();
      await flushPhases();
    }
  });

  it('uses visible size and avoids repeated buffer resizes', async () => {
    coarsePointer();
    setSize(844, 390);
    const visible = Object.assign(new EventTarget(), {
      width: 844, height: 390, offsetLeft: 0, offsetTop: 0,
    });
    vi.stubGlobal('visualViewport', visible);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    const renderer = {
      domElement: document.createElement('canvas'),
      capabilities: { getMaxAnisotropy: () => 1 },
      shadowMap: { enabled: true, type: 0 },
      setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), dispose: vi.fn(),
    } as unknown as WebGLRenderer;
    const mount = document.createElement('main');
    document.body.append(mount);
    const game = createTestGame({
      createMenu: () => phase(), createScavenge: () => phase(), createSurvival: () => phase(),
    }, {
      mount, renderer,
      propModels: createTestPropModels(),
      menuModels: { dispose: vi.fn() } as unknown as MenuModelLibrary,
      shipFurniture: createTestShipFurniture(),
      skyAssets: createTestSkyAssets(),
      physicsRuntime,
    });
    try {
      await flushPhases();
      expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
      expect(renderer.setSize).toHaveBeenCalledTimes(1);
      visible.dispatchEvent(new Event('resize'));
      expect(renderer.setSize).toHaveBeenCalledTimes(1);
      visible.height = 360;
      visible.dispatchEvent(new Event('resize'));
      expect(renderer.setSize).toHaveBeenCalledTimes(2);
      expect(renderer.setSize).toHaveBeenLastCalledWith(844, 360, false);
    } finally {
      game.dispose();
      await flushPhases();
    }
  });
});
