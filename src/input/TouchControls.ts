import { onLanguageChange } from '../i18n/language';
import { touchText } from '../i18n/touchMessages';
import type { InputController } from './InputController';
import { prefersTouchControls } from '../browser/deviceCapabilities';
import '../styles/touch-controls.css';

export function touchControlsSelected(): boolean {
  const selected = typeof document === 'undefined'
    ? undefined
    : document.documentElement.dataset.touchControls;
  return selected === 'true' || (selected !== 'false' && prefersTouchControls());
}

export function selectTouchControls(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.touchControls = 'true';
}

export function selectMouseControls(): void {
  if (typeof document !== 'undefined' && !prefersTouchControls()) {
    document.documentElement.dataset.touchControls = 'false';
  }
}

export interface TouchControlActions {
  interrupted(): void;
  pause(): void;
  skipIntro(): void;
}

type Presentation = 'intro' | 'playing' | 'hidden';
type Action = 'interact' | 'jump' | 'sprint' | 'pause' | 'skipIntro';

export class TouchControls {
  private readonly root = document.createElement('div');
  private readonly stick = document.createElement('div');
  private readonly look = document.createElement('div');
  private readonly buttons = new Map<Action, HTMLButtonElement>();
  private readonly actionPointers = new Set<number>();
  private readonly unsubscribeLanguage: () => void;
  private presentation: Presentation = 'hidden';
  private enabled = true;
  private movePointer: number | null = null;
  private lookPointer: number | null = null;
  private lookX = 0;
  private lookY = 0;
  private sprint = false;
  private disposed = false;

  constructor(
    mount: HTMLElement,
    private readonly input: InputController,
    private readonly actions: TouchControlActions,
  ) {
    this.root.className = 'touch-controls';
    this.root.hidden = true;
    this.stick.className = 'touch-controls__stick touch-controls__play';
    this.stick.dataset.touchStick = '';
    this.stick.setAttribute('role', 'application');
    this.look.className = 'touch-controls__look touch-controls__play';
    this.look.dataset.touchLook = '';
    this.look.setAttribute('aria-hidden', 'true');
    this.root.append(this.look, this.stick);
    for (const action of ['interact', 'jump', 'sprint', 'pause', 'skipIntro'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `touch-controls__button touch-controls__${action === 'skipIntro' ? 'skip' : action}`;
      if (action !== 'skipIntro' && action !== 'pause') button.classList.add('touch-controls__play');
      if (action === 'pause') button.classList.add('touch-controls__play');
      button.dataset[`touch${action[0]!.toUpperCase()}${action.slice(1)}`] = '';
      button.addEventListener('pointerdown', this.onActionDown);
      button.addEventListener('pointerup', this.onActionUp);
      button.addEventListener('pointercancel', this.onActionCancel);
      button.addEventListener('lostpointercapture', this.onActionLost);
      this.buttons.set(action, button);
      this.root.append(button);
    }
    this.stick.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('pointermove', this.onStickMove);
    this.stick.addEventListener('pointerup', this.onStickUp);
    this.stick.addEventListener('pointercancel', this.onStickCancel);
    this.stick.addEventListener('lostpointercapture', this.onStickLost);
    this.look.addEventListener('pointerdown', this.onLookDown);
    this.look.addEventListener('pointermove', this.onLookMove);
    this.look.addEventListener('pointerup', this.onLookUp);
    this.look.addEventListener('pointercancel', this.onLookCancel);
    this.look.addEventListener('lostpointercapture', this.onLookLost);
    mount.append(this.root);
    this.unsubscribeLanguage = onLanguageChange(this.refreshLanguage);
    this.refreshLanguage();
  }

  setPresentation(presentation: Presentation): void {
    if (this.presentation !== presentation) this.reset();
    this.presentation = presentation;
    this.root.dataset.presentation = presentation;
    this.root.hidden = !this.enabled || presentation === 'hidden';
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) this.reset();
    this.enabled = enabled;
    this.root.hidden = !enabled || this.presentation === 'hidden';
  }

  isLookSurface(target: EventTarget | null): boolean {
    return target === this.look;
  }

  reset(): void {
    this.movePointer = null;
    this.lookPointer = null;
    this.actionPointers.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.sprint = false;
    this.stick.style.removeProperty('--stick-x');
    this.stick.style.removeProperty('--stick-y');
    this.buttons.get('sprint')?.setAttribute('aria-pressed', 'false');
    this.input.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    this.unsubscribeLanguage();
    this.root.remove();
  }

