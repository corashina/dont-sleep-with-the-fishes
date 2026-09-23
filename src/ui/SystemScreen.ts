import { systemText } from '../i18n/systemMessages';
import { getLanguage } from '../i18n/language';
import { observeAssetDownloads } from '../app/AssetDownloads';
import type { LoadingProgress } from '../app/LoadingProgress';
export type SystemScreenDescription = {
  readonly kind: 'loading';
} | {
  readonly kind: 'error';
  readonly kicker: string;
  readonly title: string;
  readonly lead: string;
  readonly detail?: string;
};

function textElement(
  tagName: 'p' | 'h1',
  className: string,
  text: string,
): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function loadingProgress(): HTMLProgressElement {
  const progress = document.createElement('progress');
  progress.className = 'system-loading-progress';
  progress.max = 1;
  progress.setAttribute('aria-label', systemText('loading'));
  progress.setAttribute('aria-valuetext', systemText('loadingAssets'));
  return progress;
}

export function createSystemScreen(
  description: SystemScreenDescription,
): HTMLElement {
  const section = document.createElement('section');
  section.className = [
    'screen',
    'is-visible',
    'system-screen',
    'poster-screen',
    `system-screen--${description.kind}`,
  ].join(' ');

  const content = document.createElement('div');
  content.className = 'screen__content';
  if (description.kind === 'loading') {
    section.dataset.loadingStage = 'loadingAssets';
    content.append(
      loadingProgress(),
      textElement('p', 'system-loading-status ui-role-numeral', systemText('loadingAssets')),
    );
  } else {
    content.append(
      textElement('p', 'kicker ui-role-context', description.kicker),
      textElement('h1', 'ui-role-display', description.title),
      textElement('p', 'lead ui-role-narrative', description.lead),
    );
  }
  if (description.kind === 'error' && description.detail !== undefined) {
    content.append(textElement(
      'p',
      'fine-print ui-role-narrative',
      description.detail,
    ));
  }
  section.append(content);
  return section;
}

export function updateSystemScreenProgress(screen: HTMLElement, status: LoadingProgress): void {
  if (screen.dataset.loadingStage !== status.stage) {
    screen.dataset.loadingStageStartedAt = String(performance.now());
  }
  screen.dataset.loadingStage = status.stage;
  const label = screen.querySelector<HTMLElement>('.system-loading-status');
  const progress = screen.querySelector<HTMLProgressElement>('progress');
  if (label === null || progress === null) return;
  let text = systemText(status.stage);
  if (status.completed !== undefined && status.total !== undefined && status.total > 0) {
    text += `: ${status.completed} / ${status.total}`;
  }
  // A completed stage does not mean the scene is ready.
  if (status.stage === 'sceneReady') {
    progress.max = 1;
    progress.value = 1;
  } else if (status.total !== undefined && status.completed !== undefined && status.completed < status.total) {
    progress.max = status.total;
    progress.value = status.completed;
  } else {
    progress.removeAttribute('value');
  }
  label.textContent = text;
  progress.setAttribute('aria-valuetext', text);
}

export function observeSystemScreenLoading(screen: HTMLElement): () => void {
  const label = screen.querySelector<HTMLElement>('.system-loading-status');
  const progress = screen.querySelector<HTMLProgressElement>('progress');
  const format = new Intl.NumberFormat(getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const precise = new Intl.NumberFormat(getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 6 });
  const stopDownloads = observeAssetDownloads(({ loaded, total }) => {
    if (label === null || progress === null) return;
    if (screen.dataset.loadingStage !== 'loadingAssets') return;
    let text: string;
    if (total !== null && loaded >= total) {
      progress.removeAttribute('value');
      text = systemText('loadingAssets');
    } else if (total === null) {
      progress.removeAttribute('value');
      text = `${systemText('loadingAssets')} · ${systemText('downloadedMegabytes', format.format(loaded / 1_000_000))}`;
    } else {
      progress.max = total;
      progress.value = loaded;
      const loadedMB = loaded / 1_000_000;
      const totalMB = total / 1_000_000;
      // Preserve the difference when rounding would imply a finished download.
      const numbers = format.format(loadedMB) === format.format(totalMB) ? precise : format;
      text = `${systemText('loadingAssets')} · ${numbers.format(loadedMB)} / ${numbers.format(totalMB)} MB`;
    }
    label.textContent = text;
    progress.setAttribute('aria-valuetext', text);
  });
  const timer = setInterval(() => {
    if (label === null || progress === null) return;
    const stage = screen.dataset.loadingStage;
    if (stage !== 'preparingSceneShaders' && stage !== 'preparingObjectShaders' && stage !== 'preparingEffects') return;
    const seconds = Math.floor((performance.now() - Number(screen.dataset.loadingStageStartedAt)) / 1000);
    if (seconds < 1) return;
    const text = `${systemText(stage)} · ${systemText('elapsedSeconds', seconds)}`;
    label.textContent = text;
    progress.setAttribute('aria-valuetext', text);
  }, 1000);
  return () => {
    clearInterval(timer);
    stopDownloads();
  };
}
