import { describe, expect, it } from 'vitest';
import { itemArtwork, uiArtwork } from '../src/ui/uiArtwork';

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
});

describe('uiArtwork', () => {
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
