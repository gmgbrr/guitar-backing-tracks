import type { Bucket } from '@google-cloud/storage';
import type { UploadField } from '@backing-tracks/shared';
import type { MediaStorage, UploadTarget } from './MediaStorage.js';

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

  // ---- área temporária: uploads/<uploadId>/<campo> (regra de ciclo de vida apaga após 1 dia) ----

  private staged(uploadId: string, field: UploadField) {
    return this.bucket.file(`uploads/${uploadId}/${field}`);
  }

  async createUploadTarget(uploadId: string, field: UploadField, maxBytes: number): Promise<UploadTarget> {
    // Content-Type e faixa de tamanho fazem parte da assinatura: o GCS recusa o PUT se não baterem.
    const headers = {
      'Content-Type': 'application/octet-stream',
      'x-goog-content-length-range': `1,${maxBytes}`,
    };
    const [url] = await this.staged(uploadId, field).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + UPLOAD_URL_TTL_MS,
      contentType: headers['Content-Type'],
      extensionHeaders: { 'x-goog-content-length-range': headers['x-goog-content-length-range'] },
    });
    return { url, headers };
  }

  async readStaged(uploadId: string, field: UploadField, maxBytes: number): Promise<Buffer | null> {
    const file = this.staged(uploadId, field);
    try {
      const [meta] = await file.getMetadata();
      if (Number(meta.size) > maxBytes) throw new Error(`Arquivo enviado maior que o permitido: ${field}`);
      const [data] = await file.download();
      return data;
    } catch (err) {
      // Não enviado, já consumido por outra finalização ou apagado pela limpeza automática.
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async clearStaged(uploadId: string): Promise<void> {
    const [files] = await this.bucket.getFiles({ prefix: `uploads/${uploadId}/` });
    await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
  }
}

/** Validade dos links de envio. */
const UPLOAD_URL_TTL_MS = 15 * 60_000;

const isNotFound = (err: unknown) => (err as { code?: number }).code === 404;
