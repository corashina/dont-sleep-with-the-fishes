export class Dialogs {
  private box: HTMLDivElement;
  constructor(root: HTMLElement) {
    this.box = document.createElement('div');
    this.box.style.cssText = 'position:absolute;left:50%;bottom:64px;transform:translateX(-50%);width:min(620px,80%);background:rgba(8,12,20,.82);color:#eef;padding:12px 16px;border-radius:8px;font:15px/1.4 system-ui;pointer-events:none';
    root.appendChild(this.box);
  }
  setText(text: string): void { this.box.textContent = text; this.box.style.display = 'block'; }
  clear(): void { this.box.style.display = 'none'; }
}
