import type { ProjectedBoatBounds } from '../survival/BoatInteraction';

export const FOCUSED_EVENT_MARGIN = 20;
export const FOCUSED_EVENT_BOTTOM_RESERVE = 128;
const TARGET_GAP = 24;

export function focusedEventPlacement(
  viewportWidth: number, viewportHeight: number, width: number, height: number,
  target: ProjectedBoatBounds | null,
) {
  const margin = FOCUSED_EVENT_MARGIN;
  const right = Math.max(margin + width, viewportWidth - margin);
  const bottom = Math.max(margin + 1, viewportHeight - FOCUSED_EVENT_BOTTOM_RESERVE);
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const centered = {
    x: (viewportWidth - width) / 2,
    y: Math.max(margin, (bottom - Math.min(height, bottom - margin)) / 2),
    maximumHeight: bottom - margin,
    placement: 'center',
    anchorState: 'centered',
  };
  if (!target?.visible) return centered;

  const regions = [
    { placement: 'left', left: margin, right: Math.min(right, target.x - target.width / 2 - TARGET_GAP), top: margin, bottom },
    { placement: 'right', left: Math.max(margin, target.x + target.width / 2 + TARGET_GAP), right, top: margin, bottom },
    { placement: 'above', left: margin, right, top: margin, bottom: Math.min(bottom, target.y - target.height / 2 - TARGET_GAP) },
    { placement: 'below', left: margin, right, top: Math.max(margin, target.y + target.height / 2 + TARGET_GAP), bottom },
  ];
  let best = centered;
  let bestHeight = 0;
  let bestDistance = Infinity;
  for (const region of regions) {
    if (region.right - region.left < width || region.bottom <= region.top) continue;
    const maximumHeight = region.bottom - region.top;
    const visibleHeight = Math.min(height, maximumHeight);
    const x = Math.max(region.left, Math.min(centerX - width / 2, region.right - width));
    const y = Math.max(region.top, Math.min(centerY - visibleHeight / 2, region.bottom - visibleHeight));
    const distance = (x + width / 2 - centerX) ** 2 + (y + visibleHeight / 2 - centerY) ** 2;
    // Keep the full card when space permits, then choose the position nearest the center.
    if (visibleHeight < bestHeight || (visibleHeight === bestHeight && distance >= bestDistance)) continue;
    best = { x, y, maximumHeight, placement: region.placement, anchorState: 'anchored' };
    bestHeight = visibleHeight;
    bestDistance = distance;
  }
  return best;
}
