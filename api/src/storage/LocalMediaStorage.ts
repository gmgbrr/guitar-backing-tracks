import fs from 'node:fs/promises';
import path from 'node:path';
import type { UploadField } from '@backing-tracks/shared';
import type { MediaStorage, UploadTarget } from './MediaStorage.js';

export class LocalMediaStorage implements MediaStorage {
  constructor(private readonly songsDir: string) {}

  /** Caminho do arquivo garantidamente dentro de data/songs/<id>/ (bloqueia "../"). */
  private pathOf(songId: string, file: string): string {
    const songDir = path.resolve(this.songsDir, songId);
    const full = path.resolve(songDir, file);
    if (path.dirname(songDir) !== path.resolve(this.songsDir) || !full.startsWith(songDir + path.sep)) {
      throw new Error(`Caminho de mídia inválido: ${songId}/${file}`);
    }
    return full;
  }

  async getUrl(songId: string, file: string): Promise<string> {
    const filePath = file.split('/').map(encodeURIComponent).join('/');
    const url = `/media/${encodeURIComponent(songId)}/${filePath}`;
    // Versão = data de modificação: um arquivo substituído ganha URL nova
    // e o navegador não reaproveita a cópia antiga do cache.
    try {
      const { mtimeMs } = await fs.stat(this.pathOf(songId, file));
      return `${url}?v=${Math.floor(mtimeMs).toString(36)}`;
    } catch {
      return url;
    }
  }

  async put(songId: string, file: string, data: Buffer): Promise<void> {
    const full = this.pathOf(songId, file);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async remove(songId: string, files: string[]): Promise<void> {
    await Promise.all(files.map((f) => fs.rm(this.pathOf(songId, f), { force: true })));
  }

  // ---- área temporária: data/uploads/<uploadId>/<campo>, recebida pela rota PUT /api/uploads/... ----

  private get stagingDir() {
    return path.join(path.dirname(path.resolve(this.songsDir)), 'uploads');
  }

  private stagedPath(uploadId: string, field?: UploadField) {
    if (!UPLOAD_ID_RE.test(uploadId)) throw new Error('uploadId inválido');
    const dir = path.join(this.stagingDir, uploadId);
    return field ? path.join(dir, field) : dir;
  }

  async createUploadTarget(uploadId: string, field: UploadField): Promise<UploadTarget> {
    this.stagedPath(uploadId, field); // valida
    return {
      url: `/api/uploads/${uploadId}/${field}`,
      headers: { 'Content-Type': 'application/octet-stream' },
    };
  }

  /** Grava o que o navegador enviou (chamado pela rota local de PUT). */
  async writeStaged(uploadId: string, field: UploadField, data: Buffer): Promise<void> {
    const full = this.stagedPath(uploadId, field);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async readStaged(uploadId: string, field: UploadField, maxBytes: number): Promise<Buffer | null> {
    const full = this.stagedPath(uploadId, field);
    try {
      const { size } = await fs.stat(full);
      if (size > maxBytes) throw new Error(`Arquivo enviado maior que o permitido: ${field}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    return fs.readFile(full);
  }

  async clearStaged(uploadId: string): Promise<void> {
    await fs.rm(this.stagedPath(uploadId), { recursive: true, force: true });
  }
}

/** uploadId é um UUID gerado pelo servidor. */
export const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
