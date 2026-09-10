export interface DownloadProgress {
  readonly loaded: number;
  readonly total: number | null;
}

interface Download {
  loaded: number;
  total: number | null;
}

const active = new Set<Download>();
const listeners = new Set<(download: Download) => void>();
const pending = new Map<string, Promise<ArrayBuffer>>();

function publish(download: Download): void {
  for (const listener of listeners) listener(download);
}

// Each loading screen counts only downloads active or started during its lifetime.
export function observeAssetDownloads(onProgress: (progress: DownloadProgress) => void): () => void {
  const downloads = new Set(active);
  const update = (download?: Download): void => {
    if (download !== undefined) downloads.add(download);
    let loaded = 0;
    let total = 0;
    let known = true;
    for (const entry of downloads) {
      loaded += entry.loaded;
      total += entry.total ?? 0;
      if (entry.total === null) known = false;
    }
    onProgress({ loaded, total: known ? total : null });
  };
  listeners.add(update);
  update();
  return () => { listeners.delete(update); downloads.clear(); };
}

export function loadAssetBytes(
  url: string,
  fetchAsset: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<ArrayBuffer> {
  const existing = pending.get(url);
  if (existing !== undefined) return existing;
  const request = downloadAssetBytes(url, fetchAsset).finally(() => { pending.delete(url); });
  pending.set(url, request);
  return request;
}

async function downloadAssetBytes(url: string, fetchAsset: typeof fetch): Promise<ArrayBuffer> {
  const download: Download = { loaded: 0, total: null };
  active.add(download);
  publish(download);
  try {
    const response = await fetchAsset(url);
    if (!response.ok) throw new Error(`Asset download failed: ${url} (${response.status})`);
    const encoding = response.headers.get('content-encoding');
    const length = Number(response.headers.get('content-length'));
    // Stream chunks contain decoded bytes. Compressed Content-Length does not.
    if ((!encoding || encoding === 'identity') && Number.isFinite(length) && length > 0) {
      download.total = length;
    }
    publish(download);
    const reader = response.body?.getReader();
    let bytes: ArrayBuffer;
    if (reader === undefined) {
      bytes = await response.arrayBuffer();
    } else {
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          download.loaded += value.byteLength;
          if (download.total !== null && download.loaded > download.total) download.total = null;
          publish(download);
        }
      } finally {
        reader.releaseLock();
      }
      bytes = await new Blob(chunks).arrayBuffer();
    }
    download.loaded = bytes.byteLength;
    download.total = bytes.byteLength;
    return bytes;
  } finally {
    active.delete(download);
    publish(download);
  }
}
