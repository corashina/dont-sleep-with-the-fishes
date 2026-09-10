import { describe, expect, it, vi } from 'vitest';
import { loadAssetBytes, observeAssetDownloads, type DownloadProgress } from '../src/app/AssetDownloads';

function stream(headers: HeadersInit = {}) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: value => { controller = value; } });
  const fetchAsset = vi.fn(async () => new Response(body, { headers }));
  return { controller, fetchAsset };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('asset download bytes', () => {
  it('counts concurrent streams once and updates before downloads finish', async () => {
    const updates: DownloadProgress[] = [];
    const stop = observeAssetDownloads(value => updates.push(value));
    const first = stream({ 'content-length': '10' });
    const second = stream({ 'content-length': '20' });
    try {
      const a = loadAssetBytes('first.glb', first.fetchAsset);
      const duplicate = loadAssetBytes('first.glb', first.fetchAsset);
      const b = loadAssetBytes('second.png', second.fetchAsset);
      await flush();
      expect(updates.at(-1)).toEqual({ loaded: 0, total: 30 });
      first.controller.enqueue(new Uint8Array(4));
      second.controller.enqueue(new Uint8Array(6));
      await flush();
      expect(updates.at(-1)).toEqual({ loaded: 10, total: 30 });
      first.controller.enqueue(new Uint8Array(6));
      second.controller.enqueue(new Uint8Array(14));
      first.controller.close();
      second.controller.close();
      const results = await Promise.all([a, duplicate, b]);
      expect(results.map(result => result.byteLength)).toEqual([10, 10, 20]);
      expect(first.fetchAsset).toHaveBeenCalledOnce();
      expect(updates.at(-1)).toEqual({ loaded: 30, total: 30 });
    } finally { stop(); }
  });

  it.each<HeadersInit>([
    {},
    { 'content-length': '2', 'content-encoding': 'gzip' },
  ])('keeps unknown or compressed totals unknown until completion: %j', async headers => {
    const updates: DownloadProgress[] = [];
    const stop = observeAssetDownloads(value => updates.push(value));
    const source = stream(headers);
    try {
      const request = loadAssetBytes('unknown.ogg', source.fetchAsset);
      source.controller.enqueue(new Uint8Array(8));
      await flush();
      expect(updates.at(-1)).toEqual({ loaded: 8, total: null });
      source.controller.close();
      await request;
      expect(updates.at(-1)).toEqual({ loaded: 8, total: 8 });
    } finally { stop(); }
  });

  it('releases failed requests and starts new screens with fresh totals', async () => {
    const updates: DownloadProgress[] = [];
    const stop = observeAssetDownloads(value => updates.push(value));
    await expect(loadAssetBytes('retry.glb', async () => new Response(null, { status: 404 }))).rejects.toThrow('404');
    stop();
    const count = updates.length;
    const next = vi.fn();
    const stopNext = observeAssetDownloads(next);
    try {
      expect(next).toHaveBeenLastCalledWith({ loaded: 0, total: 0 });
      await loadAssetBytes('retry.glb', async () => new Response(new Uint8Array(7)));
      expect(next).toHaveBeenLastCalledWith({ loaded: 7, total: 7 });
      expect(updates).toHaveLength(count);
    } finally { stopNext(); }
  });
});
