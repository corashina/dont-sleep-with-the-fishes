import { systemText } from '../i18n/systemMessages';
import { getLanguage } from '../i18n/language';
import { observeAssetDownloads } from '../app/AssetDownloads';
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
  progress.setAttribute('aria-valuetext', systemText('preparingScene'));
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
    content.append(
      loadingProgress(),
      textElement('p', 'system-loading-status ui-role-numeral', systemText('preparingScene')),
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

export function observeSystemScreenDownloads(screen: HTMLElement): () => void {
  const label = screen.querySelector<HTMLElement>('.system-loading-status');
  const progress = screen.querySelector<HTMLProgressElement>('progress');
  const format = new Intl.NumberFormat(getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const precise = new Intl.NumberFormat(getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 6 });
  return observeAssetDownloads(({ loaded, total }) => {
    if (label === null || progress === null) return;
    let text: string;
    if (total !== null && loaded >= total) {
      progress.removeAttribute('value');
      text = systemText('preparingScene');
    } else if (total === null) {
      progress.removeAttribute('value');
      text = systemText('downloadedMegabytes', format.format(loaded / 1_000_000));
    } else {
      progress.max = total;
      progress.value = loaded;
      const loadedMB = loaded / 1_000_000;
      const totalMB = total / 1_000_000;
      // Preserve the difference when rounding would imply a finished download.
      const numbers = format.format(loadedMB) === format.format(totalMB) ? precise : format;
      text = `${numbers.format(loadedMB)} / ${numbers.format(totalMB)} MB`;
    }
    label.textContent = text;
    progress.setAttribute('aria-valuetext', text);
  });
}
