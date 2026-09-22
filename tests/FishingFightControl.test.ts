// @vitest-environment jsdom
// Importance: 95/100. Mouse ownership must never trap the cursor or lose a paused catch.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalFishingView } from '../src/ui/SurvivalFishingView';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

function createRig() {
  const mount = document.createElement('main');
  document.body.append(mount);
  const view = new SurvivalFishingView(mount);
  mount.append(...view.roots);
  let owner: Element | null = null;
  const change = (element: Element | null) => {
    owner = element;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => owner });
  const request = vi.fn(async () => { change(view.interactionRoot); });
  Object.defineProperty(view.interactionRoot, 'requestPointerLock', { configurable: true, value: request });
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: vi.fn(() => change(null)) });
  view.onControlActive = vi.fn();
  view.onCounterPull = vi.fn();
  view.onReel = vi.fn(() => {
    view.setState({ mode: 'fighting', message: '', biteTarget: null });
    return true;
  });
  view.setState({ mode: 'bite', message: '', biteTarget: { x: 100, y: 100, width: 50, height: 50, depth: 1, visible: true } });
  return { view, request, change };
}

describe('fishing mouse control', () => {
  it.each(['result', 'waiting', 'hidden'] as const)('releases the cursor when entering %s', async (mode) => {
    const { view } = createRig();
    view.biteButton.click();
    await Promise.resolve();
    expect(view.onControlActive).toHaveBeenLastCalledWith(true);
    expect(view.interactionRoot.style.cursor).toBe('none');
    const movement = new MouseEvent('mousemove');
    Object.defineProperty(movement, 'movementX', { value: -12 });
    document.dispatchEvent(movement);
    expect(view.onCounterPull).toHaveBeenCalledWith(-12);
    view.setState({ mode, message: '', biteTarget: null });
    expect(document.pointerLockElement).toBeNull();
    expect(view.onControlActive).toHaveBeenLastCalledWith(false);
    expect(view.interactionRoot.style.cursor).toBe('');
    view.dispose();
  });

  it('requires a fresh click after pause or browser lock loss', async () => {
    const { view, request, change } = createRig();
    view.biteButton.click();
    await Promise.resolve();
    view.setPaused(true);
    view.setPaused(false);
    expect(document.pointerLockElement).toBeNull();
    expect(request).toHaveBeenCalledOnce();
    view.interactionRoot.click();
    await Promise.resolve();
    expect(view.onControlActive).toHaveBeenLastCalledWith(true);
    change(null);
    expect(view.onControlActive).toHaveBeenLastCalledWith(false);
    expect(view.interactionRoot.textContent).toContain('CLICK TO CONTINUE REELING');
    view.dispose();
  });

  it('keeps a denied request frozen and releases a late lock after disposal', async () => {
    const { view, request, change } = createRig();
    request.mockRejectedValueOnce(new Error('denied'));
    view.biteButton.click();
    await Promise.resolve();
    expect(view.onControlActive).toHaveBeenLastCalledWith(false);
    let resolve!: () => void;
    request.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    view.interactionRoot.click();
    view.dispose();
    change(view.interactionRoot);
    resolve();
    await Promise.resolve();
    expect(document.pointerLockElement).toBeNull();
  });
});
