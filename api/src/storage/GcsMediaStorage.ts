import type { Bucket } from '@google-cloud/storage';
import type { MediaStorage } from './MediaStorage.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Expiração da signed URL: fim do dia seguinte (UTC). Assim a URL é a mesma durante o dia todo
 * e o navegador reaproveita o cache — uma URL nova por requisição faria baixar os MP3 de novo
 * (tráfego de saída é o que custa no GCS). Validade fica entre 24 h e 48 h (limite V4: 7 dias).
 */
export function stableExpiry(now = Date.now()): number {
  return (Math.floor(now / DAY_MS) + 2) * DAY_MS;
}

/** Bucket privado; o navegador baixa direto do GCS por signed URL V4 de leitura. */
export class GcsMediaStorage implements MediaStorage {
  private cache = new Map<string, { url: string; expires: number }>();

  constructor(
    private readonly bucket: Bucket,
    private readonly prefix = 'songs',
  ) {}

  async getUrl(songId: string, file: string): Promise<string> {
    const key = `${this.prefix}/${songId}/${file}`;
    const expires = stableExpiry();
    const hit = this.cache.get(key);
    if (hit && hit.expires === expires) return hit.url;
    const [url] = await this.bucket.file(key).getSignedUrl({ version: 'v4', action: 'read', expires });
    this.cache.set(key, { url, expires });
    return url;
  }

  async put(songId: string, file: string, data: Buffer, contentType: string): Promise<void> {
    const key = `${this.prefix}/${songId}/${file}`;
    // ifGenerationMatch: 0 → só cria; nunca sobrescreve um arquivo existente.
    await this.bucket.file(key).save(data, {
      resumable: false,
      contentType,
      metadata: { cacheControl: 'private, max-age=86400' },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    this.cache.delete(key);
  }

  async remove(songId: string, files: string[]): Promise<void> {
    await Promise.all(
      files.map((f) => this.bucket.file(`${this.prefix}/${songId}/${f}`).delete({ ignoreNotFound: true })),
    );
  }
}
