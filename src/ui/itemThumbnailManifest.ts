import type { ItemId } from '../game/ItemState';

const thumbnailModules = import.meta.glob<string>(
  '../assets/models/item-thumbnails/*.png',
  { eager: true, query: '?url', import: 'default' },
);

export function itemThumbnailUrl(id: ItemId): string {
  const url = thumbnailModules[`../assets/models/item-thumbnails/${id}.png`];
  if (url === undefined) throw new Error(`Missing item thumbnail: ${id}`);
  return url;
}
