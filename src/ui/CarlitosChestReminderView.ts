import type { BoatInteractionAnchor } from '../survival/BoatInteraction';
import { uiText } from '../i18n/uiMessages';

export class CarlitosChestReminderView {
  readonly root = document.createElement('aside');
  private day = 0;
  private allowed = false;
  private blocked = false;
  private anchor: BoatInteractionAnchor | null = null;
  private delay = 0;
  private remaining = 0;

  constructor() {
    this.root.className = 'carlitos-chest-reminder ui-role-context';
    this.root.setAttribute('role', 'status');
    this.root.hidden = true;
  }

  configure(day: number, allowed: boolean): void {
    if (day !== this.day || !allowed) {
      this.delay = 0;
      this.remaining = 0;
    }
    this.day = day;
    this.allowed = allowed;
    this.root.textContent = uiText('carlitosChestReminder');
    this.position();
  }

  setBlocked(blocked: boolean): void {
    this.blocked = blocked;
    this.position();
  }

  setAnchors(anchors: readonly BoatInteractionAnchor[]): void {
    this.anchor = null;
    for (const anchor of anchors) {
      if (anchor.companionId === 'carlitos') { this.anchor = anchor; break; }
    }
    this.position();
  }

  update(seconds: number, due: boolean): boolean {
    if (!this.allowed || this.blocked || !this.anchor?.visible) return false;
    if (this.remaining > 0) {
      this.remaining = Math.max(0, this.remaining - seconds);
      this.position();
      return false;
    }
    if (!due) { this.delay = 0; return false; }
    this.delay += Math.max(0, seconds);
    if (this.delay < 4) return false;
    this.delay = 0;
    this.remaining = 8;
    this.position();
    return true;
  }

  private position(): void {
    const anchor = this.anchor;
    this.root.hidden = this.remaining <= 0 || this.blocked || !anchor?.visible;
    if (this.root.hidden || anchor === null) return;
    this.root.style.left = anchor.x + 'px';
    this.root.style.top = Math.max(100, anchor.y - (anchor.hitArea?.height ?? 0) / 2 - 16) + 'px';
  }
}