  private readonly refreshLanguage = (): void => {
    for (const [action, button] of this.buttons) {
      const label = touchText(action);
      button.textContent = label;
      button.setAttribute('aria-label', label);
    }
  };

  private capture(target: Element, pointerId: number): void {
    try { target.setPointerCapture?.(pointerId); } catch { /* Capture can fail after cancellation. */ }
  }

  private readonly onStickDown = (event: PointerEvent): void => {
    if (!this.enabled || this.presentation !== 'playing' || event.pointerType !== 'touch' || this.movePointer !== null) return;
    event.preventDefault();
    this.movePointer = event.pointerId;
    this.capture(this.stick, event.pointerId);
    this.updateStick(event);
  };

  private readonly onStickMove = (event: PointerEvent): void => {
    if (event.pointerId === this.movePointer) this.updateStick(event);
  };

  private updateStick(event: PointerEvent): void {
    const bounds = this.stick.getBoundingClientRect();
    const radius = bounds.width * 0.39;
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius ? radius / distance : 1;
    const x = dx * scale / radius;
    const z = dy * scale / radius;
    this.input.setTouchMovement(Math.abs(x) < 0.12 ? 0 : x, Math.abs(z) < 0.12 ? 0 : z);
    this.stick.style.setProperty('--stick-x', `${dx * scale}px`);
    this.stick.style.setProperty('--stick-y', `${dy * scale}px`);
  }

  private readonly onStickUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.movePointer) return;
    this.movePointer = null;
    this.input.setTouchMovement(0, 0);
    this.stick.style.removeProperty('--stick-x');
    this.stick.style.removeProperty('--stick-y');
  };

  private readonly onStickCancel = (event: PointerEvent): void => this.interruptPointer(event.pointerId);
  private readonly onStickLost = (event: PointerEvent): void => this.interruptPointer(event.pointerId);

  private readonly onLookDown = (event: PointerEvent): void => {
    if (!this.enabled || this.presentation !== 'playing' || event.pointerType !== 'touch' || this.lookPointer !== null) return;
    event.preventDefault();
    this.lookPointer = event.pointerId;
    this.lookX = event.clientX;
    this.lookY = event.clientY;
    this.capture(this.look, event.pointerId);
  };

  private readonly onLookMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.lookPointer) return;
    this.input.addTouchLook(event.clientX - this.lookX, event.clientY - this.lookY);
    this.lookX = event.clientX;
    this.lookY = event.clientY;
  };

  private readonly onLookUp = (event: PointerEvent): void => {
    if (event.pointerId === this.lookPointer) this.lookPointer = null;
  };

  private readonly onLookCancel = (event: PointerEvent): void => this.interruptPointer(event.pointerId);
  private readonly onLookLost = (event: PointerEvent): void => this.interruptPointer(event.pointerId);

  private readonly onActionDown = (event: PointerEvent): void => {
    if (!this.enabled || event.pointerType !== 'touch' || this.actionPointers.has(event.pointerId)) return;
    const button = event.currentTarget as HTMLButtonElement;
    const action = [...this.buttons].find(([, value]) => value === button)?.[0];
    if (!action || (this.presentation === 'intro' ? action !== 'skipIntro' : action === 'skipIntro')) return;
    event.preventDefault();
    this.actionPointers.add(event.pointerId);
    this.capture(button, event.pointerId);
    if (action === 'interact') this.input.queueTouchInteract();
    else if (action === 'jump') this.input.queueTouchJump();
    else if (action === 'sprint') {
      this.sprint = !this.sprint;
      this.input.setTouchSprint(this.sprint);
      button.setAttribute('aria-pressed', String(this.sprint));
    } else if (action === 'pause') this.actions.pause();
    else this.actions.skipIntro();
  };

  private readonly onActionUp = (event: PointerEvent): void => { this.actionPointers.delete(event.pointerId); };
  private readonly onActionCancel = (event: PointerEvent): void => this.interruptPointer(event.pointerId);
  private readonly onActionLost = (event: PointerEvent): void => this.interruptPointer(event.pointerId);

  private interruptPointer(pointerId: number): void {
    if (pointerId !== this.movePointer && pointerId !== this.lookPointer && !this.actionPointers.has(pointerId)) return;
    this.setEnabled(false);
    this.actions.interrupted();
  }
}
