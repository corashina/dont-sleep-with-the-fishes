import '../styles/mobile-gate.css';
import { onLanguageChange } from '../i18n/language';
import { mobileViewportText } from '../i18n/mobileViewportMessages';
import { prefersTouchControls } from './deviceCapabilities';

export interface VisibleViewport {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

export class MobileViewportController {
  readonly coarsePrimaryPointer = prefersTouchControls();
  private touchDevice = this.coarsePrimaryPointer;
  private readonly overlay: HTMLElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly onChange: () => void;
  private readonly onViewportEvent = () => this.refresh();
  private readonly onInterrupt = () => this.interrupt();
  private readonly onVisibilityChange = () => {
    if (document.hidden) this.interrupt();
  };
  private readonly onResume = () => this.resume();
  private readonly onKeyEvent = (event: KeyboardEvent) => {
    if (!this.suspended) return;
    const resumeKey = event.target === this.resumeButton && !this.portrait
      && (event.key === 'Enter' || event.key === ' ');
    if (!resumeKey) {
      event.preventDefault();
      (this.portrait ? this.title : this.resumeButton).focus({ preventScroll: true });
    }
    event.stopImmediatePropagation();
  };
  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || this.touchDevice) return;
    this.touchDevice = true;
    document.documentElement.dataset.touchControls = 'true';
    this.refresh();
    if (this.portrait) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  private readonly stopLanguage: () => void;
  private viewport: VisibleViewport;
  private portrait: boolean;
  private suspended: boolean;
  private readonly priorTouchControls: string | undefined;
  private priorFocus: HTMLElement | null = null;
  private gateVisible = false;
  private shownPortrait = false;

  constructor(mount: HTMLElement, onChange: () => void) {
    this.onChange = onChange;
    this.priorTouchControls = document.documentElement.dataset.touchControls;
    if (this.touchDevice) document.documentElement.dataset.touchControls = 'true';
    this.viewport = this.measure();
    this.portrait = this.touchDevice && this.viewport.height > this.viewport.width;
    this.suspended = this.portrait || (this.touchDevice && document.hidden);
    this.overlay = document.createElement('section');
    this.overlay.className = 'mobile-viewport-gate';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    const content = document.createElement('div');
    content.className = 'mobile-viewport-gate__content';
    this.title = document.createElement('h1');
    this.title.className = 'mobile-viewport-gate__title';
    this.title.id = 'mobile-viewport-gate-title';
    this.title.tabIndex = -1;
    this.overlay.setAttribute('aria-labelledby', this.title.id);
    this.detail = document.createElement('p');
    this.detail.className = 'mobile-viewport-gate__detail';
    this.resumeButton = document.createElement('button');
    this.resumeButton.className = 'salvage-action mobile-viewport-gate__resume';
    this.resumeButton.type = 'button';
    content.append(this.title, this.detail, this.resumeButton);
    this.overlay.append(content);
    mount.append(this.overlay);
    this.resumeButton.addEventListener('click', this.onResume);
    this.stopLanguage = onLanguageChange(() => this.render());
    window.addEventListener('resize', this.onViewportEvent);
    window.addEventListener('blur', this.onInterrupt);
    window.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('keydown', this.onKeyEvent, true);
    window.addEventListener('keyup', this.onKeyEvent, true);
    window.visualViewport?.addEventListener('resize', this.onViewportEvent);
    window.visualViewport?.addEventListener('scroll', this.onViewportEvent);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.render();
  }

  getViewport(): VisibleViewport { return this.viewport; }
  isSuspended(): boolean { return this.suspended; }

  dispose(): void {
    window.removeEventListener('resize', this.onViewportEvent);
    window.removeEventListener('blur', this.onInterrupt);
    window.removeEventListener('pointerdown', this.onPointerDown, true);
    window.removeEventListener('keydown', this.onKeyEvent, true);
    window.removeEventListener('keyup', this.onKeyEvent, true);
    window.visualViewport?.removeEventListener('resize', this.onViewportEvent);
    window.visualViewport?.removeEventListener('scroll', this.onViewportEvent);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.resumeButton.removeEventListener('click', this.onResume);
    this.stopLanguage();
    this.overlay.remove();
    this.restoreFocus();
    if (this.priorTouchControls === undefined) delete document.documentElement.dataset.touchControls;
    else document.documentElement.dataset.touchControls = this.priorTouchControls;
  }

  private measure(): VisibleViewport {
    const visible = window.visualViewport;
    return {
      width: Math.max(1, Math.round(visible?.width ?? window.innerWidth)),
      height: Math.max(1, Math.round(visible?.height ?? window.innerHeight)),
      left: Math.round(visible?.offsetLeft ?? 0),
      top: Math.round(visible?.offsetTop ?? 0),
    };
  }

  private refresh(): void {
    const next = this.measure();
    const old = this.viewport;
    const sizeChanged = next.width !== old.width || next.height !== old.height
      || next.left !== old.left || next.top !== old.top;
    if (sizeChanged) this.viewport = next;
    const portrait = this.touchDevice && next.height > next.width;
    const gateChanged = portrait !== this.portrait || (portrait && !this.suspended);
    this.portrait = portrait;
    if (portrait) this.suspended = true;
    if (sizeChanged || gateChanged) {
      this.render();
      this.onChange();
    }
  }

  private interrupt(): void {
    if (!this.touchDevice || this.suspended) return;
    this.suspended = true;
    this.render();
    this.onChange();
  }

  private resume(): void {
    if (this.portrait || document.hidden || !this.suspended) return;
    this.suspended = false;
    this.render();
    this.onChange();
  }

  private render(): void {
    this.overlay.hidden = !this.suspended;
    this.overlay.style.left = `${this.viewport.left}px`;
    this.overlay.style.top = `${this.viewport.top}px`;
    this.overlay.style.width = `${this.viewport.width}px`;
    this.overlay.style.height = `${this.viewport.height}px`;
    this.title.textContent = mobileViewportText(this.portrait ? 'rotateTitle' : 'resumeTitle');
    this.detail.textContent = mobileViewportText(this.portrait ? 'rotateDetail' : 'resumeDetail');
    this.resumeButton.textContent = mobileViewportText('resume');
    this.resumeButton.hidden = this.portrait;
    this.updateFocus();
  }

  private updateFocus(): void {
    const becameVisible = this.suspended && !this.gateVisible;
    const focusChanged = this.suspended && this.gateVisible && this.portrait !== this.shownPortrait;
    const becameHidden = !this.suspended && this.gateVisible;
    if (becameVisible) {
      const active = document.activeElement;
      this.priorFocus = active instanceof HTMLElement ? active : null;
    }
    if (becameVisible || focusChanged) {
      (this.portrait ? this.title : this.resumeButton).focus({ preventScroll: true });
    }
    if (becameHidden) this.restoreFocus();
    this.gateVisible = this.suspended;
    this.shownPortrait = this.portrait;
  }

  private restoreFocus(): void {
    if (this.priorFocus?.isConnected) this.priorFocus.focus({ preventScroll: true });
    this.priorFocus = null;
  }
}
