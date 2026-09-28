import { isMobileDevice } from '../browser/isMobileDevice';
import { initializeAnalytics } from '../browser/GoogleAnalytics';
import { systemText } from '../i18n/systemMessages';
import { createSystemScreen } from '../ui/SystemScreen';

export async function startApplication(mount: HTMLElement): Promise<void> {
  if (isMobileDevice()) {
    mount.replaceChildren(createSystemScreen({
      kind: 'unsupported',
      kicker: "Don't Sleep With The Fishes",
      title: systemText('pcRequired'),
      lead: systemText('pcGuidance'),
    }));
    return;
  }

  let cancelled = false;
  let cancelLaunch: (() => void) | undefined;
  const cancel = (): void => { cancelled = true; cancelLaunch?.(); };
  window.addEventListener('pagehide', cancel, { once: true });
  try {
    const { launchGame } = await import('./launchGame');
    if (cancelled) return;
    initializeAnalytics();
    const launch = launchGame(mount);
    cancelLaunch = () => launch.cancel();
    await launch.completion;
  } catch (error) {
    window.removeEventListener('pagehide', cancel);
    if (cancelled) return;
    console.error(error);
    mount.replaceChildren(createSystemScreen({
      kind: 'error',
      kicker: systemText('gameError'),
      title: systemText('launch'),
      lead: systemText('retryGuidance'),
    }));
  }
}
