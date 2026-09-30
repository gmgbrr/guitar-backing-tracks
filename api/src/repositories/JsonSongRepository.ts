import fs from 'node:fs/promises';
import path from 'node:path';
import type { SongRecord } from '@backing-tracks/shared';
import { isValidSongId, type SongRepository } from './SongRepository.js';

/** Lê data/songs/<id>/song.json. */
export class JsonSongRepository implements SongRepository {
  constructor(private readonly songsDir: string) {}

  async list(): Promise<SongRecord[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.songsDir);
    } catch {
      return [];
    }
    const songs = await Promise.all(entries.map((id) => this.get(id)));
    return songs
      .filter((s): s is SongRecord => s !== undefined)
      .sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  }

  async get(id: string): Promise<SongRecord | undefined> {
    if (!isValidSongId(id)) return undefined;
    try {
      const raw = await fs.readFile(this.fileOf(id), 'utf8');
      return JSON.parse(raw) as SongRecord;
    } catch {
      return undefined;
    }
  }

  async create(song: SongRecord): Promise<boolean> {
    if (!isValidSongId(song.id)) throw new Error(`Id inválido: ${song.id}`);
    await fs.mkdir(path.dirname(this.fileOf(song.id)), { recursive: true });
    try {
      // 'wx': falha se o arquivo já existir → nunca sobrescreve outra música
      await fs.writeFile(this.fileOf(song.id), JSON.stringify(song, null, 2) + '\n', { flag: 'wx' });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw err;
    }
  }

  async update(id: string, patch: Partial<Omit<SongRecord, 'id'>>): Promise<SongRecord | undefined> {
    const song = await this.get(id);
    if (!song) return undefined;
    const updated = { ...song, ...patch, id };
    // Grava num temporário e renomeia, para não corromper o song.json se o processo cair no meio.
    const tmp = `${this.fileOf(id)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(updated, null, 2) + '\n');
    await fs.rename(tmp, this.fileOf(id));
    return updated;
  }

  private fileOf(id: string) {
    return path.join(this.songsDir, id, 'song.json');
  }
}
