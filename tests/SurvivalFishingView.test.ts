// @vitest-environment jsdom
// Importance: 10/10. Protects fishing input, targets, results, timing, and cleanup.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalFishingView } from '../src/ui/SurvivalFishingView';

const activeViews: SurvivalFishingView[] = [];

afterEach(() => {
  vi.useRealTimers();
  activeViews.splice(0).forEach((view) => view.dispose());
  document.body.innerHTML = '';
});

function createView() {
  const mount = document.createElement('main');
  const coordinateRoot = document.createElement('div');
  mount.append(coordinateRoot);
  document.body.append(mount);
  vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue({
    x: 40, y: 70, left: 40, top: 70, right: 840, bottom: 670,
    width: 800, height: 600, toJSON: () => ({}),
  });
  vi.spyOn(coordinateRoot, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600,
    width: 800, height: 600, toJSON: () => ({}),
  });
  const fallback = {
    id: 'fishing-tools', itemType: null, toolId: 'fishingRod' as const, action: 'fish' as const,
    remainingUses: null, x: 120, y: 300, visible: true, depleted: false,
    hitArea: { width: 54, height: 54, depth: 0 },
  };
  const view = new SurvivalFishingView(mount, coordinateRoot, () => fallback);
  coordinateRoot.append(...view.roots);
  activeViews.push(view);
  return { view, mount, coordinateRoot, fallback };
}

