import type { BoatInteractionAnchor } from '../survival/BoatInteraction';

/** Keeps the label beside its model without covering another interaction target. */
export class CarlitosTooltipPlacement {
  x = 0;
  y = 0;

  place(
    cat: BoatInteractionAnchor, anchors: ReadonlyMap<string, BoatInteractionAnchor>,
    width: number, height: number, viewportWidth: number, viewportHeight: number,
  ): boolean {
    if (!this.fitsViewport(width, height, viewportWidth, viewportHeight)) return false;
    const halfWidth = (cat.hitArea?.width ?? 54) / 2;
    const halfHeight = (cat.hitArea?.height ?? 54) / 2;
    for (let ring = 0; ring < 6; ring++) {
      const gap = 10 + ring * 24;
      for (let side = 0; side < 4; side++) {
        this.x = cat.x - width / 2;
        this.y = cat.y - halfHeight - height - gap;
        if (side === 1) this.y = cat.y + halfHeight + gap;
        if (side >= 2) {
          this.x = side === 2 ? cat.x + halfWidth + gap : cat.x - halfWidth - width - gap;
          this.y = cat.y - height / 2;
        }
        this.x = Math.round(Math.max(12, Math.min(viewportWidth - width - 12, this.x)));
        this.y = Math.round(Math.max(12, Math.min(viewportHeight - height - 12, this.y)));
        if (this.isClear(anchors, width, height)) return true;
      }
    }
    return false;
  }

  private fitsViewport(width: number, height: number, viewportWidth: number, viewportHeight: number): boolean {
    return width > 0 && height > 0 && width <= viewportWidth - 24 && height <= viewportHeight - 24;
  }

  private isClear(anchors: ReadonlyMap<string, BoatInteractionAnchor>, width: number, height: number): boolean {
    for (const anchor of anchors.values()) {
      if (!anchor.visible) continue;
      const halfWidth = (anchor.hitArea?.width ?? 54) / 2 + 6;
      const halfHeight = (anchor.hitArea?.height ?? 54) / 2 + 6;
      if (this.x < anchor.x + halfWidth && this.x + width > anchor.x - halfWidth
        && this.y < anchor.y + halfHeight && this.y + height > anchor.y - halfHeight) return false;
    }
    return true;
  }
}
