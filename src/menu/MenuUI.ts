import { uiArtwork } from '../ui/uiArtwork';

const POINTER_LOCK_ERROR = 'Mouse look was blocked. Click the button and allow pointer lock to continue.';

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
  private readonly pointerLockError: HTMLElement;
  private transitioning = false;
  private guideOpen = false;
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
        aria-describedby="menu-how-to-play-intro" inert>
        <div class="screen__content how-to-play-board">
          <header class="how-to-play-board__header">
            <p class="kicker ui-role-context">BEFORE THE WATER WINS</p>
            <h2 class="ui-role-display" id="menu-how-to-play-title">HOW TO PLAY</h2>
            <p class="lead ui-role-narrative" id="menu-how-to-play-intro">
              Save what you can. Reach the lifeboat. Survive until rescue.
            </p>
          </header>
          <div class="how-to-play-route">
            <article class="how-to-play-step">
              <span class="how-to-play-step__number ui-role-numeral" aria-hidden="true">1</span>
              <div class="how-to-play-step__body">
                <h3 class="ui-role-context">ESCAPE DOROTHY</h3>
                <p class="how-to-play-step__objective ui-role-narrative">Dorothy sinks in 60 seconds.</p>
                <ul class="how-to-play-actions ui-role-narrative">
                  <li class="how-to-play-action">
                    ${uiArtwork('guideSearch', 'how-to-play-action__art')}
                    <strong class="how-to-play-action__label ui-role-context">SEARCH</strong>
                    <span>Find food, tools, and emergency supplies.</span>
                  </li>
                  <li class="how-to-play-action">
                    ${uiArtwork('guideCarry', 'how-to-play-action__art')}
                    <strong class="how-to-play-action__label ui-role-context">CARRY</strong>
                    <span>Carry items with a total weight of 3.</span>
                  </li>
                  <li class="how-to-play-action">
                    ${uiArtwork('guideSave', 'how-to-play-action__art')}
                    <strong class="how-to-play-action__label ui-role-context">SAVE</strong>
                    <span>Throw supplies into the lifeboat. Then get aboard.</span>
                  </li>
                </ul>
              </div>
            </article>
            <article class="how-to-play-step">
              <span class="how-to-play-step__number ui-role-numeral" aria-hidden="true">2</span>
              <div class="how-to-play-step__body">
                <h3 class="ui-role-context">SURVIVE THE SEA</h3>
                <p class="how-to-play-step__objective ui-role-narrative">Stay alive and keep the hull intact until rescue.</p>
                <ul class="how-to-play-actions ui-role-narrative">
                  <li class="how-to-play-action">
                    ${uiArtwork('guidePrepare', 'how-to-play-action__art')}
                    <strong class="how-to-play-action__label ui-role-context">PREPARE</strong>
                    <span>Fish, repair the hull, and use saved supplies.</span>
                  </li>
                  <li class="how-to-play-action">
                    ${uiArtwork('guideWatch', 'how-to-play-action__art')}
                    <strong class="how-to-play-action__label ui-role-context">WATCH</strong>
                    <span>Protect Health, Food, Energy, and Hull.</span>
                  </li>
                  <li class="how-to-play-action">
                    ${uiArtwork('guideEndDay', 'how-to-play-action__art')}
                    <strong class="how-to-play-action__label ui-role-context">END DAY</strong>
                    <span>Use the lantern when ready. Night events follow.</span>
                  </li>
                </ul>
                <p class="how-to-play-rescue-stamp ui-role-context">RESCUE CHANCE RISES EACH DAY</p>
              </div>
            </article>
          </div>
          <section class="how-to-play-controls" aria-labelledby="menu-how-to-play-controls-title">
            <h3 class="ui-role-context" id="menu-how-to-play-controls-title">CONTROLS</h3>
            <dl class="controls how-to-play-controls__grid ui-role-context" aria-label="Game controls">
              <div>
                <dt>MOVE</dt>
                <dd class="control-keys control-keys--move"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dd>
              </div>
              <div><dt>LOOK</dt><dd class="control-keys"><kbd>MOUSE</kbd></dd></div>
              <div><dt>SPRINT</dt><dd class="control-keys"><kbd>SHIFT</kbd></dd></div>
              <div><dt>JUMP</dt><dd class="control-keys"><kbd>SPACE</kbd></dd></div>
              <div><dt>USE / TAKE</dt><dd class="control-keys"><kbd>LEFT CLICK</kbd></dd></div>
              <div><dt>PAUSE</dt><dd class="control-keys"><kbd>ESC</kbd></dd></div>
            </dl>
            <p class="how-to-play-note ui-role-narrative">
              In the lifeboat, use the mouse or <kbd>TAB</kbd>. Press <kbd>ENTER</kbd> or <kbd>SPACE</kbd> to choose.
            </p>
          </section>
          <button type="button" class="primary-action salvage-action ui-role-context" data-menu-guide-close>
            BACK TO THE TITLE
          </button>
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
    this.pointerLockError = requireElement(this.root, '[data-menu-pointer-lock-error]');
    this.startButton.addEventListener('click', this.handleStart);
    this.startButton.addEventListener('focus', this.handleStartFocus);
    this.startButton.addEventListener('blur', this.handleStartBlur);
    this.guideButton.addEventListener('click', this.handleGuideOpen);
    this.guideButton.addEventListener('focus', this.handleGuideFocus);
    this.guideButton.addEventListener('blur', this.handleGuideBlur);
    this.guideCloseButton.addEventListener('click', this.handleGuideClose);
    this.root.addEventListener('keydown', this.handleKeyDown);
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

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.guideOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.setGuideOpen(false);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.guideCloseButton.focus();
    }
  };

  private setGuideOpen(open: boolean): void {
    if (this.disposed || this.guideOpen === open) return;
    this.guideOpen = open;
    this.guide.classList.toggle('is-visible', open);
    this.guide.setAttribute('aria-hidden', String(!open));
    this.guide.toggleAttribute('inert', !open);
    this.menu.toggleAttribute('inert', open);
    if (open) this.guideCloseButton.focus();
    else this.guideButton.focus();
  }
}