describe('SurvivalFishingView', () => {
  it('owns the exact interaction, fade, and result siblings', () => {
    const { view } = createView();

    expect(view.roots.map((root) => root.className)).toEqual([
      'fishing-layer',
      'fishing-fade',
      'routine-dialog routine-dialog--fishing',
    ]);
    expect(view.interactionRoot.getAttribute('role')).toBe('region');
    expect(view.interactionRoot.getAttribute('aria-label')).toBe('Fishing interaction');
    expect(view.biteButton.getAttribute('aria-label')).toBe('BITE - REEL NOW');
    expect(view.resultRoot.getAttribute('aria-labelledby')).toBe('fishing-result-title');
    expect(view.resultContinue.textContent?.trim()).toBe('CONTINUE');
  });

  it('uses mount-local pointer coordinates and suppresses the synthetic click', async () => {
    const { view } = createView();
    const cast = vi.fn(() => true);
    view.onCast = cast;
    view.setState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });

    view.interactionRoot.dispatchEvent(new MouseEvent('pointerup', {
      bubbles: true, clientX: 190, clientY: 230,
    }));
    view.interactionRoot.dispatchEvent(new MouseEvent('click', {
      bubbles: true, clientX: 190, clientY: 230,
    }));

    expect(cast).toHaveBeenCalledOnce();
    expect(cast).toHaveBeenCalledWith({ x: 150, y: 160 });
    await Promise.resolve();
  });

  it('rearms rejected input and keeps accepted input gated until the mode changes', () => {
    const { view } = createView();
    const castResults = [false, true, true];
    const cast = vi.fn(() => castResults.shift() ?? true);
    view.onCast = cast;
    view.setState({ mode: 'aiming', message: 'CAST', biteTarget: null });

    view.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    view.handleKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
    view.setState({ mode: 'aiming', message: 'CAST AGAIN', biteTarget: null });
    view.handleKeyDown(new KeyboardEvent('keydown', { key: 'Spacebar' }));
    expect(cast).toHaveBeenCalledTimes(2);

    view.setState({ mode: 'waiting', message: 'WAIT', biteTarget: null });
    view.setState({ mode: 'aiming', message: 'CAST', biteTarget: null });
    view.handleKeyDown(new KeyboardEvent('keydown', { key: 'Spacebar' }));
    expect(cast).toHaveBeenCalledTimes(3);
  });

  it('blocks paused and repeated keys but does not receive a busy lock', () => {
    const { view } = createView();
    const cast = vi.fn(() => false);
    view.onCast = cast;
    view.setState({ mode: 'aiming', message: 'CAST', biteTarget: null });
    view.setPaused(true);
    view.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(cast).not.toHaveBeenCalled();

    view.setPaused(false);
    view.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter', repeat: true }));
    expect(cast).not.toHaveBeenCalled();
    view.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(cast).toHaveBeenCalledWith(null);
  });

  it('keeps one bite button and detects mutable target changes', () => {
    const { view } = createView();
    const bite = view.biteButton;
    const target = { x: 160, y: 90, width: 3, height: 4, depth: 1, visible: true };
    view.setState({ mode: 'bite', message: 'BITE - REEL NOW', biteTarget: target });

    expect(view.biteButton).toBe(bite);
    expect(bite.hidden).toBe(false);
    expect(bite.style.transform).toBe('translate(160px, 90px)');
    expect(bite.style.width).toBe('44px');
    expect(bite.style.height).toBe('44px');
    expect(bite.style.marginLeft).toBe('-22px');
    expect(bite.style.marginTop).toBe('-22px');

    Object.assign(target, { x: 220, y: 130, width: 71.6, height: 47.5, depth: 2 });
    view.updateBiteTarget(target);
    expect(view.biteButton).toBe(bite);
    expect(bite.style.transform).toBe('translate(220px, 130px)');
    expect(bite.style.width).toBe('72px');
    expect(bite.style.height).toBe('48px');
  });

  it('rearms a rejected reel and keeps an accepted reel gated', () => {
    const { view } = createView();
    const results = [false, true];
    const reel = vi.fn(() => results.shift() ?? true);
    view.onReel = reel;
    view.setState({
      mode: 'bite', message: 'BITE',
      biteTarget: { x: 1, y: 2, width: 3, height: 4, depth: 5, visible: true },
    });

    view.biteButton.click();
    view.biteButton.click();
    view.biteButton.click();
    expect(reel).toHaveBeenCalledTimes(2);
  });

  it('announces mode copy once and cancels queued copy when hidden', async () => {
    const { view } = createView();
    const live = view.interactionRoot.querySelector<HTMLElement>('[data-fishing-live]')!;
    view.setState({
      mode: 'bite', message: 'BITE - REEL NOW',
      biteTarget: { x: 1, y: 2, width: 3, height: 4, depth: 5, visible: true },
    });
    expect(live.getAttribute('aria-live')).toBe('assertive');
    view.updateBiteTarget({ x: 9, y: 8, width: 7, height: 6, depth: 5, visible: true });
    await Promise.resolve();
    expect(live.textContent).toBe('BITE - REEL NOW');

    view.setState({ mode: 'waiting', message: 'WAIT', biteTarget: null });
    view.setState({ mode: 'hidden', message: '', biteTarget: null });
    await Promise.resolve();
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
  });

  it('clones result targets, positions beside them, and falls back to the rod anchor', () => {
    const { view } = createView();
    const target = { x: 620, y: 240, width: 80, height: 60, depth: 2, visible: true };
    view.showResult({ caption: 'CATCH', title: 'TUNA', detail: '+2 FOOD', catchTarget: target });
    const firstX = view.resultRoot.style.getPropertyValue('--routine-x');
    expect(view.resultRoot.dataset.anchorState).toBe('projected');
    expect(view.resultRoot.querySelector('[data-fishing-result-title]')?.textContent).toBe('TUNA');

    Object.assign(target, { x: 20, y: 20 });
    window.dispatchEvent(new Event('resize'));
    expect(view.resultRoot.style.getPropertyValue('--routine-x')).toBe(firstX);

    view.showResult({ caption: 'EMPTY', title: 'MISSED', detail: 'NO CATCH', catchTarget: null });
    expect(view.resultRoot.dataset.anchorState).toBe('projected');
    expect(Number.parseFloat(view.resultRoot.style.getPropertyValue('--routine-x'))).toBeGreaterThanOrEqual(20);
    expect(Number.parseFloat(view.resultRoot.style.getPropertyValue('--routine-y'))).toBeGreaterThanOrEqual(20);
  });

  it('deduplicates Continue, resets it for each result, and emits no focus policy', () => {
    const { view } = createView();
    const show = vi.fn();
    const hide = vi.fn();
    const continueResult = vi.fn();
    view.onResultShow = show;
    view.onResultHide = hide;
    view.onContinue = continueResult;
    const result = { caption: 'CATCH', title: 'TUNA', detail: '+2 FOOD', catchTarget: null };

    view.showResult(result);
    view.resultContinue.click();
    view.resultContinue.click();
    expect(continueResult).toHaveBeenCalledOnce();
    view.hideResult();
    view.showResult(result);
    view.resultContinue.click();
    expect(continueResult).toHaveBeenCalledTimes(2);
    expect(show).toHaveBeenCalledTimes(2);
    expect(hide).toHaveBeenCalledOnce();
  });

  it('settles fade replacement by identity at exactly 180 milliseconds', async () => {
    vi.useFakeTimers();
    const { view } = createView();
    const first = view.setFade(true);
    const replacement = view.setFade(false);
    await first;
    expect(view.fadeRoot.classList).not.toContain('is-covered');
    await vi.advanceTimersByTimeAsync(179);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await replacement;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles pending work before rethrowing the first disposal error', async () => {
    vi.useFakeTimers();
    const { view } = createView();
    const pending = view.setFade(true);
    const cleanup = vi.spyOn(view.fadeRoot, 'removeEventListener')
      .mockImplementation(() => { throw undefined; });
    let thrown: unknown = Symbol('not thrown');

    try {
      view.dispose();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeUndefined();
    await pending;
    expect(cleanup).toHaveBeenCalledOnce();
    expect(() => view.dispose()).not.toThrow();
  });
});
