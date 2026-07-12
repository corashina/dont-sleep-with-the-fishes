import { describe, expect, it } from 'vitest';
import { UI_ARTWORK_IDS, uiArtwork } from '../src/ui/uiArtwork';

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
