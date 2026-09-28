// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMobileDevice } from '../src/browser/isMobileDevice';
import { startApplication } from '../src/app/startApplication';
import { setLanguage } from '../src/i18n/language';

const mocks = vi.hoisted(() => ({
  imported: vi.fn(),
  cancel: vi.fn(),
  launchGame: vi.fn(),
  analytics: vi.fn(),
}));
vi.mock('../src/app/launchGame', () => {
  mocks.imported();
  return { launchGame: mocks.launchGame };
});
vi.mock('../src/browser/GoogleAnalytics', () => ({ initializeAnalytics: mocks.analytics }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.launchGame.mockReturnValue({ completion: Promise.resolve(null), cancel: mocks.cancel });
  setLanguage('en');
});
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  vi.restoreAllMocks();
  document.body.replaceChildren();
  setLanguage('en');
});

// Importance: 95/100. Device classification must block phones/tablets without excluding touchscreen PCs.
describe('device support', () => {
  it.each([
    ['Android phone', 'Mozilla/5.0 (Linux; Android 14) Mobile', 'Linux armv8l', 5, true],
    ['Android tablet', 'Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l', 5, true],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 'iPhone', 5, true],
    ['iPad', 'Mozilla/5.0 (iPad; CPU OS 18_0)', 'iPad', 5, true],
    ['iPad desktop mode', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 5, true],
    ['Kindle tablet', 'Mozilla/5.0 Silk/3.2', 'Linux', 5, true],
    ['Windows touchscreen', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 10, false],
    ['Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 0, false],
    ['Linux PC', 'Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64', 0, false],
  ])('%s', (_name, userAgent, platform, maxTouchPoints, blocked) => {
    expect(isMobileDevice({ userAgent, platform, maxTouchPoints })).toBe(blocked);
  });

  it('uses browser mobile and platform hints when available', () => {
    const device = { userAgent: '', platform: '', maxTouchPoints: 0 };
    expect(isMobileDevice({ ...device, userAgentData: { mobile: true, platform: '' } })).toBe(true);
    expect(isMobileDevice({ ...device, userAgentData: { mobile: false, platform: 'Android' } })).toBe(true);
    expect(isMobileDevice({ ...device, userAgentData: { mobile: false, platform: 'Windows' } })).toBe(false);
  });
});

// Importance: 95/100. The mobile notice must precede game code, asset loading, and WebGL initialization.
describe('desktop-only startup', () => {
  it.each([
    ['en', 'PC required', 'keyboard and mouse'],
    ['pl', 'Wymagany komputer', 'klawiaturą i myszą'],
    ['es-AR', 'Necesitás una PC', 'teclado y mouse'],
  ] as const)('blocks mobile startup in %s', async (language, title, controls) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    setLanguage(language);
    await startApplication(document.body);
    expect(document.querySelector('h1')?.textContent).toBe(title);
    expect(document.body.textContent).toContain(controls);
    expect(document.querySelector('button, canvas, progress')).toBeNull();
    expect(mocks.imported).not.toHaveBeenCalled();
    expect(mocks.launchGame).not.toHaveBeenCalled();
    expect(mocks.analytics).not.toHaveBeenCalled();
  });

  it('launches on a touchscreen PC and cancels on page exit', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows NT 10.0');
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 10 });
    try {
      await startApplication(document.body);
      expect(mocks.launchGame).toHaveBeenCalledOnce();
      expect(mocks.analytics).toHaveBeenCalledOnce();
      window.dispatchEvent(new Event('pagehide'));
      expect(mocks.cancel).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(navigator, 'maxTouchPoints');
    }
  });

  it('does not launch if the page closes during the game import', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows NT 10.0');
    const startup = startApplication(document.body);
    window.dispatchEvent(new Event('pagehide'));
    await startup;
    expect(mocks.launchGame).not.toHaveBeenCalled();
  });
});
