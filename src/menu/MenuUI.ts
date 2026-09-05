import { menuText } from '../i18n/menuMessages';
import { getLanguage, onLanguageChange } from '../i18n/language';
import { MenuPauseView } from './MenuPauseView';

const GUIDE_ASSET_ROOT = `${import.meta.env.BASE_URL}images/how-to-play`;

interface GuidePage {
  readonly title: string;
  readonly image: string;
  readonly imageAlt: string;
  readonly description: string;
}

const GUIDE_PAGES: readonly GuidePage[] = Object.freeze([
  {
    get title() { return menuText('guide0'); },
    image: `${GUIDE_ASSET_ROOT}/scavenging.png`,
    get imageAlt() { return menuText('guide1'); },
    get description() { return menuText('guide3'); },
  },
  {
    get title() { return menuText('guide4'); },
    get image() { return guideImage('survival-day'); },
    get imageAlt() { return menuText('guide5'); },
    get description() { return menuText('guide6'); },
  },
  {
    get title() { return menuText('guide7'); },
    get image() { return guideImage('survival-energy'); },
    get imageAlt() { return menuText('guide8'); },
    get description() { return menuText('guide10'); },
  },
  {
    get title() { return menuText('guide11'); },
    get image() { return guideImage('survival-fishing'); },
    get imageAlt() { return menuText('guide12'); },
    get description() { return menuText('guide13'); },
  },
  {
    get title() { return menuText('guide14'); },
    get image() { return guideImage('survival-night'); },
    get imageAlt() { return menuText('guide15'); },
    get description() { return menuText('guide16'); },
  },
  {
    get title() { return menuText('guide17'); },
    get image() { return guideImage('survival-day'); },
    get imageAlt() { return menuText('guide18'); },
    get description() { return menuText('guide20'); },
  },
]);

