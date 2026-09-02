// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PostProcessingConsole,
  type SaveControls,
} from '../src/ui/PostProcessingConsole';

const consoles: PostProcessingConsole[] = [];

afterEach(() => {
  consoles.splice(0).forEach((console) => console.dispose());
  document.body.innerHTML = '';
});

function saveControls(
  state: Pick<SaveControls, 'enabled' | 'savedDay'>,
): SaveControls & {
  setEnabled: ReturnType<typeof vi.fn>;
  continueSavedRun: ReturnType<typeof vi.fn>;
} {
  return {
    ...state,
    setEnabled: vi.fn(),
    continueSavedRun: vi.fn(),
  };
}

function createConsole(
  save: SaveControls,
  onOpenChange: (open: boolean) => void = () => undefined,
): PostProcessingConsole {
  const mount = document.createElement('main');
  document.body.append(mount);
  const console = new PostProcessingConsole(mount, {
    getState: () => ({
      ambientOcclusionAvailable: true,
      ambientOcclusionMode: 'composite',
      ambientOcclusionIntensity: 1,
      ambientOcclusionRadius: 0.5,
    }),
    setAmbientOcclusionMode: vi.fn(),
    setNumeric: vi.fn(),
  }, onOpenChange, undefined, undefined, undefined, undefined, undefined,
  undefined, undefined, undefined, undefined, undefined, undefined, save);
  consoles.push(console);
  return console;
}

describe('PostProcessingConsole save controls', () => {

  it('reports opening and closing from the backtick key and close button', () => {
    const changes = vi.fn();
    const console = createConsole(
      saveControls({ enabled: false, savedDay: null }),
      changes,
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));
    console.element.querySelector<HTMLButtonElement>('[data-post-processing-close]')!.click();

    expect(changes.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('shows the disabled default and unavailable Continue reason', () => {
    const controls = saveControls({ enabled: false, savedDay: null });
    const console = createConsole(controls);

    expect(console.element.querySelector('[data-save-status]')?.textContent).toBe('OFF');
    expect(console.element.querySelector<HTMLButtonElement>('[data-save-continue]')?.disabled)
      .toBe(true);
    expect(console.element.textContent).toContain('Enable auto-save to create a checkpoint.');
  });

  it('reports disable actions', () => {
    const controls = saveControls({ enabled: true, savedDay: 8 });
    const console = createConsole(controls);
    const toggle = console.element.querySelector<HTMLInputElement>('[data-save-enabled]')!;

    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(controls.setEnabled).toHaveBeenCalledWith(false);
  });

  it('reports enable actions', () => {
    const controls = saveControls({ enabled: false, savedDay: null });
    const console = createConsole(controls);
    const toggle = console.element.querySelector<HTMLInputElement>('[data-save-enabled]')!;

    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(controls.setEnabled).toHaveBeenCalledWith(true);
  });

  it('reports Continue actions', () => {
    const controls = saveControls({ enabled: true, savedDay: 8 });
    const console = createConsole(controls);

    console.element.querySelector<HTMLButtonElement>('[data-save-continue]')!.click();

    expect(controls.continueSavedRun).toHaveBeenCalledOnce();
  });

  it('closes before it reports an enabled Continue action', () => {
    const calls: string[] = [];
    const controls = saveControls({ enabled: true, savedDay: 8 });
    controls.continueSavedRun.mockImplementation(() => calls.push('continue'));
    const console = createConsole(
      controls,
      (open) => calls.push(open ? 'open' : 'close'),
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }));

    console.element.querySelector<HTMLButtonElement>('[data-save-continue]')!.click();

    expect(console.element.dataset.open).toBe('false');
    expect(calls).toEqual(['open', 'close', 'continue']);
  });

  it('updates the visible day without rebuilding the console', () => {
    const console = createConsole(saveControls({ enabled: true, savedDay: null }));

    expect(console.element.querySelector('[data-save-status]')?.textContent).toBe('NO SAVE');
    expect(console.element.textContent).toContain('A checkpoint starts in survival.');
    console.setSaveState(true, 14);

    expect(console.element.querySelector('[data-save-status]')?.textContent).toBe('DAY 14');
    expect(console.element.querySelector<HTMLButtonElement>('[data-save-continue]')?.disabled)
      .toBe(false);
    expect(console.element.querySelector<HTMLElement>('[data-save-reason]')?.hidden).toBe(true);
  });
});
