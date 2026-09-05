import { uiText } from '../i18n/uiMessages';
import { refreshUiText } from '../ui/translatedText';

/** Start menu navigation only. The menu world and audio keep running. */
export class MenuPauseView {
  readonly element = document.createElement('section');
  private readonly resumeButton: HTMLButtonElement;
  private readonly settingsButton: HTMLButtonElement;

  constructor(private readonly onResume: () => void) {
    this.element.className = 'screen pause-screen poster-screen';
    this.element.dataset.pause = '';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'start-menu-pause-title');
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('inert', '');
    this.element.innerHTML = `
      <div class="screen__content scuba-popup-paper scuba-popup-panel">
        <h2 id="start-menu-pause-title" class="scuba-popup-title ui-role-display" data-ui-text="holdFast">${uiText('holdFast')}</h2>
        <button type="button" class="primary-action salvage-action ui-role-context" data-menu-resume data-ui-aria="resume" data-ui-text="resumeUpper"></button>
        <button type="button" class="primary-action salvage-action ui-role-context" data-open-settings data-ui-aria="settings" data-ui-text="settingsUpper"></button>
      </div>`;
    this.resumeButton = this.element.querySelector<HTMLButtonElement>('[data-menu-resume]')!;
    this.settingsButton = this.element.querySelector<HTMLButtonElement>('[data-open-settings]')!;
    this.resumeButton.addEventListener('click', onResume);
    this.refreshLanguage();
  }

  get isOpen(): boolean {
    return this.element.classList.contains('is-visible');
  }

  setOpen(open: boolean): void {
    this.element.classList.toggle('is-visible', open);
    this.element.setAttribute('aria-hidden', String(!open));
    this.element.toggleAttribute('inert', !open);
    if (open) this.resumeButton.focus();
  }

  trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const boundary = event.shiftKey ? this.resumeButton : this.settingsButton;
    if (document.activeElement !== boundary && this.element.contains(document.activeElement)) return;
    event.preventDefault();
    (event.shiftKey ? this.settingsButton : this.resumeButton).focus();
  }

  refreshLanguage(): void {
    refreshUiText(this.element);
  }

  dispose(): void {
    this.resumeButton.removeEventListener('click', this.onResume);
    this.element.remove();
  }
}
