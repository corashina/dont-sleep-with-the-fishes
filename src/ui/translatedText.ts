import { uiText, type UiTextKey } from '../i18n/uiMessages';

/** Refresh only the text bindings declared by each view's markup. */
export function refreshUiText(...roots: readonly HTMLElement[]): void {
  for (const root of roots) {
    for (const element of [root, ...root.querySelectorAll<HTMLElement>('[data-ui-text], [data-ui-aria]')]) {
      const text = element.dataset.uiText as UiTextKey | undefined;
      const aria = element.dataset.uiAria as UiTextKey | undefined;
      if (text !== undefined) element.textContent = uiText(text);
      if (aria !== undefined) element.setAttribute('aria-label', uiText(aria));
    }
  }
}
