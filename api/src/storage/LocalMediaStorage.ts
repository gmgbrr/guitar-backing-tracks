import fs from 'node:fs/promises';
import path from 'node:path';
import type { MediaStorage } from './MediaStorage.js';

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
}
