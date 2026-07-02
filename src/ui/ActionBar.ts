export class ActionBar {
  private root: HTMLDivElement;
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:10px;flex-wrap:wrap;justify-content:center';
    parent.appendChild(this.root);
  }
  clear(): void { this.root.innerHTML = ''; }
  button(label: string, cb: () => void, opts: { disabled?: boolean } = {}): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = !!opts.disabled;
    b.style.cssText = 'padding:10px 14px;border:none;border-radius:6px;background:#2b4a6f;color:#fff;font:14px system-ui;cursor:pointer';
    if (b.disabled) { b.style.background = '#444'; b.style.cursor = 'not-allowed'; }
    b.onclick = cb;
    this.root.appendChild(b);
    return b;
  }
  itemButtons(ids: string[], labels: Record<string, string>, onPick: (id: string) => void): void {
    ids.forEach((id) => this.button(labels[id] ?? id, () => onPick(id)));
    this.button('(do nothing)', () => onPick(''));
  }
}
