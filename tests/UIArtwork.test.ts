import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../src/game/ItemState';
import { UI_ARTWORK_IDS, itemArtwork, uiArtwork } from '../src/ui/uiArtwork';

describe('itemArtwork', () => {
  it('renders local decorative inline SVG for item and UI artwork', () => {
    [itemArtwork('cannedFood'), uiArtwork('warning')].forEach((markup) => {
      expect(markup).toContain('<svg');
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain('focusable="false"');
      expect(markup).not.toContain('<img');
      expect(markup).not.toContain('<title');
      expect(markup).not.toContain('<text');
      expect(markup).not.toMatch(/https?:\/\//);
    });
  });

  it('filters unsafe presentation classes from item portraits', () => {
    const markup = itemArtwork('cannedFood', 'safe-token bad" onload="alert(1)');

    expect(markup).toContain('class="item-artwork item-artwork--cannedFood safe-token"');
    expect(markup).not.toContain('onload');
  });

  it('renders one decorative portrait for every scavenging item type', () => {
    ITEM_IDS.forEach((id) => {
      const markup = itemArtwork(id, 'weight-circle__art');
      expect(markup).toContain('<svg');
      expect(markup).toContain(`data-item-artwork="${id}"`);
      expect(markup).toContain(`item-artwork--${id}`);
      expect(markup).toContain('weight-circle__art');
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).not.toContain('<title');
      expect(markup).not.toContain('<text');
      expect(markup).not.toMatch(/https?:\/\//);
    });
  });

  it('draws the flare as a compact signal pistol and omits the removed water jug', () => {
    expect(itemArtwork('flareGun')).toContain('data-flare-silhouette="signal-pistol"');
    expect(ITEM_IDS).not.toContain('waterJug');
  });
});

describe('uiArtwork', () => {
  it('renders every original symbol as decorative inline SVG', () => {
    expect(UI_ARTWORK_IDS).toEqual([
      'health', 'hunger', 'energy', 'hull', 'watch', 'journal', 'warning',
    ]);

    UI_ARTWORK_IDS.forEach((id) => {
      const markup = uiArtwork(id);
      expect(markup).toContain('<svg');
      expect(markup).toContain(`data-ui-artwork="${id}"`);
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain(`ui-artwork--${id}`);
      expect(markup).not.toContain('<img');
      expect(markup).not.toMatch(/https?:\/\//);
    });
  });

  it('applies a caller-supplied fixed presentation class', () => {
    expect(uiArtwork('watch', 'hud-watch')).toContain('class="ui-artwork ui-artwork--watch hud-watch"');
  });

  it('omits invalid class tokens while retaining fixed and valid CSS identifiers', () => {
    const markup = uiArtwork('warning', 'safe-token 123bad bad" onload="alert(1) <script>');

    expect(markup).toContain('class="ui-artwork ui-artwork--warning safe-token"');
    expect(markup).not.toContain('123bad');
    expect(markup).not.toContain('onload');
    expect(markup).not.toContain('<script>');
  });
});
