export interface SolverFile {
  name: string;
  bytes: number;
  sha256: string;
}

export interface SolverManifest {
  cache: string;
  bytes: number;
  files: SolverFile[];
}

export interface CacheStore {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  keys(): Promise<string[]>;
}

export interface DownloadProgress {
  received: number;
  total: number;
}

export class DownloadCancelled extends Error {
  constructor() {
    super("The shorter solver download was cancelled.");
    this.name = "DownloadCancelled";
  }
}

export function formatDownload(progress: DownloadProgress): string {
  const received = progress.received / 1_000_000;
  const total = progress.total / 1_000_000;
  const percent = progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : 0;
  return `${received.toFixed(1)} / ${total.toFixed(1)} MB · ${percent}%`;
}

export async function cacheHasAll(cache: CacheStore, urls: readonly string[]): Promise<boolean> {
  for (const url of urls) {
    const hit = await cache.match(url);
    if (!hit) return false;
  }
  return true;
}

/**
 * Fetch every solver file into Cache Storage, reporting bytes as they arrive.
 * Files already stored are counted immediately and are not fetched again.
 */
export async function downloadSolver(options: {
  files: readonly { url: string; bytes: number }[];
  cache: CacheStore;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const total = options.files.reduce((sum, file) => sum + file.bytes, 0);
  let received = 0;
  const report = () => options.onProgress?.({ received, total });
  report();
  for (const file of options.files) {
    if (options.signal?.aborted) throw new DownloadCancelled();
    const hit = await options.cache.match(file.url);
    if (hit) {
      received += file.bytes;
      report();
      continue;
    }
    let response: Response;
    try {
      response = await fetchImpl(file.url, { signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted) throw new DownloadCancelled();
      throw error;
    }
    if (!response.ok || !response.body) throw new Error(`Could not download ${file.url}`);
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/html")) throw new Error(`Could not download ${file.url}`);
    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    while (true) {
      if (options.signal?.aborted) {
        await reader.cancel();
        throw new DownloadCancelled();
      }
      const step = await reader.read();
      if (step.done) break;
      if (step.value) {
        chunks.push(step.value);
        received += step.value.byteLength;
        report();
      }
    }
    const body = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    await options.cache.put(file.url, new Response(body, { headers: { "Content-Length": String(body.byteLength) } }));
  }
}

export async function removeSolverCache(cacheName: string): Promise<void> {
  await caches.delete(cacheName);
}
