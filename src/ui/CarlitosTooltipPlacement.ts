import type { BoatInteractionAnchor } from '../survival/BoatInteraction';

/** Prefers clear space; an active hover label stays visible in a crowded viewport. */
export class CarlitosTooltipPlacement {
  x = 0;
  y = 0;

  place(
    cat: BoatInteractionAnchor, anchors: ReadonlyMap<string, BoatInteractionAnchor>,
    width: number, height: number, viewportWidth: number, viewportHeight: number,
    active = false,
  ): boolean {
    if (!this.fitsViewport(width, height, viewportWidth, viewportHeight)) return false;
    const halfWidth = cat.hitArea === undefined ? 27 : cat.hitArea.width / 2;
    const halfHeight = cat.hitArea === undefined ? 27 : cat.hitArea.height / 2;
    let bestOverlap = Infinity;
    let bestX = 0;
    let bestY = 0;
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
        const overlap = this.overlapArea(anchors, width, height);
        if (overlap === 0) return true;
        if (overlap < bestOverlap) {
          bestOverlap = overlap;
          bestX = this.x;
          bestY = this.y;
        }
      }
    }
    this.x = bestX;
    this.y = bestY;
    return active;
  }

  private fitsViewport(width: number, height: number, viewportWidth: number, viewportHeight: number): boolean {
    return width > 0 && height > 0 && width <= viewportWidth - 24 && height <= viewportHeight - 24;
  }

  private overlapArea(anchors: ReadonlyMap<string, BoatInteractionAnchor>, width: number, height: number): number {
    let area = 0;
    for (const anchor of anchors.values()) {
      if (!anchor.visible) continue;
      const halfWidth = (anchor.hitArea?.width ?? 54) / 2 + 6;
      const halfHeight = (anchor.hitArea?.height ?? 54) / 2 + 6;
      area += Math.max(0, Math.min(this.x + width, anchor.x + halfWidth) - Math.max(this.x, anchor.x - halfWidth))
        * Math.max(0, Math.min(this.y + height, anchor.y + halfHeight) - Math.max(this.y, anchor.y - halfHeight));
    }
    return area;
  }
}
