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
  progress.value = 0;
  progress.setAttribute('aria-label', systemText('loading'));
  progress.setAttribute('aria-valuetext', '0%');
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
      textElement('p', 'system-loading-bytes ui-role-numeral', '0.0 / 0.0 MB'),
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
  const label = screen.querySelector<HTMLElement>('.system-loading-bytes');
  const progress = screen.querySelector<HTMLProgressElement>('progress');
  const format = new Intl.NumberFormat(getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return observeAssetDownloads(({ loaded, total }) => {
    if (label === null || progress === null) return;
    const text = `${format.format(loaded / 1_000_000)} / ${total === null ? '…' : format.format(total / 1_000_000)} MB`;
    label.textContent = text;
    progress.setAttribute('aria-valuetext', `${Math.round(progress.position * 100)}%, ${text}`);
  });
}

export function updateSystemScreenProgress(
  screen: HTMLElement,
  completed: number,
  total: number,
): void {
  const progress = screen.querySelector<HTMLProgressElement>('.system-loading-progress');
  if (progress === null) return;

  const safeTotal = Number.isFinite(total) ? Math.max(1, Math.floor(total)) : 1;
  const safeCompleted = Number.isFinite(completed)
    ? Math.min(safeTotal, Math.max(0, Math.floor(completed)))
    : 0;
  progress.max = safeTotal;
  progress.value = safeCompleted;
  const bytes = screen.querySelector('.system-loading-bytes')?.textContent;
  progress.setAttribute('aria-valuetext', `${Math.round(safeCompleted / safeTotal * 100)}%${bytes ? `, ${bytes}` : ''}`);
}