function guideImage(name: string): string {
  return `${GUIDE_ASSET_ROOT}/${name}${getLanguage() === 'pl' ? '-pl.jpg' : '.png'}`;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing menu element: ${selector}`);
  return element;
}

export class MenuUI {
  onStart: () => void = () => undefined;
  onStartFocusChange: (focused: boolean) => void = () => undefined;
  onGuideFocusChange: (focused: boolean) => void = () => undefined;
  onOverlayChange: () => void = () => undefined;
  private readonly pause: MenuPauseView;
  private pauseOrigin: HTMLElement | null = null;
  private readonly root: HTMLDivElement;
  private readonly menu: HTMLElement;
  private readonly guide: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly guideButton: HTMLButtonElement;
  private readonly guideCloseButton: HTMLButtonElement;
  private readonly guidePreviousButton: HTMLButtonElement;
  private readonly guideNextButton: HTMLButtonElement;
  private readonly guideTitle: HTMLElement;
  private readonly guideImage: HTMLImageElement;
  private readonly guideDescription: HTMLElement;
  private readonly guidePageCount: HTMLElement;
  private readonly pointerLockError: HTMLElement;
  private transitioning = false;
  private guideOpen = false;
  private guidePageIndex = 0;
  private disposed = false;
  private readonly unsubscribeLanguage: () => void;

  constructor(mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'menu-ui';
    this.root.innerHTML = `
      <section class="screen is-visible underwater-menu-screen" data-menu>
        <button type="button" class="menu-action-accessible" data-menu-start>START</button>
        <button type="button" class="menu-action-accessible" data-menu-guide-open aria-haspopup="dialog"
          aria-controls="menu-how-to-play-dialog">HOW TO PLAY</button>
        <div class="underwater-menu-screen__content">
          <h1 class="menu-title-accessible">DON'T SLEEP WITH THE FISHES</h1>
          <p class="input-error illustrated-warning ui-role-narrative"
            data-menu-pointer-lock-error aria-live="polite"></p>
        </div>
      </section>
      <section class="screen how-to-play-screen poster-screen"
        id="menu-how-to-play-dialog" data-menu-guide role="dialog"
        aria-modal="true" aria-hidden="true" aria-labelledby="menu-how-to-play-title"
        aria-describedby="menu-how-to-play-description" inert>
        <div class="screen__content how-to-play-popup">
          <button type="button" class="how-to-play-page__close ui-role-context"
            data-menu-guide-close aria-label="Close how to play">&times;</button>
          <article class="how-to-play-page">
            <header class="how-to-play-page__header">
              <h2 class="ui-role-display" id="menu-how-to-play-title" data-menu-guide-title tabindex="-1"></h2>
            </header>
            <figure class="how-to-play-page__figure">
              <img data-menu-guide-image width="1280" height="720" draggable="false">
            </figure>
            <p class="how-to-play-page__description ui-role-narrative"
              id="menu-how-to-play-description" data-menu-guide-description></p>
            <nav class="how-to-play-page__navigation ui-role-context" aria-label="How to play pages">
              <button type="button" class="how-to-play-page__arrow" data-menu-guide-previous
                aria-label="Previous how to play page">&lsaquo;</button>
              <span class="how-to-play-page__folio ui-role-numeral" data-menu-guide-page-count></span>
              <button type="button" class="how-to-play-page__arrow" data-menu-guide-next
                aria-label="Next how to play page">&rsaquo;</button>
            </nav>
          </article>
        </div>
      </section>
      <div class="underwater-menu-fade" data-menu-fade aria-hidden="true"></div>
    `;
    mount.append(this.root);
    this.menu = requireElement(this.root, '[data-menu]');
    this.guide = requireElement(this.root, '[data-menu-guide]');
    this.startButton = requireElement(this.root, '[data-menu-start]');
    this.guideButton = requireElement(this.root, '[data-menu-guide-open]');
    this.guideCloseButton = requireElement(this.root, '[data-menu-guide-close]');
    this.guidePreviousButton = requireElement(this.root, '[data-menu-guide-previous]');
    this.guideNextButton = requireElement(this.root, '[data-menu-guide-next]');
    this.guideTitle = requireElement(this.root, '[data-menu-guide-title]');
    this.guideImage = requireElement(this.root, '[data-menu-guide-image]');
    this.guideDescription = requireElement(this.root, '[data-menu-guide-description]');
    this.guidePageCount = requireElement(this.root, '[data-menu-guide-page-count]');
    this.pointerLockError = requireElement(this.root, '[data-menu-pointer-lock-error]');
    this.pause = new MenuPauseView(() => this.setPauseOpen(false));
    this.root.append(this.pause.element);
    this.startButton.addEventListener('click', this.handleStart);
    this.startButton.addEventListener('focus', this.handleStartFocus);
    this.startButton.addEventListener('blur', this.handleStartBlur);
    this.guideButton.addEventListener('click', this.handleGuideOpen);
    this.guideButton.addEventListener('focus', this.handleGuideFocus);
    this.guideButton.addEventListener('blur', this.handleGuideBlur);
    this.guide.addEventListener('click', this.handleGuideBackdrop);
    this.guideCloseButton.addEventListener('click', this.handleGuideClose);
    this.guidePreviousButton.addEventListener('click', this.handleGuidePrevious);
    this.guideNextButton.addEventListener('click', this.handleGuideNext);
    window.addEventListener('keydown', this.handleKeyDown);
    this.refreshLanguage();
    this.unsubscribeLanguage = onLanguageChange(this.refreshLanguage);
  }

  setTransitioning(active: boolean): void {
    this.transitioning = active;
    this.startButton.disabled = active;
    this.guideButton.disabled = active;
    this.root.classList.toggle('is-transitioning', active);
  }

  setFadeProgress(progress: number): void {
    this.root.style.setProperty(
      '--menu-fade',
      String(Math.min(1, Math.max(0, progress))),
    );
  }

  showPointerLockError(): void {
    this.pointerLockError.textContent = menuText('pointerLock');
    this.pointerLockError.classList.add('is-visible');
  }

  clearPointerLockError(): void {
    this.pointerLockError.textContent = '';
    this.pointerLockError.classList.remove('is-visible');
  }

  openGuide(): void {
    if (!this.transitioning && !this.pause.isOpen) this.setGuideOpen(true);
  }

  get isOverlayOpen(): boolean {
    return this.guideOpen || this.pause.isOpen;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeLanguage();
    this.startButton.removeEventListener('click', this.handleStart);
    this.startButton.removeEventListener('focus', this.handleStartFocus);
    this.startButton.removeEventListener('blur', this.handleStartBlur);
    this.guideButton.removeEventListener('click', this.handleGuideOpen);
    this.guideButton.removeEventListener('focus', this.handleGuideFocus);
    this.guideButton.removeEventListener('blur', this.handleGuideBlur);
    this.guide.removeEventListener('click', this.handleGuideBackdrop);
    this.guideCloseButton.removeEventListener('click', this.handleGuideClose);
    this.guidePreviousButton.removeEventListener('click', this.handleGuidePrevious);
    this.guideNextButton.removeEventListener('click', this.handleGuideNext);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.pause.dispose();
    this.onStart = () => undefined;
    this.onStartFocusChange = () => undefined;
    this.onGuideFocusChange = () => undefined;
    this.onOverlayChange = () => undefined;
    this.root.remove();
  }

  private readonly handleStart = (): void => {
    if (this.transitioning || this.isOverlayOpen) return;
    this.clearPointerLockError();
    this.onStart();
  };

  private readonly handleStartFocus = (): void => this.onStartFocusChange(true);

  private readonly handleStartBlur = (): void => this.onStartFocusChange(false);

  private readonly handleGuideOpen = (): void => {
    this.openGuide();
  };

  private readonly handleGuideFocus = (): void => this.onGuideFocusChange(true);

  private readonly handleGuideBlur = (): void => this.onGuideFocusChange(false);

  private readonly handleGuideBackdrop = (event: MouseEvent): void => {
    if (event.target === this.guide) this.setGuideOpen(false);
  };

  private readonly handleGuideClose = (): void => this.setGuideOpen(false);

  private readonly handleGuidePrevious = (): void => this.moveGuidePage(-1);

  private readonly handleGuideNext = (): void => this.moveGuidePage(1);

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed || this.transitioning || event.defaultPrevented || event.repeat) return;
    if (this.guideOpen) this.handleGuideKeyDown(event);
    else if (event.key === 'Escape') {
      event.preventDefault();
      this.setPauseOpen(!this.pause.isOpen);
    } else if (this.pause.isOpen) this.pause.trapFocus(event);
  };

  private handleGuideKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.setGuideOpen(false);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.moveGuidePage(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.moveGuidePage(1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      this.setGuidePage(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      this.setGuidePage(GUIDE_PAGES.length - 1);
      return;
    }
    if (event.key === 'Tab') this.trapGuideFocus(event);
  }

  private setPauseOpen(open: boolean): void {
    if (this.disposed || this.pause.isOpen === open) return;
    if (open) this.pauseOrigin = this.menu.contains(document.activeElement)
      ? document.activeElement as HTMLElement : this.startButton;
    this.menu.toggleAttribute('inert', open);
    this.pause.setOpen(open);
    this.onOverlayChange();
    if (!open) {
      this.pauseOrigin?.focus();
      this.pauseOrigin = null;
    }
  }

  private trapGuideFocus(event: KeyboardEvent): void {
    const buttons = [
      this.guidePreviousButton,
      this.guideNextButton,
      this.guideCloseButton,
    ].filter((button) => !button.disabled);
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) {
      event.preventDefault();
      buttons[0]?.focus();
      return;
    }
    const boundary = event.shiftKey ? currentIndex === 0 : currentIndex === buttons.length - 1;
    if (!boundary) return;
    event.preventDefault();
    buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
  }

  private moveGuidePage(delta: -1 | 1): void {
    this.setGuidePage(this.guidePageIndex + delta, delta);
  }

  private setGuidePage(pageIndex: number, direction: -1 | 1 = 1): void {
    const nextIndex = Math.min(GUIDE_PAGES.length - 1, Math.max(0, pageIndex));
    if (nextIndex === this.guidePageIndex) return;
    this.guidePageIndex = nextIndex;
    this.renderGuidePage();
    const requested = direction < 0 ? this.guidePreviousButton : this.guideNextButton;
    const available = direction < 0 ? this.guideNextButton : this.guidePreviousButton;
    (requested.disabled ? available : requested).focus();
  }

  private readonly refreshLanguage = (): void => {
    this.pause.refreshLanguage();
    this.startButton.textContent = menuText('start');
    this.guideButton.textContent = menuText('guide');
    this.guideCloseButton.setAttribute('aria-label', menuText('close'));
    this.guidePreviousButton.setAttribute('aria-label', menuText('previous'));
    this.guideNextButton.setAttribute('aria-label', menuText('next'));
    this.guide.querySelector('nav')?.setAttribute('aria-label', menuText('pages'));
    if (this.pointerLockError.textContent) this.showPointerLockError();
    this.renderGuidePage();
  };

  private renderGuidePage(): void {
    const page = GUIDE_PAGES[this.guidePageIndex]!;
    this.guideTitle.textContent = page.title;
    this.guideImage.src = page.image;
    this.guideImage.alt = page.imageAlt;
    this.guideDescription.textContent = page.description;
    this.guidePageCount.textContent = menuText('page', this.guidePageIndex + 1, GUIDE_PAGES.length);
    this.guidePreviousButton.disabled = this.guidePageIndex === 0;
    this.guideNextButton.disabled = this.guidePageIndex === GUIDE_PAGES.length - 1;
    this.guide.dataset.page = String(this.guidePageIndex + 1);
  }

  private resetGuide(): void {
    if (this.guidePageIndex !== 0) {
      this.guidePageIndex = 0;
      this.renderGuidePage();
    }
  }

  private setGuideOpen(open: boolean): void {
    if (this.disposed || this.guideOpen === open) return;
    this.guideOpen = open;
    this.guide.classList.toggle('is-visible', open);
    this.guide.setAttribute('aria-hidden', String(!open));
    this.guide.toggleAttribute('inert', !open);
    this.menu.toggleAttribute('inert', open);
    this.onOverlayChange();
    if (open) {
      this.resetGuide();
      this.guideNextButton.focus();
    }
    else this.guideButton.focus();
  }
}
