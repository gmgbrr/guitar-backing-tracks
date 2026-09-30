import fs from 'node:fs/promises';
import path from 'node:path';
import type { MediaStorage } from './MediaStorage.js';

export class LocalMediaStorage implements MediaStorage {
  constructor(private readonly songsDir: string) {}

  async getUrl(songId: string, file: string): Promise<string> {
    const filePath = file.split('/').map(encodeURIComponent).join('/');
    const url = `/media/${encodeURIComponent(songId)}/${filePath}`;
    // Versão = data de modificação: um arquivo regerado (ex.: tablatura) ganha URL nova
    // e o navegador não reaproveita a cópia antiga do cache.
    try {
      const { mtimeMs } = await fs.stat(path.join(this.songsDir, songId, file));
      return `${url}?v=${Math.floor(mtimeMs).toString(36)}`;
    } catch {
      return url;
    }
  }
}
