export type ModalInitialFocus = HTMLElement | (() => HTMLElement | null);

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

export class ModalFocusManager {
  private readonly origins = new Map<HTMLElement, HTMLElement | null>();
  private disposed = false;

  constructor(
    private readonly background: readonly HTMLElement[],
    private readonly modals: readonly HTMLElement[],
    private readonly initialFocus: ReadonlyMap<HTMLElement, ModalInitialFocus> = new Map(),
    private readonly isModal: (layer: HTMLElement) => boolean = () => true,
    private readonly sharedControls: ReadonlyMap<HTMLElement, readonly HTMLElement[]> = new Map(),
  ) {}

  topmostModal(): HTMLElement | null {
    if (this.disposed) return null;
    return this.modals.find((modal) => (
      modal.classList.contains('is-visible') && this.isModal(modal)
    )) ?? null;
  }

  activate(modal: HTMLElement, origin: HTMLElement | null = null): void {
    if (this.disposed) return;
    const wasActive = modal.classList.contains('is-visible');
    if (!wasActive) this.origins.set(modal, origin);
    modal.classList.add('is-visible');
    this.sync();
    if (modal.hasAttribute('inert')) return;
    const active = document.activeElement;
    const hasValidInteriorFocus = wasActive
      && active instanceof HTMLElement
      && active.isConnected
      && modal.contains(active);
    if (!hasValidInteriorFocus) this.focusInitial(modal);
  }

  deactivate(modal: HTMLElement, restore = true): void {
    if (this.disposed || !modal.classList.contains('is-visible')) return;
    const wasTopmost = this.topmostModal() === modal;
    const origin = this.origins.get(modal) ?? null;
    this.origins.delete(modal);
    modal.classList.remove('is-visible');
    this.sync();
    if (!wasTopmost || !restore) return;
    const topmost = this.topmostModal();
    if (topmost !== null) {
      this.focusInitial(topmost);
    } else {
      this.restore(origin);
    }
  }

  sync(): void {
    if (this.disposed) return;
    const topmost = this.topmostModal();
    this.modals.forEach((modal) => {
      const accessible = modal === topmost || (
        topmost === null && modal.classList.contains('is-visible') && !this.isModal(modal)
      );
      modal.toggleAttribute('inert', !accessible);
      modal.setAttribute('aria-hidden', accessible ? 'false' : 'true');
    });
    const modalOpen = topmost !== null;
    const shared = topmost === null ? undefined : this.sharedControls.get(topmost);
    this.background.forEach((region) => region.toggleAttribute('inert', modalOpen && !shared?.includes(region)));
  }

  focusInitial(modal: HTMLElement): void {
    if (this.disposed || !modal.classList.contains('is-visible') || modal.hasAttribute('inert')) return;
    const target = this.initialFocus.get(modal);
    const resolved = typeof target === 'function' ? target() : target;
    resolved?.focus();
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (this.disposed || event.key !== 'Tab') return false;
    const modal = this.topmostModal();
    if (modal === null) return false;
    const shared = this.sharedControls.get(modal) ?? [];
    const controls = [...shared, ...modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      .filter((element) => (
        element.closest('[hidden]') === null
        && !element.hasAttribute('inert')
        && element.getAttribute('aria-hidden') !== 'true'
      ));
    if (controls.length === 0) {
      event.preventDefault();
      this.focusInitial(modal);
      return true;
    }
    this.cycleFocus(event, controls);
    return true;
  }

  private cycleFocus(event: KeyboardEvent, controls: readonly HTMLElement[]): void {
    event.preventDefault();
    const active = document.activeElement;
    const index = active instanceof HTMLElement ? controls.indexOf(active) : -1;
    const next = index < 0
      ? (event.shiftKey ? controls.length - 1 : 0)
      : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    controls[next]!.focus();
  }

  restore(target: HTMLElement | null = null): void {
    if (
      this.disposed
      || target === null
      || !target.isConnected
      || target.hidden
      || target.closest('[hidden], [inert], [aria-hidden="true"]') !== null
      || (target instanceof HTMLButtonElement && target.disabled)
    ) return;
    target.focus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.origins.clear();
  }
}
