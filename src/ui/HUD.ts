import type { GameState } from '../state/GameState';

const ORDER: { key: 'hunger'|'hull'|'health'|'morale'|'energy'; label: string; color: string }[] = [
  { key: 'hunger', label: 'Hunger', color: '#e0a33a' },
  { key: 'hull',   label: 'Hull',   color: '#9a9a9a' },
  { key: 'health', label: 'Health', color: '#c0392b' },
  { key: 'morale', label: 'Morale', color: '#8e44ad' },
  { key: 'energy', label: 'Energy', color: '#27ae60' },
];

export class HUD {
  private bars: Record<string, HTMLDivElement> = {};
  private dayLabel: HTMLDivElement;

  constructor(root: HTMLElement, private state: GameState) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;top:0;left:0;right:0;display:flex;gap:12px;padding:10px;font:13px system-ui;color:#eef;pointer-events:none;';
    for (const o of ORDER) {
      const col = document.createElement('div');
      col.innerHTML = `<div style="opacity:.8;margin-bottom:3px">${o.label}</div>`;
      const track = document.createElement('div');
      track.style.cssText = `width:90px;height:8px;background:#222;border-radius:4px;overflow:hidden`;
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:100%;background:${o.color};transition:width .25s`;
      track.appendChild(fill);
      col.appendChild(track);
      wrap.appendChild(col);
      this.bars[o.key] = fill;
    }
    this.dayLabel = document.createElement('div');
    this.dayLabel.style.cssText = 'margin-left:auto;align-self:center;font-weight:bold';
    wrap.appendChild(this.dayLabel);
    root.appendChild(wrap);
  }

  render(): void {
    for (const o of ORDER) {
      this.bars[o.key].style.width = `${this.state.resources[o.key]}%`;
    }
  }

  setDayLabel(text: string): void { this.dayLabel.textContent = text; }
}
