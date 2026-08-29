const POINTER_LOCK_ERROR = 'Mouse look was blocked. Click the button and allow pointer lock to continue.';
const GUIDE_ASSET_ROOT = `${import.meta.env.BASE_URL}images/how-to-play`;

interface GuidePage {
  readonly stage: string;
  readonly title: string;
  readonly image: string;
  readonly imageAlt: string;
  readonly description: string;
}

const GUIDE_PAGES: readonly GuidePage[] = Object.freeze([
  {
    stage: 'STAGE 1 · THE SINKING SHIP',
    title: 'SCAVENGE DOROTHY',
    image: `${GUIDE_ASSET_ROOT}/scavenging.png`,
    imageAlt: 'First-person view on Dorothy with the one-minute timer and three empty carry slots.',
    description: 'Dorothy sinks in 60 seconds. Search the ship for food, tools, and emergency supplies. Carry up to three weight, throw supplies into the lifeboat, then climb aboard before time ends.',
  },
  {
    stage: 'STAGE 2 · SURVIVAL DAY',
    title: 'SURVIVE THE DAY',
    image: `${GUIDE_ASSET_ROOT}/survival-day.png`,
    imageAlt: 'Daylight view from the lifeboat with recovered supplies, Carlitos, and condition meters.',
    description: 'Each day gives limited energy. Fish, dive, eat, repair the hull, and use recovered supplies. Protect Health, Food, Energy, and Hull. Use the lantern when you are ready to end the day.',
  },
  {
    stage: 'STAGE 3 · FISHING',
    title: 'FISH FOR FOOD',
    image: `${GUIDE_ASSET_ROOT}/survival-fishing.png`,
    imageAlt: 'Fishing view over the bow after the line has been cast into the sea.',
    description: 'Fishing costs one energy. Cast into the water, wait for a bite, then reel before the chance passes. Bait improves a fish catch and is used only when a fish lands.',
  },
  {
    stage: 'STAGE 4 · SURVIVAL NIGHT',
    title: 'FACE THE NIGHT',
    image: `${GUIDE_ASSET_ROOT}/survival-night-event.png`,
    imageAlt: 'The lifeboat at night during a rain event with the umbrella and bucket highlighted.',
    description: 'Night brings uncertain events. Read the situation and choose a response. A saved item can protect you, but each result can change your health, food, hull, or supplies. Dawn records the night in the journal.',
  },
]);

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing menu element: ${selector}`);
  return element;
}

export class MenuUI {
  onStart: () => void = () => undefined;
  onStartFocusChange: (focused: boolean) => void = () => undefined;
  onGuideFocusChange: (focused: boolean) => void = () => undefined;
  private readonly root: HTMLDivElement;
  private readonly menu: HTMLElement;
  private readonly guide: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly guideButton: HTMLButtonElement;
  private readonly guideCloseButton: HTMLButtonElement;
  private readonly guidePreviousButton: HTMLButtonElement;
  private readonly guideNextButton: HTMLButtonElement;
  private readonly guideStage: HTMLElement;
  private readonly guideTitle: HTMLElement;
  private readonly guideImage: HTMLImageElement;
  private readonly guideDescription: HTMLElement;
  private readonly guidePageCount: HTMLElement;
  private readonly pointerLockError: HTMLElement;
  private transitioning = false;
  private guideOpen = false;
  private guidePageIndex = 0;
  private disposed = false;

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
        <div class="screen__content how-to-play-book">
          <div class="how-to-play-book__cover" aria-hidden="true"></div>
          <div class="how-to-play-book__rings" aria-hidden="true"><i></i><i></i><i></i></div>
          <div class="how-to-play-book__tabs" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <article class="how-to-play-page">
            <header class="how-to-play-page__header">
              <p class="how-to-play-page__stage ui-role-context" data-menu-guide-stage></p>
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
            <button type="button" class="how-to-play-page__close ui-role-context" data-menu-guide-close>
              BACK TO THE TITLE
            </button>
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
    this.guideStage = requireElement(this.root, '[data-menu-guide-stage]');
    this.guideTitle = requireElement(this.root, '[data-menu-guide-title]');
    this.guideImage = requireElement(this.root, '[data-menu-guide-image]');
    this.guideDescription = requireElement(this.root, '[data-menu-guide-description]');
    this.guidePageCount = requireElement(this.root, '[data-menu-guide-page-count]');
    this.pointerLockError = requireElement(this.root, '[data-menu-pointer-lock-error]');
    this.startButton.addEventListener('click', this.handleStart);
    this.startButton.addEventListener('focus', this.handleStartFocus);
    this.startButton.addEventListener('blur', this.handleStartBlur);
    this.guideButton.addEventListener('click', this.handleGuideOpen);
    this.guideButton.addEventListener('focus', this.handleGuideFocus);
    this.guideButton.addEventListener('blur', this.handleGuideBlur);
    this.guideCloseButton.addEventListener('click', this.handleGuideClose);
    this.guidePreviousButton.addEventListener('click', this.handleGuidePrevious);
    this.guideNextButton.addEventListener('click', this.handleGuideNext);
    this.root.addEventListener('keydown', this.handleKeyDown);
    this.renderGuidePage();
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
    this.pointerLockError.textContent = POINTER_LOCK_ERROR;
    this.pointerLockError.classList.add('is-visible');
  }

  clearPointerLockError(): void {
    this.pointerLockError.textContent = '';
    this.pointerLockError.classList.remove('is-visible');
  }

  openGuide(): void {
    if (!this.transitioning) this.setGuideOpen(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.startButton.removeEventListener('click', this.handleStart);
    this.startButton.removeEventListener('focus', this.handleStartFocus);
    this.startButton.removeEventListener('blur', this.handleStartBlur);
    this.guideButton.removeEventListener('click', this.handleGuideOpen);
    this.guideButton.removeEventListener('focus', this.handleGuideFocus);
    this.guideButton.removeEventListener('blur', this.handleGuideBlur);
    this.guideCloseButton.removeEventListener('click', this.handleGuideClose);
    this.guidePreviousButton.removeEventListener('click', this.handleGuidePrevious);
    this.guideNextButton.removeEventListener('click', this.handleGuideNext);
    this.root.removeEventListener('keydown', this.handleKeyDown);
    this.onStart = () => undefined;
    this.onStartFocusChange = () => undefined;
    this.onGuideFocusChange = () => undefined;
    this.root.remove();
  }

  private readonly handleStart = (): void => {
    if (this.transitioning) return;
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

  private readonly handleGuideClose = (): void => this.setGuideOpen(false);

  private readonly handleGuidePrevious = (): void => this.moveGuidePage(-1);

  private readonly handleGuideNext = (): void => this.moveGuidePage(1);

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.guideOpen) return;
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
  };

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

  private renderGuidePage(): void {
    const page = GUIDE_PAGES[this.guidePageIndex]!;
    this.guideStage.textContent = page.stage;
    this.guideTitle.textContent = page.title;
    this.guideImage.src = page.image;
    this.guideImage.alt = page.imageAlt;
    this.guideDescription.textContent = page.description;
    this.guidePageCount.textContent = `PAGE ${this.guidePageIndex + 1} OF ${GUIDE_PAGES.length}`;
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
    if (open) {
      this.resetGuide();
      this.guideNextButton.focus();
    }
    else this.guideButton.focus();
  }
}
